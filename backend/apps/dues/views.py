"""
Views for the dues app.
"""

from django.utils import timezone
from django.db.models import Q
from rest_framework import generics, status, filters
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from django_filters.rest_framework import DjangoFilterBackend

from .models import Deposit, Due, MasavariPayment
from .serializers import DepositSerializer, DueSerializer, MasavariPaymentSerializer
from apps.accounts.permissions import IsAdminOrStaffOrReadOnly
from apps.members.views import get_default_masavari_amount_for_period



class DepositListCreateView(generics.ListCreateAPIView):
    """GET /api/deposits/ | POST — create deposit."""

    serializer_class = DepositSerializer
    permission_classes = [IsAuthenticated, IsAdminOrStaffOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['deposit_type', 'status']
    search_fields = ['member__full_name', 'member__member_no', 'receipt_no']

    def get_queryset(self):
        return Deposit.objects.select_related('member', 'recorded_by').all().order_by('-deposit_date')

    def perform_create(self, serializer):
        deposit = serializer.save(recorded_by=self.request.user)
        try:
            from apps.collections.models import DailyEntry
            DailyEntry.objects.create(
                deposit=deposit,
                date=deposit.deposit_date,
                entry_type='income',
                category='deposit',
                amount=deposit.amount,
                description=f"{deposit.get_deposit_type_display()} — Deposit received from {deposit.member.full_name} ({deposit.member.member_no})",
                member=deposit.member,
                payment_mode=deposit.payment_mode or 'cash',
                receipt_no=deposit.receipt_no or '',
                recorded_by=self.request.user,
            )
        except Exception:
            pass

        try:
            from apps.activities.models import ActivityLog
            ActivityLog.objects.create(
                member=deposit.member,
                activity_type='deposit_made',
                description=f"{deposit.get_deposit_type_display()} of ₹{deposit.amount} recorded.",
                amount=deposit.amount,
                reference_id=str(deposit.id),
                reference_type='Deposit',
                performed_by=self.request.user,
            )
        except Exception:
            pass



class DepositDetailView(generics.RetrieveUpdateAPIView):
    """GET/PUT /api/deposits/{id}/"""

    queryset = Deposit.objects.select_related('member')
    serializer_class = DepositSerializer
    permission_classes = [IsAuthenticated, IsAdminOrStaffOrReadOnly]


class DepositWithdrawView(APIView):
    """PATCH /api/deposits/{id}/withdraw/"""

    permission_classes = [IsAuthenticated, IsAdminOrStaffOrReadOnly]

    def patch(self, request, pk):
        try:
            deposit = Deposit.objects.get(pk=pk)
        except Deposit.DoesNotExist:
            return Response({'error': True, 'message': 'Deposit not found.'}, status=status.HTTP_404_NOT_FOUND)

        deposit.status = 'withdrawn'
        deposit.save()

        try:
            from apps.collections.models import DailyEntry
            DailyEntry.objects.create(
                deposit=deposit,
                date=timezone.now().date(),
                entry_type='expense',
                category='other_expense',
                amount=deposit.amount,
                description=f"Deposit Withdrawal — {deposit.get_deposit_type_display()} of ₹{deposit.amount} refunded to {deposit.member.full_name} ({deposit.member.member_no})",
                member=deposit.member,
                payment_mode='cash',
                recorded_by=request.user,
            )
        except Exception:
            pass

        try:
            from apps.activities.models import ActivityLog
            ActivityLog.objects.create(
                member=deposit.member,
                activity_type='deposit_withdrawn',
                description=f"Deposit of ₹{deposit.amount} withdrawn.",
                amount=deposit.amount,
                reference_id=str(deposit.id),
                reference_type='Deposit',
                performed_by=request.user,
            )
        except Exception:
            pass

        return Response({'message': 'Deposit marked as withdrawn.'})



class DueListCreateView(generics.ListCreateAPIView):
    """GET /api/dues/ | POST — create due."""

    serializer_class = DueSerializer
    permission_classes = [IsAuthenticated, IsAdminOrStaffOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['due_type']
    search_fields = ['member__full_name', 'member__member_no']
    ordering_fields = ['due_date', 'amount']

    def get_queryset(self):
        qs = Due.objects.select_related('member').all()
        status_filter = self.request.query_params.get('status')
        if status_filter == 'overdue':
            today = timezone.now().date()
            qs = qs.filter(status='pending', due_date__lt=today)
        elif status_filter:
            qs = qs.filter(status=status_filter)
        return qs.order_by('due_date')


class DueDetailView(generics.RetrieveUpdateAPIView):
    """GET/PUT /api/dues/{id}/"""

    queryset = Due.objects.select_related('member')
    serializer_class = DueSerializer
    permission_classes = [IsAuthenticated, IsAdminOrStaffOrReadOnly]


class DueMarkPaidView(APIView):
    """PATCH /api/dues/{id}/mark-paid/"""

    permission_classes = [IsAuthenticated, IsAdminOrStaffOrReadOnly]

    def patch(self, request, pk):
        try:
            due = Due.objects.get(pk=pk)
        except Due.DoesNotExist:
            return Response({'error': True, 'message': 'Due not found.'}, status=status.HTTP_404_NOT_FOUND)

        payment_mode = request.data.get('payment_mode', 'cash')
        receipt_no = request.data.get('receipt_no', '')
        paid_date = request.data.get('paid_date') or timezone.now().date()

        due.status = 'paid'
        due.paid_date = paid_date
        due.paid_amount = due.amount
        due.save()

        try:
            from apps.collections.models import DailyEntry
            DailyEntry.objects.create(
                due=due,
                date=due.paid_date,
                entry_type='income',
                category='due',
                amount=due.paid_amount or due.amount,
                description=f"Due Payment — {due.get_due_type_display()} for {due.member.full_name} ({due.member.member_no})",
                member=due.member,
                payment_mode=payment_mode,
                receipt_no=receipt_no,
                recorded_by=request.user,
            )
        except Exception:
            pass

        try:
            from apps.activities.models import ActivityLog
            ActivityLog.objects.create(
                member=due.member,
                activity_type='due_paid',
                description=f"Due ({due.get_due_type_display()}) of ₹{due.amount} marked as paid.",
                amount=due.amount,
                reference_id=str(due.id),
                reference_type='Due',
                performed_by=request.user,
            )
        except Exception:
            pass

        return Response({'message': 'Due marked as paid.'})



class DueOverdueView(generics.ListAPIView):
    """GET /api/dues/overdue/ — all overdue dues."""

    serializer_class = DueSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        today = timezone.now().date()
        return Due.objects.filter(
            status='pending',
            due_date__lt=today,
        ).select_related('member').order_by('due_date')


class MasavariListCreateView(generics.ListCreateAPIView):
    """GET /api/masavari/ | POST — record a masavari payment."""

    serializer_class = MasavariPaymentSerializer
    permission_classes = [IsAuthenticated, IsAdminOrStaffOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'year', 'month']
    search_fields = ['member__full_name', 'member__member_no', 'receipt_no']
    ordering_fields = ['year', 'month', 'paid_date']

    def get_queryset(self):
        qs = MasavariPayment.objects.select_related('member', 'recorded_by').all()
        member_id = self.request.query_params.get('member')
        if member_id:
            qs = qs.filter(member_id=member_id)
        year = self.request.query_params.get('year')
        if year:
            qs = qs.filter(year=year)
        return qs

    def create(self, request, *args, **kwargs):
        # Handle update_or_create to avoid unique constraint violations
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        member = serializer.validated_data.get('member')
        year = serializer.validated_data.get('year')
        month = serializer.validated_data.get('month')

        # Check if record already exists
        instance = MasavariPayment.objects.filter(member=member, year=year, month=month).first()
        if instance:
            # Update existing record
            serializer = self.get_serializer(instance, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            self.perform_update(serializer)
            return Response(serializer.data, status=status.HTTP_200_OK)

        # Otherwise create a new one
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def perform_create(self, serializer):
        payment = serializer.save(recorded_by=self.request.user)
        if payment.status == 'paid':
            self.log_activity(payment)
            self.record_daily_entry(payment)

    def perform_update(self, serializer):
        payment = serializer.save(recorded_by=self.request.user)
        if payment.status == 'paid':
            self.log_activity(payment)
            self.record_daily_entry(payment)

    def record_daily_entry(self, payment):
        try:
            from apps.collections.models import DailyEntry
            exists = DailyEntry.objects.filter(
                member=payment.member,
                category='masavari',
                date=payment.paid_date or timezone.now().date(),
                description__icontains=f"{payment.month}/{payment.year}"
            ).exists()
            if not exists:
                DailyEntry.objects.create(
                    date=payment.paid_date or timezone.now().date(),
                    entry_type='income',
                    category='masavari',
                    amount=payment.amount,
                    description=f"Masavari (Monthly Due) paid for {payment.month}/{payment.year} — ₹{payment.amount}.",
                    member=payment.member,
                    payment_mode=payment.payment_mode or 'cash',
                    receipt_no=payment.receipt_no or '',
                    recorded_by=self.request.user,
                )
        except Exception:
            pass

    def log_activity(self, payment):
        try:
            from apps.activities.models import ActivityLog
            ActivityLog.objects.create(
                member=payment.member,
                activity_type='masavari_paid',
                description=f"Masavari (Monthly Due) paid for {payment.month}/{payment.year} — ₹{payment.amount}.",
                amount=payment.amount,
                reference_id=str(payment.id),
                reference_type='MasavariPayment',
                performed_by=self.request.user,
            )
        except Exception:
            pass



class MasavariDetailView(generics.RetrieveUpdateAPIView):
    """GET/PUT /api/masavari/{id}/"""

    queryset = MasavariPayment.objects.select_related('member')
    serializer_class = MasavariPaymentSerializer
    permission_classes = [IsAuthenticated, IsAdminOrStaffOrReadOnly]


class MasavariMarkPaidView(APIView):
    """PATCH /api/masavari/{id}/mark-paid/"""

    permission_classes = [IsAuthenticated, IsAdminOrStaffOrReadOnly]

    def patch(self, request, pk):
        try:
            payment = MasavariPayment.objects.get(pk=pk)
        except MasavariPayment.DoesNotExist:
            return Response({'error': True, 'message': 'Payment not found.'}, status=status.HTTP_404_NOT_FOUND)

        payment.status = 'paid'
        payment.paid_date = request.data.get('paid_date') or timezone.now().date()
        payment.payment_mode = request.data.get('payment_mode', payment.payment_mode)
        payment.receipt_no = request.data.get('receipt_no', payment.receipt_no)
        payment.recorded_by = request.user
        payment.save()

        try:
            from apps.collections.models import DailyEntry
            exists = DailyEntry.objects.filter(
                member=payment.member,
                category='masavari',
                date=payment.paid_date,
                description__icontains=f"{payment.month}/{payment.year}"
            ).exists()
            if not exists:
                DailyEntry.objects.create(
                    date=payment.paid_date,
                    entry_type='income',
                    category='masavari',
                    amount=payment.amount,
                    description=f"Masavari (Monthly Due) paid for {payment.month}/{payment.year} — ₹{payment.amount}.",
                    member=payment.member,
                    payment_mode=payment.payment_mode or 'cash',
                    receipt_no=payment.receipt_no or '',
                    recorded_by=request.user,
                )
        except Exception:
            pass

        try:
            from apps.activities.models import ActivityLog
            ActivityLog.objects.create(
                member=payment.member,
                activity_type='masavari_paid',
                description=f"Masavari (Monthly Due) paid for {payment.month}/{payment.year} — ₹{payment.amount}.",
                amount=payment.amount,
                reference_id=str(payment.id),
                reference_type='MasavariPayment',
                performed_by=request.user,
            )
        except Exception:
            pass

        return Response({'message': 'Masavari payment marked as paid.'})



class MasavariDueListView(APIView):
    """GET /api/masavari/dues/ — computes all pending masavari dues across ALL active members.
    Returns unpaid months from joining_date up to current month for every active member,
    along with any DB-recorded pending/overdue entries.
    Supports ?year=2026 and ?member=<id> filters.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        from apps.members.models import Member
        from dateutil.relativedelta import relativedelta
        import datetime

        today = timezone.now().date()
        year_filter = request.query_params.get('year')
        member_filter = request.query_params.get('member')
        search = request.query_params.get('search', '')

        members_qs = Member.objects.filter(status__in=['active']).select_related()
        if member_filter:
            members_qs = members_qs.filter(pk=member_filter)
        if search:
            members_qs = members_qs.filter(
                Q(full_name__icontains=search) | Q(member_no__icontains=search)
            )

        # Pre-fetch all paid (year, month) by member to avoid N+1 queries
        paid_qs = MasavariPayment.objects.filter(status='paid')
        if year_filter:
            paid_qs = paid_qs.filter(year=year_filter)
        paid_set = {}  # {member_id: set of (year, month)}
        for p in paid_qs:
            paid_set.setdefault(p.member_id, set()).add((p.year, p.month))

        # Pre-fetch all existing DB records (pending/overdue) by member
        existing_qs = MasavariPayment.objects.filter(status__in=['pending', 'overdue'])
        if year_filter:
            existing_qs = existing_qs.filter(year=year_filter)
        existing_map = {}  # {(member_id, year, month): record}
        for rec in existing_qs:
            existing_map[(rec.member_id, rec.year, rec.month)] = rec

        dues_list = []

        for member in members_qs:
            if not member.joining_date:
                continue

            start = member.joining_date.replace(day=1)
            if year_filter:
                try:
                    yr = int(year_filter)
                    # Compute range within the filter year only
                    range_start = max(start, datetime.date(yr, 1, 1))
                    range_end = min(today.replace(day=1), datetime.date(yr, 12, 1))
                except (ValueError, TypeError):
                    range_start, range_end = start, today.replace(day=1)
            else:
                range_start = start
                range_end = today.replace(day=1)

            curr = range_start
            while curr <= range_end:
                yr, mo = curr.year, curr.month
                member_paid = paid_set.get(member.id, set())
                if (yr, mo) not in member_paid:
                    due_date = curr.replace(day=5)
                    is_overdue = due_date < today
                    days_overdue = (today - due_date).days if is_overdue else 0
                    existing = existing_map.get((member.id, yr, mo))
                    default_amount = get_default_masavari_amount_for_period(yr, mo, member)
                    amount_val = existing.amount if (existing and existing.amount) else default_amount
                    dues_list.append({
                        'id': existing.id if existing else None,
                        'member': member.id,
                        'member_name': member.full_name,
                        'member_no': member.member_no,
                        'month': mo,
                        'year': yr,
                        'amount': str(amount_val),
                        'due_date': due_date.isoformat(),
                        'paid_date': None,
                        'payment_mode': existing.payment_mode if existing else 'cash',
                        'receipt_no': existing.receipt_no if existing else '',
                        'status': existing.status if existing else ('overdue' if is_overdue else 'pending'),
                        'is_overdue': is_overdue,
                        'days_overdue': days_overdue,
                        'month_label': curr.strftime('%B %Y'),
                    })
                curr += relativedelta(months=1)


        # Sort: overdue first then pending, then by year/month
        dues_list.sort(key=lambda x: (not x['is_overdue'], x['year'], x['month']))

        return Response({'results': dues_list, 'count': len(dues_list)})


class MasavariOverdueView(generics.ListAPIView):
    """GET /api/masavari/overdue/ — all overdue masavari payments."""

    serializer_class = MasavariPaymentSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        today = timezone.now().date()
        return MasavariPayment.objects.filter(
            status='pending',
            due_date__lt=today,
        ).select_related('member').order_by('due_date')
