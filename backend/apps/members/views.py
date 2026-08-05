"""
Views for the members app.
"""

from decimal import Decimal
from django.utils import timezone
from django.db.models import Sum, Count, Q
from rest_framework import generics, status, filters
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from django_filters.rest_framework import DjangoFilterBackend

from .models import Member, Allowance
from .serializers import (
    MemberListSerializer,
    MemberDetailSerializer,
    MemberPhotoSerializer,
    AllowanceSerializer,
)
from .filters import MemberFilter
from apps.accounts.permissions import IsAdminOrStaffOrReadOnly, CanDeleteMember


class NumericMemberNoOrderingFilter(filters.OrderingFilter):
    def filter_queryset(self, request, queryset, view):
        ordering = self.get_ordering(request, queryset, view)
        if ordering:
            new_ordering = []
            annotate_int = False
            for field in ordering:
                if field == 'member_no':
                    new_ordering.append('member_no_int')
                    annotate_int = True
                elif field == '-member_no':
                    new_ordering.append('-member_no_int')
                    annotate_int = True
                else:
                    new_ordering.append(field)
            if annotate_int:
                from django.db.models.functions import Cast
                from django.db.models import IntegerField
                queryset = queryset.annotate(
                    member_no_int=Cast('member_no', output_field=IntegerField())
                )
            return queryset.order_by(*new_ordering)
        return queryset


class MemberListCreateView(generics.ListCreateAPIView):
    """GET /api/members/ — list with search/filter; POST — create."""

    permission_classes = [IsAuthenticated, IsAdminOrStaffOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, NumericMemberNoOrderingFilter]
    filterset_class = MemberFilter
    search_fields = ['full_name', 'phone', 'member_no', 'email', 'alternate_phone']
    ordering_fields = ['member_no', 'full_name', 'joining_date', 'created_at']
    ordering = ['member_no']

    def get_queryset(self):
        try:
            from .utils import check_member_masavari_statuses
            check_member_masavari_statuses()
        except Exception:
            pass
        queryset = Member.objects.select_related('created_by').all()

        search_term = self.request.query_params.get('search', '').strip()
        if search_term:
            q_exact = Q(member_no__iexact=search_term)
            if search_term.isdigit():
                val_int = int(search_term)
                q_exact |= Q(member_no__iexact=str(val_int))
                q_exact |= Q(member_no__iexact=f"MEM{val_int}")
                q_exact |= Q(member_no__iexact=f"MEM{str(val_int).zfill(3)}")
                q_exact |= Q(member_no__iexact=str(val_int).zfill(3))
            
            exact_qs = queryset.filter(q_exact)
            if exact_qs.exists():
                return exact_qs

        return queryset

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return MemberDetailSerializer
        return MemberListSerializer

    def perform_create(self, serializer):
        member = serializer.save(created_by=self.request.user)
        # Signal will handle activity log


class MemberDetailView(generics.RetrieveUpdateDestroyAPIView):
    """GET/PUT/PATCH/DELETE /api/members/{id}/"""

    queryset = Member.objects.select_related('created_by').all()
    serializer_class = MemberDetailSerializer
    permission_classes = [IsAuthenticated, IsAdminOrStaffOrReadOnly]

    def get_object(self):
        try:
            from .utils import check_member_masavari_statuses
            check_member_masavari_statuses()
        except Exception:
            pass
        return super().get_object()

    def destroy(self, request, *args, **kwargs):
        """Delete member: supports soft delete (default) and hard delete."""
        member = self.get_object()
        hard_delete = request.query_params.get('hard_delete', 'false').lower() == 'true'

        if hard_delete:
            # Check permissions for hard delete
            if request.user.role != 'admin':
                return Response(
                    {'error': True, 'message': 'Only administrators can permanently delete members.'},
                    status=status.HTTP_403_FORBIDDEN
                )
            
            from django.db.models import ProtectedError
            try:
                member_no = member.member_no
                full_name = member.full_name
                member.delete()
                
                # Activity log
                try:
                    from apps.activities.models import ActivityLog
                    ActivityLog.objects.create(
                        activity_type='member_deleted',
                        description=f"Member {member_no} - {full_name} was permanently deleted.",
                        performed_by=request.user,
                    )
                except Exception:
                    pass

                return Response({'message': 'Member permanently deleted successfully.'}, status=status.HTTP_200_OK)
            except ProtectedError as e:
                protected_objects = e.protected_objects
                model_names = {obj._meta.verbose_name.title() for obj in protected_objects}
                return Response({
                    'error': True,
                    'message': f"Cannot permanently delete this member because they have associated records in: {', '.join(model_names)}."
                }, status=status.HTTP_400_BAD_REQUEST)
        else:
            # Soft delete
            if member.status == 'inactive':
                return Response(
                    {'error': True, 'message': 'Member is already inactive.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            # Only admin can soft-delete
            if request.user.role != 'admin':
                return Response(
                    {'error': True, 'message': 'Only administrators can deactivate members.'},
                    status=status.HTTP_403_FORBIDDEN
                )
            member.status = 'inactive'
            member.save()
            return Response({'message': 'Member deactivated successfully.'}, status=status.HTTP_200_OK)


class MemberSummaryView(APIView):
    """GET /api/members/{id}/summary/ — aggregated financial summary."""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            member = Member.objects.get(pk=pk)
        except Member.DoesNotExist:
            return Response({'error': True, 'message': 'Member not found.'}, status=status.HTTP_404_NOT_FOUND)

        today = timezone.now().date()

        # Chit enrollments (welfare)
        active_chits = member.chit_enrollments.filter(status='active').count()
        chit_paid_agg = member.chit_enrollments.aggregate(
            total_paid=Sum('payments__amount_paid', filter=Q(payments__is_paid=True))
        )
        total_chit_paid = chit_paid_agg['total_paid'] or Decimal('0.00')

        # Loans
        active_loans = member.loans.filter(status='active').count()
        loan_outstanding_agg = member.loans.filter(
            status__in=['active', 'pending']
        ).aggregate(total=Sum('outstanding_balance'))
        total_loan_outstanding = loan_outstanding_agg['total'] or Decimal('0.00')

        # Guarantor for loans
        from apps.loans.models import Loan as LoanModel
        guarantor_loans_count = LoanModel.objects.filter(
            guarantor=member, status='active'
        ).count()

        # Guarantor for welfare
        from apps.chits.models import ChitEnrollment as ChitEnrollmentModel
        guarantor_welfares_count = ChitEnrollmentModel.objects.filter(
            Q(guarantor1=member) | Q(guarantor2=member), status__in=['active', 'awarded']
        ).count()

        # Dues
        pending_dues = member.dues.filter(
            Q(status='pending') | Q(status='overdue')
        ).count()
        due_amount_agg = member.dues.filter(
            Q(status='pending') | Q(status='overdue')
        ).aggregate(total=Sum('amount'))
        total_due_amount = due_amount_agg['total'] or Decimal('0.00')

        return Response({
            'member_id': member.id,
            'member_no': member.member_no,
            'full_name': member.full_name,
            'status': member.status,
            'active_chits': active_chits,
            'total_chit_paid': str(total_chit_paid),
            'active_loans': active_loans,
            'total_loan_outstanding': str(total_loan_outstanding),
            'guarantor_loans_count': guarantor_loans_count,
            'guarantor_welfares_count': guarantor_welfares_count,
            'pending_dues': pending_dues,
            'total_due_amount': str(total_due_amount),
        })


class MemberActivitiesView(generics.ListAPIView):
    """GET /api/members/{id}/activities/ — paginated activity timeline."""

    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        from apps.activities.models import ActivityLog
        return ActivityLog.objects.filter(
            member_id=self.kwargs['pk']
        ).select_related('performed_by').order_by('-timestamp')

    def get_serializer_class(self):
        from apps.activities.serializers import ActivityLogSerializer
        return ActivityLogSerializer


class MemberPhotoView(APIView):
    """POST /api/members/{id}/photo/ — upload or replace member photo."""

    permission_classes = [IsAuthenticated, IsAdminOrStaffOrReadOnly]

    def post(self, request, pk):
        try:
            member = Member.objects.get(pk=pk)
        except Member.DoesNotExist:
            return Response({'error': True, 'message': 'Member not found.'}, status=status.HTTP_404_NOT_FOUND)

        serializer = MemberPhotoSerializer(member, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response({'message': 'Photo uploaded successfully.', 'photo': member.photo.url if member.photo else None})
        return Response(
            {'error': True, 'message': 'Invalid photo.', 'details': serializer.errors},
            status=status.HTTP_400_BAD_REQUEST
        )


class MemberChitsView(generics.ListAPIView):
    """GET /api/members/{id}/chits/ — all chit enrollments for a member."""

    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        from apps.chits.models import ChitEnrollment
        return ChitEnrollment.objects.filter(
            member_id=self.kwargs['pk']
        ).select_related('chit_group')

    def get_serializer_class(self):
        from apps.chits.serializers import ChitEnrollmentSerializer
        return ChitEnrollmentSerializer


class MemberLoansView(generics.ListAPIView):
    """GET /api/members/{id}/loans/ — all loans for a member."""

    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        from apps.loans.models import Loan
        return Loan.objects.filter(member_id=self.kwargs['pk'])

    def get_serializer_class(self):
        from apps.loans.serializers import LoanSerializer
        return LoanSerializer


class MemberDuesView(APIView):
    """GET /api/members/{id}/dues/ — combined dues history and summary for a member."""
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        from apps.members.models import Member
        from apps.dues.models import Due, MasavariPayment
        from apps.dues.serializers import DueSerializer
        from apps.loans.models import LoanRepayment
        from apps.chits.models import ChitPayment
        import datetime
        from dateutil.relativedelta import relativedelta
        from decimal import Decimal
        from django.utils import timezone
        from django.db.models import Sum

        try:
            member = Member.objects.get(pk=pk)
        except Member.DoesNotExist:
            return Response({'error': True, 'message': 'Member not found'}, status=404)

        today = timezone.now().date()

        # 1. Standard Dues pending
        standard_dues_qs = Due.objects.filter(member=member, status='pending')
        standard_dues_total = standard_dues_qs.aggregate(total=Sum('amount'))['total'] or Decimal('0.00')

        # 2. Loan repayments pending/overdue (due_date <= today)
        loans_pending_qs = LoanRepayment.objects.filter(
            loan__member=member,
            loan__status='active',
            is_paid=False,
            due_date__lte=today
        )
        loans_pending_total = loans_pending_qs.aggregate(total=Sum('amount_paid'))['total'] or Decimal('0.00')

        # 3. Welfare (chits) payments pending/overdue (due_date <= today)
        welfares_pending_qs = ChitPayment.objects.filter(
            enrollment__member=member,
            enrollment__status='active',
            is_paid=False,
            due_date__lte=today
        )
        welfares_pending_agg = welfares_pending_qs.aggregate(
            total_inst=Sum('installment_amount'),
            total_paid=Sum('amount_paid')
        )
        welfares_pending_total = (welfares_pending_agg['total_inst'] or Decimal('0.00')) - (welfares_pending_agg['total_paid'] or Decimal('0.00'))

        # 4. Masavari pending months
        payments_qs = MasavariPayment.objects.filter(member=member)
        last_paid = payments_qs.filter(status='paid').order_by('-year', '-month').first()
        default_amount = last_paid.amount if last_paid else Decimal('50.00')

        start_date = member.joining_date
        curr = start_date.replace(day=1)
        end = today.replace(day=1)
        paid_set = set(payments_qs.filter(status='paid').values_list('year', 'month'))

        masavari_pending_count = 0
        while curr <= end:
            if (curr.year, curr.month) not in paid_set:
                masavari_pending_count += 1
            curr += relativedelta(months=1)

        masavari_pending_total = masavari_pending_count * default_amount

        total_combined_dues = standard_dues_total + loans_pending_total + welfares_pending_total + masavari_pending_total

        # History: list of all dues (standard dues + masavari)
        dues = Due.objects.filter(member_id=pk).order_by('due_date')
        dues_data = DueSerializer(dues, many=True).data

        masavari_history = MasavariPayment.objects.filter(member_id=pk).order_by('due_date')
        for m in masavari_history:
            dues_data.append({
                'id': f"masavari-{m.id}",
                'due_type': "masavari",
                'amount': str(m.amount),
                'due_date': m.due_date.isoformat() if m.due_date else None,
                'status': m.status,
                'paid_date': m.paid_date.isoformat() if m.paid_date else None,
                'is_overdue': m.is_overdue,
                'days_overdue': (today - m.due_date).days if m.is_overdue else 0,
                'description': f"Masavari for {m.month}/{m.year}",
                'is_paid': m.status == 'paid',
            })

        return Response({
            'summary': {
                'standard_dues_pending': str(standard_dues_total),
                'loans_pending': str(loans_pending_total),
                'welfares_pending': str(welfares_pending_total),
                'masavari_pending': str(masavari_pending_total),
                'masavari_pending_count': masavari_pending_count,
                'total_combined_dues': str(total_combined_dues),
            },
            'history': dues_data
        })


class MemberDepositsView(generics.ListAPIView):
    """GET /api/members/{id}/deposits/ — deposits for a member."""

    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        from apps.dues.models import Deposit
        return Deposit.objects.filter(member_id=self.kwargs['pk']).order_by('-deposit_date')

    def get_serializer_class(self):
        from apps.dues.serializers import DepositSerializer
        return DepositSerializer


class MemberGuarantorLoansView(generics.ListAPIView):
    """GET /api/members/{id}/guarantor-loans/ — loans where this member is a guarantor."""

    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        from apps.loans.models import Loan
        from django.db.models import Q
        return Loan.objects.filter(
            Q(guarantor_id=self.kwargs['pk']) | Q(guarantor2_id=self.kwargs['pk'])
        ).select_related('member').order_by('-created_at')

    def get_serializer_class(self):
        from apps.loans.serializers import LoanSerializer
        return LoanSerializer


class MemberGuarantorWelfareView(generics.ListAPIView):
    """GET /api/members/{id}/guarantor-welfare/ — welfare enrollments where this member is a guarantor."""

    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        from apps.chits.models import ChitEnrollment
        from django.db.models import Q
        return ChitEnrollment.objects.filter(
            Q(guarantor1_id=self.kwargs['pk']) | Q(guarantor2_id=self.kwargs['pk'])
        ).select_related('member', 'chit_group').order_by('-created_at')

    def get_serializer_class(self):
        from apps.chits.serializers import ChitEnrollmentSerializer
        return ChitEnrollmentSerializer


class MemberMasavariView(APIView):
    """GET /api/members/{id}/masavari/ — masavari payment history and pending months for a member."""
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        from apps.members.models import Member
        from apps.dues.models import MasavariPayment
        from apps.dues.serializers import MasavariPaymentSerializer
        import datetime
        from dateutil.relativedelta import relativedelta
        from decimal import Decimal
        from django.utils import timezone

        try:
            member = Member.objects.get(pk=pk)
        except Member.DoesNotExist:
            return Response({'error': True, 'message': 'Member not found'}, status=404)

        # 1. Fetch all paid/pending records from database
        payments = MasavariPayment.objects.filter(member=member).order_by('-year', '-month')
        payments_data = MasavariPaymentSerializer(payments, many=True).data

        # Determine standard rate from member profile
        default_amount = member.masavari_amount

        # 2. Compute all months from joining_date to current month
        today = timezone.now().date()
        start_date = member.joining_date
        
        # We start from joining_date's month
        curr = start_date.replace(day=1)
        end = today.replace(day=1)

        # Create a set of (year, month) that are already recorded as paid in the database
        paid_set = set(
            payments.filter(status='paid').values_list('year', 'month')
        )

        pending_list = []
        while curr <= end:
            year_month = (curr.year, curr.month)
            if year_month not in paid_set:
                existing_pending = payments.filter(year=curr.year, month=curr.month, status='pending').first()
                due_date = curr + relativedelta(day=5)
                
                if existing_pending:
                    pending_list.append(MasavariPaymentSerializer(existing_pending).data)
                else:
                    pending_list.append({
                        'id': None,
                        'member': member.id,
                        'member_name': member.full_name,
                        'member_no': member.member_no,
                        'amount': str(default_amount),
                        'month': curr.month,
                        'year': curr.year,
                        'due_date': due_date.isoformat(),
                        'status': 'pending',
                        'month_label': curr.strftime('%B %Y'),
                        'is_overdue': due_date < today,
                        'days_overdue': (today - due_date).days if due_date < today else 0,
                    })
            curr += relativedelta(months=1)

        pending_list.sort(key=lambda x: (x['year'], x['month']), reverse=False)

        return Response({
            'history': payments_data,
            'pending': pending_list,
            'default_amount': str(default_amount)
        })


class MemberAllowancesView(generics.ListCreateAPIView):
    """GET /api/members/{id}/allowances/ | POST — create allowance for a member."""
    serializer_class = AllowanceSerializer
    permission_classes = [IsAuthenticated, IsAdminOrStaffOrReadOnly]

    def get_queryset(self):
        return Allowance.objects.filter(member_id=self.kwargs['pk']).order_by('-paid_date')

    def perform_create(self, serializer):
        serializer.save(member_id=self.kwargs['pk'])


class AllowanceDetailView(generics.RetrieveUpdateDestroyAPIView):
    """GET/PUT/PATCH/DELETE /api/allowances/{id}/"""
    queryset = Allowance.objects.all()
    serializer_class = AllowanceSerializer
    permission_classes = [IsAuthenticated, IsAdminOrStaffOrReadOnly]


class MemberClearDuesView(APIView):
    """POST /api/members/{id}/clear-dues/ — clear all pending dues (standard dues, overdue loans, overdue welfares, pending masavari) up to today."""
    permission_classes = [IsAuthenticated, IsAdminOrStaffOrReadOnly]

    def post(self, request, pk):
        from apps.members.models import Member
        from apps.dues.models import Due, MasavariPayment
        from apps.loans.models import LoanRepayment
        from apps.chits.models import ChitPayment
        from django.db import transaction
        import datetime
        from dateutil.relativedelta import relativedelta
        from decimal import Decimal
        from django.utils import timezone

        try:
            member = Member.objects.get(pk=pk)
        except Member.DoesNotExist:
            return Response({'error': True, 'message': 'Member not found'}, status=404)

        payment_mode = request.data.get('payment_mode', 'cash')
        receipt_no = request.data.get('receipt_no', '')
        remarks = request.data.get('remarks', 'Bulk cleared dues.')
        today = timezone.now().date()

        with transaction.atomic():
            # 1. Clear standard dues
            standard_dues = Due.objects.filter(member=member, status='pending')
            for d in standard_dues:
                d.status = 'paid'
                d.paid_date = today
                d.paid_amount = d.amount
                d.remarks = f"{d.remarks}\nCleared via bulk action."
                d.save()

            # 2. Clear overdue loan repayments
            loans_pending = LoanRepayment.objects.filter(
                loan__member=member,
                loan__status='active',
                is_paid=False,
                due_date__lte=today
            )
            for r in loans_pending:
                r.is_paid = True
                r.paid_date = today
                r.payment_mode = payment_mode
                r.receipt_no = receipt_no
                r.remarks = f"{r.remarks}\nCleared via bulk action."
                r.save()

            # 3. Clear overdue welfare payments
            welfares_pending = ChitPayment.objects.filter(
                enrollment__member=member,
                enrollment__status='active',
                is_paid=False,
                due_date__lte=today
            )
            for p in welfares_pending:
                needed = p.installment_amount - p.amount_paid
                p.amount_paid = p.installment_amount
                p.is_paid = True
                p.paid_date = today
                p.payment_mode = payment_mode
                p.receipt_no = receipt_no
                p.remarks = f"{p.remarks}\nCleared via bulk action."
                p.save()

                # Create DailyEntry manually
                from apps.collections.models import DailyEntry
                DailyEntry.objects.create(
                    chit_payment=p,
                    date=today,
                    entry_type='income',
                    category='welfare_payment',
                    amount=needed,
                    description=f"Welfare Payment — Month {p.month_number} for {member.full_name}",
                    member=member,
                    payment_mode=payment_mode,
                    recorded_by=request.user,
                )

            # 4. Clear pending masavari payments
            payments_qs = MasavariPayment.objects.filter(member=member)
            default_amount = member.masavari_amount

            start_date = member.joining_date
            curr = start_date.replace(day=1)
            end = today.replace(day=1)
            paid_set = set(payments_qs.filter(status='paid').values_list('year', 'month'))

            while curr <= end:
                if (curr.year, curr.month) not in paid_set:
                    mas_payment, created = MasavariPayment.objects.get_or_create(
                        member=member,
                        year=curr.year,
                        month=curr.month,
                        defaults={
                            'amount': default_amount,
                            'due_date': curr + relativedelta(day=5),
                        }
                    )
                    mas_payment.status = 'paid'
                    mas_payment.paid_date = today
                    mas_payment.payment_mode = payment_mode
                    mas_payment.receipt_no = receipt_no
                    mas_payment.remarks = f"{mas_payment.remarks}\nCleared via bulk action."
                    mas_payment.recorded_by = request.user
                    mas_payment.save()
                curr += relativedelta(months=1)

            # Auto-reactivate if member status was inactive
            if member.status == 'inactive':
                member.status = 'active'
                member.remarks = (member.remarks or "") + f"\nAuto-reactivated on {today} after clearing all dues."
                member.save()

        return Response({'message': 'All overdue dues, repayments, and Masavari payments cleared successfully.'})


class MemberClearMasavariView(APIView):
    """POST /api/members/{id}/clear-masavari/ — clear all pending masavari payments up to today."""
    permission_classes = [IsAuthenticated, IsAdminOrStaffOrReadOnly]

    def post(self, request, pk):
        from apps.members.models import Member
        from apps.dues.models import MasavariPayment
        from django.db import transaction
        import datetime
        from dateutil.relativedelta import relativedelta
        from decimal import Decimal
        from django.utils import timezone

        try:
            member = Member.objects.get(pk=pk)
        except Member.DoesNotExist:
            return Response({'error': True, 'message': 'Member not found'}, status=404)

        payment_mode = request.data.get('payment_mode', 'cash')
        receipt_no = request.data.get('receipt_no', '')
        clear_till_str = request.data.get('clear_till')
        today = timezone.now().date()

        end_date = today
        if clear_till_str:
            try:
                if len(clear_till_str.strip()) == 7: # YYYY-MM
                    end_date = datetime.datetime.strptime(clear_till_str.strip(), '%Y-%m').date()
                else:
                    end_date = datetime.datetime.strptime(clear_till_str.strip(), '%Y-%m-%d').date()
            except ValueError:
                pass

        with transaction.atomic():
            payments_qs = MasavariPayment.objects.filter(member=member)
            default_amount = member.masavari_amount

            start_date = member.joining_date
            curr = start_date.replace(day=1)
            end = end_date.replace(day=1)
            paid_set = set(payments_qs.filter(status='paid').values_list('year', 'month'))

            while curr <= end:
                if (curr.year, curr.month) not in paid_set:
                    mas_payment, created = MasavariPayment.objects.get_or_create(
                        member=member,
                        year=curr.year,
                        month=curr.month,
                        defaults={
                            'amount': default_amount,
                            'due_date': curr + relativedelta(day=5),
                        }
                    )
                    mas_payment.status = 'paid'
                    mas_payment.paid_date = today
                    mas_payment.payment_mode = payment_mode
                    mas_payment.receipt_no = receipt_no
                    mas_payment.remarks = f"{mas_payment.remarks}\nCleared via bulk masavari action."
                    mas_payment.recorded_by = request.user
                    mas_payment.save()
                curr += relativedelta(months=1)

            # Auto-reactivate if member status was inactive
            if member.status == 'inactive':
                from apps.members.utils import check_and_reactivate_member
                check_and_reactivate_member(member)

        return Response({'message': 'All pending Masavari payments cleared.'})
