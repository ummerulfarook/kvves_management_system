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
            from apps.members.models import Member
            from decimal import Decimal

            try:
                member = Member.objects.get(pk=member_id)
            except Member.DoesNotExist:
                return Response({'error': True, 'message': 'Member not found.'}, status=400)

            paid_date = date_str
            try:
                parsed_date = datetime.date.fromisoformat(str(date_str))
                year = parsed_date.year
            except (ValueError, TypeError):
                year = timezone.now().year
                parsed_date = timezone.now().date()

            # Determine the member's masavari rate
            masavari_rate = member.masavari_amount or Decimal('50.00')
            if masavari_rate <= 0:
                masavari_rate = Decimal('50.00')

            remaining_amount = Decimal(str(amount))
            curr_month = int(month_number)
            curr_year = year
            paid_periods = []

            while remaining_amount > 0:
                # Find if there is an existing payment for this month/year
                existing_payment = MasavariPayment.objects.filter(
                    member=member,
                    year=curr_year,
                    month=curr_month
                ).first()

                already_paid = existing_payment.amount if (existing_payment and existing_payment.status == 'paid') else Decimal('0.00')
                needed = masavari_rate - already_paid

                if needed <= 0:
                    # Already fully paid, move to the next month
                    curr_month += 1
                    if curr_month > 12:
                        curr_month = 1
                        curr_year += 1
                    continue

                pay_here = min(remaining_amount, needed)
                remaining_amount -= pay_here
                paid_periods.append(f"{curr_month}/{curr_year}")

                due_date_for_month = datetime.date(curr_year, curr_month, 5)

                payment, _ = MasavariPayment.objects.update_or_create(
                    member=member,
                    year=curr_year,
                    month=curr_month,
                    defaults={
                        'amount': already_paid + pay_here,
                        'due_date': due_date_for_month,
                        'paid_date': parsed_date,
                        'payment_mode': payment_mode,
                        'status': 'paid' if (already_paid + pay_here >= masavari_rate) else 'pending',
                        'receipt_no': data.get('receipt_no', ''),
                        'recorded_by': request.user,
                    }
                )

                # Activity log
                try:
                    from apps.activities.models import ActivityLog
                    ActivityLog.objects.create(
                        member=member,
                        activity_type='masavari_paid',
                        description=f"Masavari (Monthly Due) paid for {curr_month}/{curr_year} — ₹{pay_here}.",
                        amount=pay_here,
                        reference_id=str(payment.id),
                        reference_type='MasavariPayment',
                        performed_by=request.user,
                    )
                except Exception:
                    pass

                # Go to next month
                curr_month += 1
                if curr_month > 12:
                    curr_month = 1
                    curr_year += 1

            # Auto-reactivate if member status was inactive
            if member.status == 'inactive':
                from apps.members.utils import check_and_reactivate_member
                check_and_reactivate_member(member)

            # Create the single DailyEntry manually
            entry = DailyEntry.objects.create(
                date=paid_date,
                entry_type='income',
                category='masavari',
                amount=amount,
                description=f"Masavari (Monthly Due) paid for {', '.join(paid_periods)} — ₹{amount}.",
                member=member,
                payment_mode=payment_mode,
                receipt_no=data.get('receipt_no', ''),
                recorded_by=request.user,
            )
            serializer = self.get_serializer(entry)
            return Response(serializer.data, status=status.HTTP_201_CREATED)

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

            # Reset all repayments for this loan first
            loan.repayments.all().update(
                amount_paid=Decimal('0.00'),
                principal_paid=Decimal('0.00'),
                interest_paid=Decimal('0.00'),
                is_paid=False,
                paid_date=None
            )

            # Fetch all other active loan_emi daily entries for this loan (excluding the current one)
            remaining_entries = DailyEntry.objects.filter(
                loan_repayment__loan=loan,
                category='loan_emi'
            ).exclude(id=instance.id).order_by('date', 'created_at')

            # Re-apply them sequentially in chronological order
            for entry in remaining_entries:
                first_unpaid = loan.repayments.filter(is_paid=False).order_by('instalment_no').first()
                start_no = first_unpaid.instalment_no if first_unpaid else 1
                loan.apply_loan_payment(
                    start_instalment_no=start_no,
                    amount=entry.amount,
                    paid_date=entry.date,
                    payment_mode=entry.payment_mode,
                    receipt_no=entry.receipt_no or '',
                    recorded_by=entry.recorded_by
                )
                # Link entry to the first repayment record it actually paid
                matched_repayment = loan.repayments.filter(instalment_no=start_no).first()
                if matched_repayment and entry.loan_repayment != matched_repayment:
                    entry.loan_repayment = matched_repayment
                    entry.save(update_fields=['loan_repayment'])

            loan.update_outstanding_balance()

        # 3. Revert Deposit (Registration Fee / Share Capital)
        if instance.deposit:
            instance.deposit.delete()

        # 4. Revert Masavari Payment
        if instance.category == 'masavari' and instance.member:
            import re
            # Extract all occurrences of month/year (digits/digits)
            pairs = re.findall(r'(\d+)/(\d+)', instance.description)
            if pairs:
                for month_str, year_str in pairs:
                    month = int(month_str)
                    year = int(year_str)
                    MasavariPayment.objects.filter(member=instance.member, year=year, month=month).delete()
            else:
                # Fallback to single match or date/amount match
                match = re.search(r'paid for (\d+)/(\d+)', instance.description)
                if match:
                    month = int(match.group(1))
                    year = int(match.group(2))
                    MasavariPayment.objects.filter(member=instance.member, year=year, month=month).delete()
                else:
                    MasavariPayment.objects.filter(member=instance.member, paid_date=instance.date, amount=instance.amount).delete()

        # 5. Delete the DailyEntry itself
        instance.delete()
