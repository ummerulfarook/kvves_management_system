"""
Views for the loans app.
"""

from django.utils import timezone
from rest_framework import generics, status, filters
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from django_filters.rest_framework import DjangoFilterBackend

from .models import Loan, LoanRepayment
from .serializers import LoanSerializer, LoanRepaymentSerializer
from apps.accounts.permissions import IsAdminOrStaffOrReadOnly, CanApproveLoan


class LoanListCreateView(generics.ListCreateAPIView):
    """GET /api/loans/ | POST — create loan application."""

    serializer_class = LoanSerializer
    pagination_class = None
    permission_classes = [IsAuthenticated, IsAdminOrStaffOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'loan_type']
    search_fields = ['loan_no', 'member__full_name', 'member__member_no']
    ordering_fields = ['created_at', 'loan_amount', 'status']

    def get_queryset(self):
        qs = Loan.objects.select_related('member', 'guarantor', 'approved_by').prefetch_related('repayments')
        date_from = self.request.query_params.get('date_from')
        date_to = self.request.query_params.get('date_to')
        if date_from:
            qs = qs.filter(disbursement_date__gte=date_from)
        if date_to:
            qs = qs.filter(disbursement_date__lte=date_to)
        return qs

    def perform_create(self, serializer):
        loan = serializer.save()
        try:
            from apps.activities.models import ActivityLog
            ActivityLog.objects.create(
                member=loan.member,
                activity_type='loan_applied',
                description=f"Loan application {loan.loan_no} for ₹{loan.loan_amount} submitted.",
                amount=loan.loan_amount,
                reference_id=str(loan.id),
                reference_type='Loan',
                performed_by=self.request.user,
            )
        except Exception:
            pass


class LoanDetailView(generics.RetrieveUpdateAPIView):
    """GET/PUT /api/loans/{id}/"""

    queryset = Loan.objects.select_related('member', 'guarantor', 'approved_by').prefetch_related('repayments')
    serializer_class = LoanSerializer
    permission_classes = [IsAuthenticated, IsAdminOrStaffOrReadOnly]


class LoanApproveView(APIView):
    """PATCH /api/loans/{id}/approve/ — admin only."""

    permission_classes = [IsAuthenticated, CanApproveLoan]

    def patch(self, request, pk):
        try:
            loan = Loan.objects.get(pk=pk)
        except Loan.DoesNotExist:
            return Response({'error': True, 'message': 'Loan not found.'}, status=status.HTTP_404_NOT_FOUND)

        if loan.status != 'pending':
            return Response({'error': True, 'message': f'Loan is already {loan.status}.'}, status=status.HTTP_400_BAD_REQUEST)

        # Read optional disbursement details from request body
        from decimal import Decimal
        import datetime

        urgent_charge = Decimal(str(request.data.get('urgent_charge', '0.00') or '0.00'))
        dis_date = request.data.get('disbursement_date')

        loan.status = 'active'
        loan.approved_by = request.user
        loan.urgent_charge = urgent_charge
        if dis_date:
            try:
                loan.disbursement_date = datetime.date.fromisoformat(dis_date)
            except (ValueError, TypeError):
                pass
        loan.disbursement_date = loan.disbursement_date or timezone.now().date()
        loan.save()

        # Generate repayment schedule using 100% principal-based EMIs
        from dateutil.relativedelta import relativedelta
        from apps.collections.models import DailyEntry

        balance = loan.loan_amount
        is_daily = loan.repayment_frequency == 'daily'

        for i in range(1, loan.duration_months + 1):
            if is_daily:
                due_date = loan.disbursement_date + datetime.timedelta(days=i)
            else:
                due_date = loan.disbursement_date + relativedelta(months=i)
            
            principal = loan.emi_amount
            if i == loan.duration_months:
                principal = balance  # pay off remaining
            balance -= principal
            outstanding_after = max(balance, Decimal('0.00'))

            LoanRepayment.objects.get_or_create(
                loan=loan,
                instalment_no=i,
                defaults={
                    'amount_paid': Decimal('0.00'),
                    'principal_paid': Decimal('0.00'),
                    'interest_paid': Decimal('0.00'),
                    'due_date': due_date,
                    'outstanding_after': outstanding_after,
                    'is_paid': False,
                }
            )

        # Create DailyEntry logs for the upfront financial transaction
        # 1. Gross Loan Disbursement (Expense)
        DailyEntry.objects.create(
            date=loan.disbursement_date,
            entry_type='expense',
            category='other_expense',
            amount=loan.loan_amount,
            description=f"Loan Disbursement — Loan {loan.loan_no} for {loan.member.full_name}",
            member=loan.member,
            payment_mode='cash',
            recorded_by=request.user,
        )

        # 2. Upfront Service Charge (Income - Profit)
        if loan.service_charge > 0:
            DailyEntry.objects.create(
                date=loan.disbursement_date,
                entry_type='income',
                category='loan_service_charge',
                amount=loan.service_charge,
                description=f"Loan Service Charge Income — Loan {loan.loan_no} for {loan.member.full_name}",
                member=loan.member,
                payment_mode='cash',
                recorded_by=request.user,
            )

        # 3. Upfront Urgent Disbursement Charge (Income - Profit)
        if loan.urgent_charge > 0:
            DailyEntry.objects.create(
                date=loan.disbursement_date,
                entry_type='income',
                category='loan_service_charge',
                amount=loan.urgent_charge,
                description=f"Loan Urgent Disbursement Charge Income — Loan {loan.loan_no} for {loan.member.full_name}",
                member=loan.member,
                payment_mode='cash',
                recorded_by=request.user,
            )

        try:
            from apps.activities.models import ActivityLog
            ActivityLog.objects.create(
                member=loan.member,
                activity_type='loan_approved',
                description=f"Loan {loan.loan_no} approved by {request.user.get_full_name() or request.user.username}. Upfront service charge of ₹{loan.service_charge} taken.",
                amount=loan.loan_amount,
                reference_id=str(loan.id),
                reference_type='Loan',
                performed_by=request.user,
            )
        except Exception:
            pass

        return Response({'message': 'Loan approved, upfront service charge deducted, and repayment schedule generated.'})


class LoanCloseView(APIView):
    """POST/PATCH /api/loans/{id}/close/ — Close loan and pay off outstanding balance."""

    permission_classes = [IsAuthenticated, IsAdminOrStaffOrReadOnly]

    def post(self, request, pk):
        return self.close_loan(request, pk)

    def patch(self, request, pk):
        return self.close_loan(request, pk)

    def close_loan(self, request, pk):
        from decimal import Decimal
        from django.db import transaction
        try:
            loan = Loan.objects.get(pk=pk)
        except Loan.DoesNotExist:
            return Response({'error': True, 'message': 'Loan not found.'}, status=404)

        if loan.status == 'closed':
            return Response({'error': True, 'message': 'Loan is already closed.'}, status=400)

        payment_mode = request.data.get('payment_mode', 'cash')
        receipt_no = request.data.get('receipt_no', '')
        remarks = request.data.get('remarks', 'Loan closed & cleared.')
        from apps.accounts.utils import get_local_today
        today = get_local_today()

        outstanding = loan.outstanding_balance

        with transaction.atomic():
            if outstanding > 0:
                last_inst = loan.repayments.order_by('-instalment_no').first()
                next_inst_no = (last_inst.instalment_no + 1) if last_inst else 1

                repayment = LoanRepayment.objects.create(
                    loan=loan,
                    instalment_no=next_inst_no,
                    amount_paid=outstanding,
                    principal_paid=outstanding,
                    interest_paid=0,
                    due_date=today,
                    paid_date=today,
                    payment_mode=payment_mode,
                    receipt_no=receipt_no,
                    outstanding_after=Decimal('0.00'),
                    is_paid=True,
                    recorded_by=request.user
                )

                try:
                    from apps.activities.models import ActivityLog
                    ActivityLog.objects.create(
                        member=loan.member,
                        activity_type='loan_repayment',
                        description=f"Loan {loan.loan_no} — Closed in full. Final payment of ₹{outstanding} recorded.",
                        amount=outstanding,
                        reference_id=str(repayment.id),
                        reference_type='LoanRepayment',
                        performed_by=request.user,
                    )
                except Exception:
                    pass

            loan.status = 'closed'
            loan.outstanding_balance = Decimal('0.00')
            loan.save(update_fields=['status', 'outstanding_balance'])
            loan.update_outstanding_balance()

        return Response({'message': f'Loan closed successfully. Outstanding balance of ₹{outstanding} cleared.'})


class LoanRepaymentListCreateView(generics.ListCreateAPIView):
    """GET/POST /api/loans/{id}/repayments/"""

    serializer_class = LoanRepaymentSerializer
    permission_classes = [IsAuthenticated, IsAdminOrStaffOrReadOnly]

    def get_queryset(self):
        return LoanRepayment.objects.filter(loan_id=self.kwargs['loan_pk']).order_by('instalment_no')

    def create(self, request, *args, **kwargs):
        from decimal import Decimal
        loan_pk = self.kwargs['loan_pk']
        data = request.data.copy()
        instalment_no = data.get('instalment_no')

        if not instalment_no:
            return Response({'error': True, 'message': 'Installment number is required.'}, status=400)

        try:
            loan = Loan.objects.get(pk=loan_pk)
        except Loan.DoesNotExist:
            return Response({'error': True, 'message': 'Loan not found.'}, status=404)

        amt = Decimal(str(data.get('amount_paid') or loan.emi_amount))
        paid_date = data.get('paid_date') or timezone.now().date()
        payment_mode = data.get('payment_mode', 'cash')
        receipt_no = data.get('receipt_no', '')

        loan.apply_loan_payment(
            start_instalment_no=int(instalment_no),
            amount=amt,
            paid_date=paid_date,
            payment_mode=payment_mode,
            receipt_no=receipt_no,
            recorded_by=request.user
        )

        repayment = LoanRepayment.objects.filter(loan=loan, instalment_no=int(instalment_no)).first()
        serializer = self.get_serializer(repayment)

        # Create single DailyEntry for the payment transaction
        try:
            from apps.collections.models import DailyEntry
            DailyEntry.objects.create(
                date=paid_date,
                entry_type='income',
                category='loan_emi',
                amount=amt,
                description=f"Loan EMI Payment — Installment {instalment_no} for {loan.member.full_name} (Loan {loan.loan_no})",
                member=loan.member,
                payment_mode=payment_mode,
                receipt_no=receipt_no,
                recorded_by=request.user,
                loan_repayment=repayment
            )
        except Exception:
            pass

        try:
            from apps.activities.models import ActivityLog
            ActivityLog.objects.create(
                member=loan.member,
                activity_type='loan_repayment',
                description=f"Loan {loan.loan_no} — EMI {instalment_no} payment of ₹{amt} recorded.",
                amount=amt,
                reference_id=str(repayment.id) if repayment else str(loan.id),
                reference_type='LoanRepayment',
                performed_by=self.request.user,
            )
        except Exception:
            pass

        return Response(serializer.data, status=status.HTTP_200_OK)

    def perform_update(self, serializer):
        serializer.save(recorded_by=self.request.user, is_paid=True, paid_date=serializer.validated_data.get('paid_date') or timezone.now().date())

    def perform_create(self, serializer):
        loan = Loan.objects.get(pk=self.kwargs['loan_pk'])
        repayment = serializer.save(loan=loan, recorded_by=self.request.user, is_paid=True,
                        paid_date=serializer.validated_data.get('paid_date') or timezone.now().date())

        try:
            from apps.activities.models import ActivityLog
            ActivityLog.objects.create(
                member=loan.member,
                activity_type='loan_repayment',
                description=f"Loan {loan.loan_no} — EMI {repayment.instalment_no} paid: ₹{repayment.amount_paid}.",
                amount=repayment.amount_paid,
                reference_id=str(repayment.id),
                reference_type='LoanRepayment',
                performed_by=self.request.user,
            )
        except Exception:
            pass


class LoanRepaymentDetailView(generics.RetrieveUpdateAPIView):
    """PUT /api/repayments/{rid}/"""

    queryset = LoanRepayment.objects.all()
    serializer_class = LoanRepaymentSerializer
    permission_classes = [IsAuthenticated, IsAdminOrStaffOrReadOnly]


class LoanOverdueView(generics.ListAPIView):
    """GET /api/loans/overdue/ — all overdue EMIs."""

    serializer_class = LoanRepaymentSerializer
    pagination_class = None
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        today = timezone.now().date()
        return LoanRepayment.objects.filter(
            is_paid=False,
            due_date__lt=today,
        ).select_related('loan__member').order_by('due_date')
