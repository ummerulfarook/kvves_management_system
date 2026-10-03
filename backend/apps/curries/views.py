"""
Views for the curries app.
"""

from django.utils import timezone
from rest_framework import generics, status, filters
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from dateutil.relativedelta import relativedelta

from .models import Curry, CurryParticipant, CurryPayment
from .serializers import (
    CurrySerializer, CurryListSerializer,
    CurryParticipantSerializer, CurryPaymentSerializer,
    CurryPaymentOverdueSerializer,
)
from apps.accounts.permissions import IsAdminOrStaffOrReadOnly


class CurryListCreateView(generics.ListCreateAPIView):
    """GET /api/curries/ | POST — create curry group."""
    permission_classes = [IsAuthenticated, IsAdminOrStaffOrReadOnly]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['curry_no', 'name']
    ordering_fields = ['start_date', 'curry_no', 'status']

    def get_queryset(self):
        qs = Curry.objects.all()
        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)
        return qs

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return CurrySerializer
        return CurryListSerializer


class CurryDetailView(generics.RetrieveUpdateDestroyAPIView):
    """GET/PUT /api/curries/{id}/ | DELETE."""
    queryset = Curry.objects.prefetch_related('participants__member', 'participants__payments')
    permission_classes = [IsAuthenticated, IsAdminOrStaffOrReadOnly]
    serializer_class = CurrySerializer

    def destroy(self, request, *args, **kwargs):
        curry = self.get_object()
        curry.status = 'terminated'
        curry.save()
        return Response({'message': 'Curry terminated.'}, status=status.HTTP_200_OK)


class CurryParticipantListView(generics.ListAPIView):
    """GET /api/curries/{id}/participants/"""
    serializer_class = CurryParticipantSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return CurryParticipant.objects.filter(
            curry_id=self.kwargs['curry_pk']
        ).select_related('member', 'curry').prefetch_related('payments')


class CurryEnrollView(generics.CreateAPIView):
    """POST /api/curries/{id}/enroll/ — add participant (member or non-member)."""
    serializer_class = CurryParticipantSerializer
    permission_classes = [IsAuthenticated, IsAdminOrStaffOrReadOnly]

    def perform_create(self, serializer):
        curry = Curry.objects.get(pk=self.kwargs['curry_pk'])
        participant = serializer.save(curry=curry)

        # Auto-generate payment schedule
        start = curry.start_date
        for month in range(1, curry.duration_months + 1):
            due = start + relativedelta(months=month - 1)
            CurryPayment.objects.create(
                participant=participant,
                month_number=month,
                amount=curry.monthly_amount,
                due_date=due,
                is_paid=False,
            )

        # Activity log
        try:
            from apps.activities.models import ActivityLog
            if participant.is_member and participant.member:
                ActivityLog.objects.create(
                    member=participant.member,
                    activity_type='curry_enrolled',
                    description=f"Enrolled in curry {curry.curry_no} — Ticket {participant.ticket_number}.",
                    reference_id=str(participant.id),
                    reference_type='CurryParticipant',
                    performed_by=self.request.user,
                )
        except Exception:
            pass


class CurryPaymentListCreateView(generics.ListCreateAPIView):
    """GET/POST /api/curry-participants/{pid}/payments/"""
    serializer_class = CurryPaymentSerializer
    permission_classes = [IsAuthenticated, IsAdminOrStaffOrReadOnly]

    def get_queryset(self):
        return CurryPayment.objects.filter(
            participant_id=self.kwargs['participant_pk']
        ).order_by('month_number')

    def perform_create(self, serializer):
        participant = CurryParticipant.objects.get(pk=self.kwargs['participant_pk'])
        payment = serializer.save(participant=participant, recorded_by=self.request.user)
        payment.is_paid = True
        payment.paid_date = payment.paid_date or timezone.now().date()
        payment.save()

        try:
            from apps.collections.models import DailyEntry
            name = participant.display_name or (participant.member.full_name if participant.member else 'Participant')
            DailyEntry.objects.create(
                curry_payment=payment,
                date=payment.paid_date,
                entry_type='income',
                category='curry_payment',
                amount=payment.amount,
                description=f"Curry Payment — Month {payment.month_number} for {name} (Curry {participant.curry.curry_no})",
                member=participant.member if participant.is_member else None,
                payment_mode=payment.payment_mode or 'cash',
                receipt_no=payment.receipt_no or '',
                recorded_by=self.request.user,
            )
        except Exception:
            pass

        try:
            from apps.activities.models import ActivityLog
            if participant.is_member and participant.member:
                ActivityLog.objects.create(
                    member=participant.member,
                    activity_type='curry_payment',
                    description=f"Curry payment Month {payment.month_number} recorded for ₹{payment.amount}.",
                    amount=payment.amount,
                    reference_id=str(payment.id),
                    reference_type='CurryPayment',
                    performed_by=self.request.user,
                )
        except Exception:
            pass



class CurryOverdueView(generics.ListAPIView):
    """GET /api/curries/overdue/ — all overdue curry payments."""
    serializer_class = CurryPaymentOverdueSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        today = timezone.now().date()
        return CurryPayment.objects.filter(
            is_paid=False,
            due_date__lt=today,
        ).select_related(
            'participant__member',
            'participant__curry',
        ).order_by('due_date')


class CurryBulkPaymentView(APIView):
    """POST /api/curries/{id}/bulk-pay/ — record multiple curry payments."""
    permission_classes = [IsAuthenticated, IsAdminOrStaffOrReadOnly]

    def post(self, request, curry_pk):
        payments_data = request.data.get('payments', [])
        if not payments_data:
            return Response({'error': True, 'message': 'No payments provided.'}, status=400)

        recorded = []
        errors = []
        for item in payments_data:
            try:
                payment = CurryPayment.objects.get(
                    participant_id=item['participant_id'],
                    month_number=item['month_number'],
                )
                if not payment.is_paid:
                    payment.is_paid = True
                    payment.paid_date = timezone.now().date()
                    payment.payment_mode = item.get('payment_mode', 'cash')
                    payment.receipt_no = item.get('receipt_no', '')
                    payment.recorded_by = request.user
                    payment.save()
                    recorded.append(payment.id)

                    try:
                        from apps.collections.models import DailyEntry
                        part = payment.participant
                        name = part.display_name or (part.member.full_name if part.member else 'Participant')
                        DailyEntry.objects.create(
                            curry_payment=payment,
                            date=payment.paid_date,
                            entry_type='income',
                            category='curry_payment',
                            amount=payment.amount,
                            description=f"Curry Payment (Bulk) — Month {payment.month_number} for {name} (Curry {part.curry.curry_no})",
                            member=part.member if part.is_member else None,
                            payment_mode=payment.payment_mode,
                            receipt_no=payment.receipt_no,
                            recorded_by=request.user,
                        )
                    except Exception:
                        pass
            except CurryPayment.DoesNotExist:
                errors.append(f"Payment not found: participant {item.get('participant_id')} month {item.get('month_number')}")

        return Response({'recorded': len(recorded), 'errors': errors})



class CurryStatsView(APIView):
    """GET /api/curries/stats/ — quick stats for dashboard."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        today = timezone.now().date()
        total = Curry.objects.count()
        active = Curry.objects.filter(status='active').count()
        completed = Curry.objects.filter(status='completed').count()
        participants = CurryParticipant.objects.filter(status='active').count()
        overdue = CurryPayment.objects.filter(is_paid=False, due_date__lt=today).count()
        return Response({
            'total_curries': total,
            'active_curries': active,
            'completed_curries': completed,
            'total_active_participants': participants,
            'overdue_payments': overdue,
        })
