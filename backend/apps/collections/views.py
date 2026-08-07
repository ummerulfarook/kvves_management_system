from rest_framework import generics, status, filters
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from django.utils import timezone
from django.db.models import Sum
from .models import DailyEntry
from .serializers import DailyEntrySerializer
from apps.accounts.permissions import IsAdminOrStaffOrReadOnly


class DailyEntryListCreateView(generics.ListCreateAPIView):
    """GET /api/collections/daily/ | POST — create daily entry."""
    permission_classes = [IsAuthenticated, IsAdminOrStaffOrReadOnly]
    serializer_class = DailyEntrySerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['description', 'member__full_name', 'member__member_no']
    ordering_fields = ['date', 'amount', 'created_at']

    def get_queryset(self):
        qs = DailyEntry.objects.select_related('member', 'recorded_by').all()

        # Filter by date range
        date_param = self.request.query_params.get('date')
        if date_param:
            qs = qs.filter(date=date_param)

        month_param = self.request.query_params.get('month')
        if month_param:
            try:
                parts = month_param.split('-')
                qs = qs.filter(date__year=int(parts[0]), date__month=int(parts[1]))
            except (ValueError, IndexError):
                pass

        year_param = self.request.query_params.get('year')
        if year_param:
            try:
                qs = qs.filter(date__year=int(year_param))
            except ValueError:
                pass

        entry_type = self.request.query_params.get('entry_type')
        if entry_type:
            qs = qs.filter(entry_type=entry_type)

        category = self.request.query_params.get('category')
        if category:
            qs = qs.filter(category=category)

        return qs

    def create(self, request, *args, **kwargs):
        # We override create to handle automatic payment logging for members
        data = request.data.copy()
        category = data.get('category')
        member_id = data.get('member')
        amount = data.get('amount')
        date_str = data.get('date') or timezone.now().date().isoformat()
        payment_mode = data.get('payment_mode', 'cash')

        if not amount:
            return Response({'error': True, 'message': 'Amount is required.'}, status=400)

        amount = float(amount)

        if category == 'welfare_payment':
            enrollment_id = data.get('welfare_group') or data.get('enrollment')
            month_number = data.get('month_number')
            if not enrollment_id or not month_number:
                return Response({'error': True, 'message': 'Welfare Scheme enrollment and Month Number are required.'}, status=400)

            from apps.chits.models import ChitEnrollment, ChitPayment
            enrollment = None
            try:
                enrollment = ChitEnrollment.objects.select_related('member', 'chit_group').get(pk=enrollment_id)
            except (ChitEnrollment.DoesNotExist, ValueError):
                if member_id:
                    enrollment = ChitEnrollment.objects.filter(member_id=member_id, chit_group_id=enrollment_id).first()

            if not enrollment:
                return Response({'error': True, 'message': 'Selected welfare enrollment could not be found.'}, status=400)

            from decimal import Decimal
            payment, created = ChitPayment.objects.get_or_create(
                enrollment=enrollment,
                month_number=int(month_number),
                defaults={
                    'installment_amount': enrollment.chit_group.monthly_instalment,
                    'amount_paid': Decimal('0.00'),
                    'due_date': date_str,
                }
            )
            amount_dec = Decimal(str(amount))
            payment.amount_paid += amount_dec
            payment.paid_date = date_str
            payment.payment_mode = payment_mode
            payment.recorded_by = request.user
            if payment.amount_paid >= payment.installment_amount:
                payment.is_paid = True
            else:
                payment.is_paid = False
            payment.save()

            entry = DailyEntry.objects.create(
                date=date_str,
                entry_type='income',
                category='welfare_payment',
                amount=amount_dec,
                description=f"Welfare Payment — Month {payment.month_number} for {enrollment.member.full_name if enrollment.member else enrollment.non_member_name} (Ticket #{enrollment.ticket_number})",
                member=enrollment.member,
                payment_mode=payment_mode,
                recorded_by=request.user,
                chit_payment=payment,
            )

            serializer = self.get_serializer(entry)
            return Response(serializer.data, status=status.HTTP_201_CREATED)

        elif category == 'loan_emi':
            loan_id = data.get('loan')
            instalment_no = data.get('month_number')
            if not member_id or not loan_id or not instalment_no:
                return Response({'error': True, 'message': 'Member, Loan, and Installment Number are required.'}, status=400)

            from apps.loans.models import Loan, LoanRepayment
            try:
                loan = Loan.objects.get(pk=loan_id, member_id=member_id)
            except Loan.DoesNotExist:
                return Response({'error': True, 'message': 'Loan not found for this member.'}, status=400)

            loan.apply_loan_payment(
                start_instalment_no=int(instalment_no),
                amount=amount,
                paid_date=date_str,
                payment_mode=payment_mode,
                recorded_by=request.user
            )

            repayment = LoanRepayment.objects.filter(loan=loan, instalment_no=int(instalment_no)).first()
            entry = DailyEntry.objects.filter(loan_repayment=repayment).first() if repayment else None
            if entry:
                serializer = self.get_serializer(entry)
                return Response(serializer.data, status=status.HTTP_201_CREATED)
            else:
                entry = DailyEntry.objects.create(
                    date=date_str,
                    entry_type='income',
                    category='loan_emi',
                    amount=amount,
                    description=f"Loan EMI Payment — Installment {instalment_no} for {loan.member.full_name} (Loan {loan.loan_no})",
                    member=loan.member,
                    payment_mode=payment_mode,
                    recorded_by=request.user,
                    loan_repayment=repayment,
                )
                serializer = self.get_serializer(entry)
                return Response(serializer.data, status=status.HTTP_201_CREATED)

        elif category in ['registration_fee', 'share_capital']:
            if not member_id:
                return Response({'error': True, 'message': 'Member is required for Registration Fee or Share Capital.'}, status=400)

            from apps.dues.models import Deposit
            dep_type = 'membership_fee' if category == 'registration_fee' else 'share_capital'

            deposit = Deposit.objects.create(
                member_id=member_id,
                deposit_type=dep_type,
                amount=amount,
                deposit_date=date_str,
                payment_mode=payment_mode,
                receipt_no=data.get('receipt_no', ''),
                status='active',
                recorded_by=request.user,
            )

            # Create the DailyEntry
            serializer = self.get_serializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            serializer.save(recorded_by=request.user, deposit=deposit)
            return Response(serializer.data, status=status.HTTP_201_CREATED)

        elif category == 'masavari':
            # Record Masavari (monthly membership fee) payment
            month_number = data.get('month_number')
            if not member_id or not month_number:
                return Response({'error': True, 'message': 'Member and Month Number (1-12) are required for Masavari.'}, status=400)

            import datetime
            from apps.dues.models import MasavariPayment

            paid_date = date_str
            try:
                parsed_date = datetime.date.fromisoformat(str(date_str))
                year = parsed_date.year
            except (ValueError, TypeError):
                year = timezone.now().year

            payment, _ = MasavariPayment.objects.update_or_create(
                member_id=member_id,
                year=year,
                month=int(month_number),
                defaults={
                    'amount': amount,
                    'due_date': paid_date,
                    'paid_date': paid_date,
                    'payment_mode': payment_mode,
                    'status': 'paid',
                    'receipt_no': data.get('receipt_no', ''),
                    'recorded_by': request.user,
                }
            )

            # Activity log
            try:
                from apps.activities.models import ActivityLog
                ActivityLog.objects.create(
                    member_id=member_id,
                    activity_type='masavari_paid',
                    description=f"Masavari (Monthly Due) paid for {month_number}/{year} — ₹{amount}.",
                    amount=amount,
                    reference_id=str(payment.id),
                    reference_type='MasavariPayment',
                    performed_by=request.user,
                )
            except Exception:
                pass

            # Also create the DailyEntry normally
            serializer = self.get_serializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            serializer.save(recorded_by=request.user)
            return Response({'message': f'Masavari payment recorded for month {month_number}/{year}.'}, status=201)

        else:
            # Normal income/expense
            serializer = self.get_serializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            serializer.save(recorded_by=request.user)
            headers = self.get_success_headers(serializer.data)
            return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)


class DailySummaryView(APIView):
    """GET /api/collections/summary/ — summary of incoming/outgoing/profit-loss."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = DailyEntry.objects.all()

        # Filter by date, month, year
        date_param = request.query_params.get('date')
        if date_param:
            qs = qs.filter(date=date_param)

        month_param = request.query_params.get('month')
        if month_param:
            try:
                parts = month_param.split('-')
                qs = qs.filter(date__year=int(parts[0]), date__month=int(parts[1]))
            except (ValueError, IndexError):
                pass

        year_param = request.query_params.get('year')
        if year_param:
            try:
                qs = qs.filter(date__year=int(year_param))
            except ValueError:
                pass

        income = qs.filter(entry_type='income').aggregate(total=Sum('amount'))['total'] or 0
        expense = qs.filter(entry_type='expense').aggregate(total=Sum('amount'))['total'] or 0
        profit_loss = income - expense

        categories = qs.values('category', 'entry_type').annotate(total=Sum('amount')).order_by('-total')

        return Response({
            'total_income': str(income),
            'total_expense': str(expense),
            'net_profit_loss': str(profit_loss),
            'categories': [
                {
                    'category': c['category'],
                    'entry_type': c['entry_type'],
                    'total': str(c['total'])
                } for c in categories
            ]
        })


class DailyEntryDetailView(generics.RetrieveDestroyAPIView):
    """GET/DELETE /api/collections/daily/{id}/ — retrieve or delete collection entry with cascading reversal."""
    queryset = DailyEntry.objects.all()
    serializer_class = DailyEntrySerializer
    permission_classes = [IsAuthenticated, IsAdminOrStaffOrReadOnly]

    def perform_destroy(self, instance):
        from decimal import Decimal
        from apps.chits.models import ChitPayment
        from apps.loans.models import LoanRepayment
        from apps.dues.models import Deposit, MasavariPayment
        
        # 1. Revert Chit (Welfare) Payment
        if instance.chit_payment:
            payment = instance.chit_payment
            payment.amount_paid -= instance.amount
            if payment.amount_paid <= 0:
                payment.delete()
            else:
                payment.is_paid = False
                payment.save()

        # 2. Revert Loan Repayment / EMI
        if instance.loan_repayment:
            repayment = instance.loan_repayment
            loan = repayment.loan
            repayment.amount_paid = Decimal('0.00')
            repayment.principal_paid = Decimal('0.00')
            repayment.is_paid = False
            repayment.paid_date = None
            repayment.save(skip_update=True)
            loan.update_outstanding_balance()

        # 3. Revert Deposit (Registration Fee / Share Capital)
        if instance.deposit:
            instance.deposit.delete()

        # 4. Revert Masavari Payment
        if instance.category == 'masavari' and instance.member:
            import re
            match = re.search(r'paid for (\d+)/(\d+)', instance.description)
            if match:
                month = int(match.group(1))
                year = int(match.group(2))
                payment = MasavariPayment.objects.filter(member=instance.member, year=year, month=month).first()
            else:
                payment = MasavariPayment.objects.filter(member=instance.member, paid_date=instance.date, amount=instance.amount).first()
            
            if payment:
                payment.delete()

        # 5. Delete the DailyEntry itself
        instance.delete()
