"""
Reports app views — aggregated dashboard and report data.
"""

from decimal import Decimal
from django.utils import timezone
from django.db.models import Sum, Count, Q
from django.db.models.functions import TruncMonth
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response


class DashboardView(APIView):
    """GET /api/reports/dashboard/ — top-level stats for dashboard cards."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        from apps.members.models import Member
        from apps.chits.models import ChitGroup, ChitEnrollment, ChitPayment
        from apps.loans.models import Loan, LoanRepayment
        from apps.dues.models import Due, MasavariPayment
        from apps.activities.models import ActivityLog
        import datetime
        from dateutil.relativedelta import relativedelta

        today = timezone.now().date()
        one_year_ago = today - relativedelta(months=12)

        total_members = Member.objects.count()
        active_chits = ChitGroup.objects.filter(status='active').count()
        active_loans = Loan.objects.filter(status='active').count()

        active_fee_paying_members = Member.objects.filter(status='active').count()

        # Compile list of all overdue payments across categories
        all_overdue = []

        # 1. Overdue Welfare (Chits)
        overdue_chits = ChitPayment.objects.filter(is_paid=False, due_date__lt=today).select_related(
            'enrollment__member', 'enrollment__chit_group'
        )
        for p in overdue_chits:
            name = p.enrollment.member.full_name if p.enrollment.member else p.enrollment.non_member_name
            no = p.enrollment.member.member_no if p.enrollment.member else 'Non-Member'
            all_overdue.append({
                'type': 'Welfare',
                'member_name': name,
                'member_no': no,
                'amount': str(p.installment_amount - p.amount_paid),
                'due_date': p.due_date.isoformat(),
                'days_overdue': (today - p.due_date).days,
                'detail': f"{p.enrollment.chit_group.group_name} — Month {p.month_number}",
            })

        # 2. Overdue Loan EMIs
        overdue_loans = LoanRepayment.objects.filter(is_paid=False, due_date__lt=today).select_related(
            'loan__member'
        )
        for r in overdue_loans:
            all_overdue.append({
                'type': 'Loan EMI',
                'member_name': r.loan.member.full_name,
                'member_no': r.loan.member.member_no,
                'amount': str(r.amount_paid),
                'due_date': r.due_date.isoformat(),
                'days_overdue': (today - r.due_date).days,
                'detail': f"Loan {r.loan.loan_no} — EMI {r.instalment_no}",
            })

        # 3. Overdue Standard Dues
        overdue_dues = Due.objects.filter(status='pending', due_date__lt=today).select_related('member')
        for d in overdue_dues:
            all_overdue.append({
                'type': 'Due',
                'member_name': d.member.full_name,
                'member_no': d.member.member_no,
                'amount': str(d.amount),
                'due_date': d.due_date.isoformat(),
                'days_overdue': (today - d.due_date).days,
                'detail': d.get_due_type_display(),
            })

        # 4. Overdue Masavari Payments
        paid_masavari = {}
        for p in MasavariPayment.objects.filter(status='paid'):
            paid_masavari.setdefault(p.member_id, set()).add((p.year, p.month))

        for m in Member.objects.all():
            rate = m.masavari_amount
            start_date = m.joining_date
            if not start_date:
                continue
            curr = start_date.replace(day=1)
            end = today.replace(day=1)
            
            member_paid = paid_masavari.get(m.id, set())
            
            while curr <= end:
                due_date = curr + relativedelta(day=5)
                if due_date < today and (curr.year, curr.month) not in member_paid:
                    all_overdue.append({
                        'type': 'Masavari',
                        'member_name': m.full_name,
                        'member_no': m.member_no,
                        'amount': str(rate),
                        'due_date': due_date.isoformat(),
                        'days_overdue': (today - due_date).days,
                        'detail': f"Masavari for {curr.strftime('%B %Y')}",
                    })
                curr += relativedelta(months=1)

        # Sort all by days_overdue descending
        all_overdue.sort(key=lambda x: x['days_overdue'], reverse=True)
        overdue_count = len(all_overdue)

        # Monthly chit collections (last 6 months)
        six_months_ago = today.replace(day=1) - relativedelta(months=5)

        from apps.collections.models import DailyEntry
        monthly_chit = (
            DailyEntry.objects
            .filter(category='welfare_payment', entry_type='income', date__gte=six_months_ago)
            .annotate(month=TruncMonth('date'))
            .values('month')
            .annotate(total=Sum('amount'))
            .order_by('month')
        )

        # Monthly loan repayments (last 6 months)
        monthly_loan = (
            LoanRepayment.objects
            .filter(is_paid=True, paid_date__gte=six_months_ago)
            .annotate(month=TruncMonth('paid_date'))
            .values('month')
            .annotate(total=Sum('amount_paid'))
            .order_by('month')
        )

        # Recent members
        recent_members = Member.objects.order_by('-joining_date')[:5].values(
            'id', 'member_no', 'full_name', 'joining_date', 'membership_type', 'status'
        )

        # Recent activities
        recent_activities = ActivityLog.objects.select_related('member', 'performed_by').order_by('-timestamp')[:5]
        activities_data = [
            {
                'id': a.id,
                'activity_type': a.activity_type,
                'description': a.description,
                'member_name': a.member.full_name if a.member else None,
                'performed_by': a.performed_by.get_full_name() if a.performed_by else 'System',
                'timestamp': a.timestamp.isoformat(),
                'amount': str(a.amount) if a.amount else None,
            }
            for a in recent_activities
        ]

        return Response({
            'stats': {
                'total_members': total_members,
                'active_fee_paying_members': active_fee_paying_members,
                'active_chits': active_chits,
                'active_loans': active_loans,
                'overdue_count': overdue_count,
            },
            'monthly_chit_collections': [
                {'month': m['month'].strftime('%b %Y'), 'total': str(m['total'])}
                for m in monthly_chit
            ],
            'monthly_loan_repayments': [
                {'month': m['month'].strftime('%b %Y'), 'total': str(m['total'])}
                for m in monthly_loan
            ],
            'overdue_list': all_overdue[:10],  # Top 10 for dashboard view
            'recent_members': list(recent_members),
            'recent_activities': activities_data,
        })


class MembersSummaryView(APIView):
    """GET /api/reports/members-summary/"""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        from apps.members.models import Member

        by_type = list(
            Member.objects.values('membership_type').annotate(count=Count('id')).order_by('membership_type')
        )
        by_status = list(
            Member.objects.values('status').annotate(count=Count('id')).order_by('status')
        )
        monthly_joining = list(
            Member.objects.annotate(month=TruncMonth('joining_date'))
            .values('month')
            .annotate(count=Count('id'))
            .order_by('month')
        )

        return Response({
            'by_type': by_type,
            'by_status': by_status,
            'monthly_joining': [
                {'month': m['month'].strftime('%b %Y') if m['month'] else 'Unknown', 'count': m['count']}
                for m in monthly_joining
            ],
        })


class ChitsSummaryView(APIView):
    """GET /api/reports/chits-summary/"""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        from apps.chits.models import ChitGroup, ChitPayment
        from django.db.models import Q

        by_group = []
        for group in ChitGroup.objects.all():
            collected = group.enrollments.aggregate(
                total=Sum('payments__amount_paid', filter=Q(payments__is_paid=True))
            )['total'] or Decimal('0.00')
            
            # Surcharge + reduction for winners in this group
            surcharges = group.enrollments.filter(prize_won=True).aggregate(
                total_surcharge=Sum('surcharge_amount'),
                total_reduction=Sum('reduction_amount'),
                total_payout=Sum('prize_amount')
            )
            comm_profit = (surcharges['total_surcharge'] or Decimal('0.00')) + (surcharges['total_reduction'] or Decimal('0.00'))
            payouts_made = surcharges['total_payout'] or Decimal('0.00')

            enrolled = group.enrollments.filter(status__in=['active', 'awarded']).count()
            total_expected = group.monthly_instalment * group.duration_months * enrolled

            by_group.append({
                'group_no': group.group_no,
                'group_name': group.group_name,
                'status': group.status,
                'enrolled_count': enrolled,
                'total_expected': str(total_expected),
                'total_collected': str(collected),
                'total_commission_profit': str(comm_profit),
                'total_payout_amount': str(payouts_made),
            })

        return Response({'by_group': by_group})


class LoansSummaryView(APIView):
    """GET /api/reports/loans-summary/"""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        from apps.loans.models import Loan, LoanRepayment

        by_status = list(
            Loan.objects.values('status')
            .annotate(count=Count('id'), total=Sum('loan_amount'))
            .order_by('status')
        )

        total_outstanding = Loan.objects.filter(status='active').aggregate(
            total=Sum('outstanding_balance')
        )['total'] or Decimal('0.00')

        total_repaid = LoanRepayment.objects.filter(is_paid=True).aggregate(
            total=Sum('amount_paid')
        )['total'] or Decimal('0.00')

        return Response({
            'by_status': by_status,
            'total_outstanding': str(total_outstanding),
            'total_repaid': str(total_repaid),
        })


class DuesSummaryView(APIView):
    """GET /api/reports/dues-summary/"""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        from apps.dues.models import Due

        today = timezone.now().date()

        by_status = list(
            Due.objects.values('status').annotate(count=Count('id'), total=Sum('amount')).order_by('status')
        )

        overdue_count = Due.objects.filter(status='pending', due_date__lt=today).count()
        overdue_amount = Due.objects.filter(status='pending', due_date__lt=today).aggregate(
            total=Sum('amount')
        )['total'] or Decimal('0.00')

        return Response({
            'by_status': by_status,
            'overdue_count': overdue_count,
            'overdue_amount': str(overdue_amount),
        })


class OverdueListView(APIView):
    """GET /api/reports/overdue-list/ — combined overdue: chits + loans + dues + masavari."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        from apps.chits.models import ChitPayment
        from apps.loans.models import LoanRepayment
        from apps.dues.models import Due, MasavariPayment
        from apps.members.models import Member
        from dateutil.relativedelta import relativedelta

        date_str = request.query_params.get('date')
        if date_str:
            try:
                import datetime
                today = datetime.datetime.strptime(date_str, '%Y-%m-%d').date()
            except ValueError:
                today = timezone.now().date()
        else:
            today = timezone.now().date()
        overdue_result = []
        upcoming_result = []

        # 1. Welfare (Chits)
        chit_unpaid = ChitPayment.objects.filter(is_paid=False).select_related(
            'enrollment__member', 'enrollment__chit_group'
        )
        for p in chit_unpaid:
            name = p.enrollment.member.full_name if p.enrollment.member else p.enrollment.non_member_name
            no = p.enrollment.member.member_no if p.enrollment.member else 'Non-Member'
            mid = p.enrollment.member.id if p.enrollment.member else None
            item = {
                'type': 'Welfare',
                'member_name': name,
                'member_no': no,
                'member_id': mid,
                'amount': str(p.installment_amount - p.amount_paid),
                'due_date': p.due_date.isoformat(),
                'days_overdue': (today - p.due_date).days if p.due_date < today else 0,
                'detail': f"{p.enrollment.chit_group.group_name} — Month {p.month_number}",
            }
            if p.due_date < today:
                overdue_result.append(item)
            else:
                upcoming_result.append(item)

        # 2. Loan EMIs
        loan_unpaid = LoanRepayment.objects.filter(is_paid=False).select_related(
            'loan__member'
        )
        for r in loan_unpaid:
            item = {
                'type': 'Loan EMI',
                'member_name': r.loan.member.full_name,
                'member_no': r.loan.member.member_no,
                'member_id': r.loan.member.id,
                'amount': str(r.amount_paid),
                'due_date': r.due_date.isoformat(),
                'days_overdue': (today - r.due_date).days if r.due_date < today else 0,
                'detail': f"Loan {r.loan.loan_no} — EMI {r.instalment_no}",
            }
            if r.due_date < today:
                overdue_result.append(item)
            else:
                upcoming_result.append(item)

        # 3. Standard Dues
        due_unpaid = Due.objects.filter(status='pending').select_related('member')
        for d in due_unpaid:
            item = {
                'type': 'Due',
                'member_name': d.member.full_name,
                'member_no': d.member.member_no,
                'member_id': d.member.id,
                'amount': str(d.amount),
                'due_date': d.due_date.isoformat(),
                'days_overdue': (today - d.due_date).days if d.due_date < today else 0,
                'detail': d.get_due_type_display(),
            }
            if d.due_date < today:
                overdue_result.append(item)
            else:
                upcoming_result.append(item)

        # 4. Masavari Payments
        paid_masavari = {}
        for p in MasavariPayment.objects.filter(status='paid'):
            paid_masavari.setdefault(p.member_id, set()).add((p.year, p.month))

        upcoming_limit = today + relativedelta(months=1)

        for m in Member.objects.all():
            rate = m.masavari_amount
            start_date = m.joining_date
            if not start_date:
                continue
            curr = start_date.replace(day=1)
            end = upcoming_limit.replace(day=1)
            
            member_paid = paid_masavari.get(m.id, set())
            
            while curr <= end:
                due_date = curr + relativedelta(day=5)
                if (curr.year, curr.month) not in member_paid:
                    item = {
                        'type': 'Masavari',
                        'member_name': m.full_name,
                        'member_no': m.member_no,
                        'member_id': m.id,
                        'amount': str(rate),
                        'due_date': due_date.isoformat(),
                        'days_overdue': (today - due_date).days if due_date < today else 0,
                        'detail': f"Masavari for {curr.strftime('%B %Y')}",
                    }
                    if due_date < today:
                        overdue_result.append(item)
                    else:
                        upcoming_result.append(item)
                curr += relativedelta(months=1)

        overdue_result.sort(key=lambda x: x['days_overdue'], reverse=True)
        upcoming_result.sort(key=lambda x: x['due_date'], reverse=False)

        return Response({
            'overdue_list': overdue_result,
            'upcoming_list': upcoming_result,
            'total_overdue': len(overdue_result),
            'total_upcoming': len(upcoming_result),
        })


class PeriodReportView(APIView):
    """
    GET /api/reports/period/
    Query params:
      - period: daily | monthly | yearly
      - date: YYYY-MM-DD  (for daily)
      - month: YYYY-MM    (for monthly)
      - year: YYYY        (for yearly)
    Returns welfare collections, loan repayments, dues collected, new members, new loans.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from apps.chits.models import ChitPayment, ChitEnrollment
        from apps.loans.models import LoanRepayment, Loan
        from apps.dues.models import Due, Deposit
        from apps.members.models import Member
        import datetime

        period = request.query_params.get('period', 'monthly')
        today = timezone.now().date()

        # Determine date range
        if period == 'daily':
            date_str = request.query_params.get('date', today.isoformat())
            try:
                start = datetime.date.fromisoformat(date_str)
            except (ValueError, TypeError):
                start = today
            end = start
            label = start.strftime('%d %B %Y')

        elif period == 'monthly':
            month_str = request.query_params.get('month', today.strftime('%Y-%m'))
            try:
                parts = month_str.split('-')
                start = datetime.date(int(parts[0]), int(parts[1]), 1)
            except (ValueError, TypeError, IndexError):
                start = today.replace(day=1)
            from dateutil.relativedelta import relativedelta
            end = start + relativedelta(months=1) - datetime.timedelta(days=1)
            label = start.strftime('%B %Y')

        elif period == 'yearly':
            year_str = request.query_params.get('year', str(today.year))
            try:
                year = int(year_str)
            except (ValueError, TypeError):
                year = today.year
            start = datetime.date(year, 1, 1)
            end = datetime.date(year, 12, 31)
            label = str(year)

        elif period == 'custom':
            start_str = request.query_params.get('start_date')
            end_str = request.query_params.get('end_date')
            try:
                start = datetime.date.fromisoformat(start_str)
            except (ValueError, TypeError):
                start = today
            try:
                end = datetime.date.fromisoformat(end_str)
            except (ValueError, TypeError):
                end = today
            label = f"{start.strftime('%d %b %Y')} to {end.strftime('%d %b %Y')}"

        else:
            return Response({'error': 'Invalid period. Use daily, monthly, yearly, or custom.'}, status=400)

        # Welfare (chit) collections
        from apps.collections.models import DailyEntry
        welfare_collections = DailyEntry.objects.filter(
            category='welfare_payment', entry_type='income', date__gte=start, date__lte=end
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')

        welfare_count = DailyEntry.objects.filter(
            category='welfare_payment', entry_type='income', date__gte=start, date__lte=end
        ).count()

        # Loan repayments
        loan_repayment_de = DailyEntry.objects.filter(
            category='loan_emi', entry_type='income', date__gte=start, date__lte=end
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')

        loan_repayment_lr = LoanRepayment.objects.filter(
            is_paid=True
        ).filter(
            models.Q(paid_date__gte=start, paid_date__lte=end) |
            models.Q(paid_date__isnull=True, due_date__gte=start, due_date__lte=end)
        ).aggregate(total=Sum('amount_paid'))['total'] or Decimal('0.00')

        loan_repayments = max(loan_repayment_de, loan_repayment_lr)

        loan_repayment_count_de = DailyEntry.objects.filter(
            category='loan_emi', entry_type='income', date__gte=start, date__lte=end
        ).count()

        loan_repayment_count_lr = LoanRepayment.objects.filter(
            is_paid=True
        ).filter(
            models.Q(paid_date__gte=start, paid_date__lte=end) |
            models.Q(paid_date__isnull=True, due_date__gte=start, due_date__lte=end)
        ).count()

        loan_repayment_count = max(loan_repayment_count_de, loan_repayment_count_lr)

        # Dues collected
        dues_collected = Due.objects.filter(
            status='paid', due_date__gte=start, due_date__lte=end
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')

        # Masavari collected
        from apps.dues.models import MasavariPayment
        masavari_collected = MasavariPayment.objects.filter(
            status='paid', paid_date__gte=start, paid_date__lte=end
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')

        masavari_count = MasavariPayment.objects.filter(
            status='paid', paid_date__gte=start, paid_date__lte=end
        ).count()

        # Deposits made (Registration Fees & Capital)
        deposits_made = Deposit.objects.filter(
            deposit_date__gte=start, deposit_date__lte=end
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')

        # New members joined
        new_members = Member.objects.filter(
            joining_date__gte=start, joining_date__lte=end
        ).count()

        new_members_list = list(Member.objects.filter(
            joining_date__gte=start, joining_date__lte=end
        ).values('id', 'member_no', 'full_name', 'joining_date', 'status', 'membership_type'))

        # New loans
        new_loans = Loan.objects.filter(
            created_at__date__gte=start, created_at__date__lte=end
        ).count()

        new_loans_amount = Loan.objects.filter(
            created_at__date__gte=start, created_at__date__lte=end
        ).aggregate(total=Sum('loan_amount'))['total'] or Decimal('0.00')

        # Welfare collections list
        welfare_collections_list = []
        daily_welfare_entries = DailyEntry.objects.filter(
            category='welfare_payment', entry_type='income', date__gte=start, date__lte=end
        ).select_related('member', 'chit_payment__enrollment__chit_group')
        for de in daily_welfare_entries:
            p = de.chit_payment
            group_name = p.enrollment.chit_group.group_name if (p and p.enrollment) else "Welfare Scheme"
            group_no = p.enrollment.chit_group.group_no if (p and p.enrollment) else ""
            month_number = p.month_number if p else 1
            welfare_collections_list.append({
                'id': de.id,
                'enrollment__member__full_name': de.member.full_name if de.member else (p.enrollment.non_member_name if (p and p.enrollment) else ""),
                'enrollment__member__member_no': de.member.member_no if de.member else "Non-Member",
                'enrollment__non_member_name': p.enrollment.non_member_name if (p and p.enrollment) else "",
                'enrollment__chit_group__group_name': group_name,
                'enrollment__chit_group__group_no': group_no,
                'month_number': month_number,
                'amount_paid': str(de.amount),
                'paid_date': de.date.isoformat() if hasattr(de.date, 'isoformat') else str(de.date),
                'payment_mode': de.payment_mode,
                'receipt_no': getattr(p, 'receipt_no', '') if p else '',
            })

        # Loan repayments list
        loan_repayments_list = list(LoanRepayment.objects.filter(
            is_paid=True
        ).filter(
            models.Q(paid_date__gte=start, paid_date__lte=end) |
            models.Q(paid_date__isnull=True, due_date__gte=start, due_date__lte=end)
        ).select_related('loan__member').values(
            'id', 'loan__member__full_name', 'loan__member__member_no', 'loan__loan_no',
            'instalment_no', 'amount_paid', 'principal_paid', 'interest_paid', 'paid_date', 'payment_mode'
        ))
        for item in loan_repayments_list:
            if not item.get('amount_paid') or item.get('amount_paid') <= 0:
                try:
                    lr_obj = LoanRepayment.objects.select_related('loan').get(pk=item['id'])
                    if lr_obj and lr_obj.loan:
                        item['amount_paid'] = lr_obj.loan.emi_amount
                except Exception:
                    pass

        # Masavari list
        masavari_list = list(MasavariPayment.objects.filter(
            status='paid', paid_date__gte=start, paid_date__lte=end
        ).select_related('member').values(
            'id', 'member__full_name', 'member__member_no', 'month', 'year', 'amount', 'paid_date', 'payment_mode', 'receipt_no'
        ))

        # Dues list
        dues_list = list(Due.objects.filter(
            status='paid', paid_date__gte=start, paid_date__lte=end
        ).select_related('member').values(
            'id', 'member__full_name', 'member__member_no', 'due_type', 'amount', 'paid_date'
        ))

        # Deposits list (Registration fees & Share Capital)
        deposits_list = list(Deposit.objects.filter(
            deposit_date__gte=start, deposit_date__lte=end
        ).select_related('member').values(
            'id', 'member__full_name', 'member__member_no', 'deposit_type', 'amount', 'deposit_date', 'receipt_no', 'payment_mode'
        ))

        # Welfare winners (claims) list
        welfare_winners_list = list(ChitEnrollment.objects.filter(
            prize_won=True, prize_date__gte=start, prize_date__lte=end
        ).select_related('member', 'chit_group').values(
            'id', 'member__full_name', 'member__member_no', 'non_member_name',
            'chit_group__group_name', 'chit_group__group_no', 'ticket_number',
            'prize_amount', 'surcharge_amount', 'reduction_amount', 'prize_date',
            'received_date', 'payout_payment_mode', 'cheque_number'
        ))

        # Other Profits & Income (Welfare surcharge/reduction, Loan service/urgent charges, and other income)
        other_incomes = DailyEntry.objects.filter(
            entry_type='income',
            category__in=['welfare_surcharge', 'welfare_reduction', 'loan_service_charge', 'other_income'],
            date__gte=start,
            date__lte=end
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')

        other_incomes_count = DailyEntry.objects.filter(
            entry_type='income',
            category__in=['welfare_surcharge', 'welfare_reduction', 'loan_service_charge', 'other_income'],
            date__gte=start,
            date__lte=end
        ).count()

        other_incomes_list = list(DailyEntry.objects.filter(
            entry_type='income',
            category__in=['welfare_surcharge', 'welfare_reduction', 'loan_service_charge', 'other_income'],
            date__gte=start,
            date__lte=end
        ).select_related('member').values(
            'id', 'category', 'amount', 'date', 'description', 'payment_mode', 'member__full_name', 'member__member_no'
        ))

        # General expenses list
        expenses_list = list(DailyEntry.objects.filter(
            entry_type='expense', date__gte=start, date__lte=end
        ).values(
            'id', 'category', 'amount', 'date', 'description'
        ))
        total_expenses = sum(float(x['amount']) for x in expenses_list)

        # Total inflow
        total_inflow = welfare_collections + loan_repayments + dues_collected + deposits_made + masavari_collected + other_incomes

        return Response({
            'period': period,
            'label': label,
            'start': start.isoformat(),
            'end': end.isoformat(),
            'welfare_collections': str(welfare_collections),
            'welfare_count': welfare_count,
            'welfare_list': welfare_collections_list,
            'loan_repayments': str(loan_repayments),
            'loan_repayment_count': loan_repayment_count,
            'loan_list': loan_repayments_list,
            'dues_collected': str(dues_collected),
            'dues_list': dues_list,
            'masavari_collected': str(masavari_collected),
            'masavari_count': masavari_count,
            'masavari_list': masavari_list,
            'deposits_made': str(deposits_made),
            'deposits_list': deposits_list,
            'other_incomes': str(other_incomes),
            'other_incomes_count': other_incomes_count,
            'other_incomes_list': other_incomes_list,
            'welfare_winners_list': welfare_winners_list,
            'expenses_list': expenses_list,
            'total_expenses': str(total_expenses),
            'total_inflow': str(total_inflow),
            'new_members': new_members,
            'new_members_list': new_members_list,
            'new_loans': new_loans,
            'new_loans_amount': str(new_loans_amount),
        })


class WelfarePaymentsReportView(APIView):
    """GET /api/reports/welfare-payments/ — customized reports of welfare payments."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from apps.chits.models import ChitPayment
        import datetime
        
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        member_id = request.query_params.get('member')
        group_id = request.query_params.get('chit_group')
        status = request.query_params.get('status')
        
        qs = ChitPayment.objects.select_related(
            'enrollment__member', 'enrollment__chit_group'
        ).order_by('due_date')
        
        if start_date:
            qs = qs.filter(due_date__gte=start_date)
        if end_date:
            qs = qs.filter(due_date__lte=end_date)
        if member_id:
            qs = qs.filter(enrollment__member_id=member_id)
        if group_id:
            qs = qs.filter(enrollment__chit_group_id=group_id)
            
        today = timezone.now().date()
        if status == 'paid':
            qs = qs.filter(is_paid=True)
        elif status == 'pending':
            qs = qs.filter(is_paid=False)
        elif status == 'overdue':
            qs = qs.filter(is_paid=False, due_date__lt=today)
            
        data = []
        for p in qs:
            name = p.enrollment.member.full_name if p.enrollment.member else p.enrollment.non_member_name
            no = p.enrollment.member.member_no if p.enrollment.member else 'Non-Member'
            data.append({
                'id': p.id,
                'member_name': name,
                'member_no': no,
                'group_name': p.enrollment.chit_group.group_name,
                'group_no': p.enrollment.chit_group.group_no,
                'month_number': p.month_number,
                'installment_amount': str(p.installment_amount),
                'amount_paid': str(p.amount_paid),
                'due_date': p.due_date.isoformat(),
                'paid_date': p.paid_date.isoformat() if p.paid_date else None,
                'payment_mode': p.payment_mode,
                'receipt_no': p.receipt_no,
                'is_paid': p.is_paid,
                'is_overdue': not p.is_paid and p.due_date < today,
                'days_overdue': (today - p.due_date).days if (not p.is_paid and p.due_date < today) else 0,
            })
            
        return Response({'results': data})


class LoanRepaymentsReportView(APIView):
    """GET /api/reports/loan-repayments/ — customized reports of loan repayments."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from apps.loans.models import LoanRepayment
        from django.db import models
        import datetime
        
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        member_id = request.query_params.get('member')
        status = request.query_params.get('status')
        
        qs = LoanRepayment.objects.select_related(
            'loan__member'
        )
        
        if member_id:
            qs = qs.filter(loan__member_id=member_id)
            
        today = timezone.now().date()
        if status == 'paid':
            qs = qs.filter(is_paid=True)
            if start_date:
                qs = qs.filter(models.Q(paid_date__gte=start_date) | models.Q(paid_date__isnull=True, due_date__gte=start_date))
            if end_date:
                qs = qs.filter(models.Q(paid_date__lte=end_date) | models.Q(paid_date__isnull=True, due_date__lte=end_date))
            qs = qs.order_by('paid_date', 'due_date')
        elif status == 'pending':
            qs = qs.filter(is_paid=False)
            if start_date:
                qs = qs.filter(due_date__gte=start_date)
            if end_date:
                qs = qs.filter(due_date__lte=end_date)
            qs = qs.order_by('due_date')
        elif status == 'overdue':
            qs = qs.filter(is_paid=False, due_date__lt=today)
            if start_date:
                qs = qs.filter(due_date__gte=start_date)
            if end_date:
                qs = qs.filter(due_date__lte=end_date)
            qs = qs.order_by('due_date')
        else:
            if start_date and end_date:
                qs = qs.filter(
                    models.Q(is_paid=True, paid_date__gte=start_date, paid_date__lte=end_date) |
                    models.Q(is_paid=True, paid_date__isnull=True, due_date__gte=start_date, due_date__lte=end_date) |
                    models.Q(is_paid=False, due_date__gte=start_date, due_date__lte=end_date)
                )
            elif start_date:
                qs = qs.filter(
                    models.Q(is_paid=True, paid_date__gte=start_date) |
                    models.Q(is_paid=True, paid_date__isnull=True, due_date__gte=start_date) |
                    models.Q(is_paid=False, due_date__gte=start_date)
                )
            elif end_date:
                qs = qs.filter(
                    models.Q(is_paid=True, paid_date__lte=end_date) |
                    models.Q(is_paid=True, paid_date__isnull=True, due_date__lte=end_date) |
                    models.Q(is_paid=False, due_date__lte=end_date)
                )
            qs = qs.order_by('due_date')
            
        data = []
        for r in qs:
            actual_amount = r.amount_paid if (r.is_paid and r.amount_paid and r.amount_paid > 0) else (r.loan.emi_amount if r.loan else Decimal('0.00'))
            data.append({
                'id': r.id,
                'member_name': r.loan.member.full_name if r.loan and r.loan.member else '',
                'member_no': r.loan.member.member_no if r.loan and r.loan.member else '',
                'loan_no': r.loan.loan_no if r.loan else '',
                'instalment_no': r.instalment_no,
                'amount_paid': str(actual_amount),
                'due_date': r.due_date.isoformat() if r.due_date else '',
                'paid_date': r.paid_date.isoformat() if r.paid_date else None,
                'payment_mode': r.payment_mode,
                'receipt_no': r.receipt_no,
                'is_paid': r.is_paid,
                'is_overdue': not r.is_paid and r.due_date and r.due_date < today,
                'days_overdue': (today - r.due_date).days if (not r.is_paid and r.due_date and r.due_date < today) else 0,
            })
            
        return Response({'results': data})

