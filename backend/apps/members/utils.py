import datetime
from django.utils import timezone
from django.db.models import Q
from dateutil.relativedelta import relativedelta
from apps.dues.models import MasavariPayment
from apps.members.models import Member

def update_member_masavari_status(member, today=None):
    """
    Calculates the number of unpaid Masavari months from the member's joining date to today.
    If unpaid months >= 12, set status to 'inactive'.
    If unpaid months < 12, set status to 'active'.
    """
    if not today:
        today = timezone.now().date()
        
    start_date = member.joining_date
    if not start_date or start_date > today:
        if member.status == 'inactive':
            member.status = 'active'
            member.remarks = (member.remarks or "") + f"\nAuto-reactivated on {today} (joining date not reached)."
            member.save()
        return

    curr = start_date.replace(day=1)
    end = today.replace(day=1)

    # Fetch all paid Masavari payments (year, month)
    paid_set = set(
        MasavariPayment.objects.filter(member=member, status='paid').values_list('year', 'month')
    )

    unpaid_count = 0
    while curr <= end:
        if (curr.year, curr.month) not in paid_set:
            unpaid_count += 1
        curr += relativedelta(months=1)

    if unpaid_count >= 12:
        if member.status == 'active':
            member.status = 'inactive'
            remarks = member.remarks or ""
            member.remarks = (remarks + f"\nAuto-deactivated on {today} due to non-payment of Masavari for 12+ months (unpaid: {unpaid_count} months).").strip()
            member.save()
    else:
        if member.status == 'inactive':
            member.status = 'active'
            remarks = member.remarks or ""
            member.remarks = (remarks + f"\nAuto-reactivated on {today} after dues reduced to less than 1 year (unpaid: {unpaid_count} months).").strip()
            member.save()


def check_member_masavari_statuses():
    """Checks all active/inactive members' Masavari payments and updates their statuses.
    If unpaid months >= 12, set status to 'inactive'.
    If unpaid months < 12, set status to 'active'.
    """
    today = timezone.now().date()
    members = list(Member.objects.filter(status__in=['active', 'inactive']))

    # Fetch all paid Masavari payments grouped by member
    from collections import defaultdict
    paid_payments = defaultdict(set)
    for mp in MasavariPayment.objects.filter(status='paid').values('member_id', 'year', 'month'):
        paid_payments[mp['member_id']].add((mp['year'], mp['month']))

    for m in members:
        start_date = m.joining_date
        if not start_date or start_date > today:
            if m.status == 'inactive':
                m.status = 'active'
                m.remarks = (m.remarks or "") + f"\nAuto-reactivated on {today} (joining date not reached)."
                m.save()
            continue

        curr = start_date.replace(day=1)
        end = today.replace(day=1)
        
        # Count unpaid months
        unpaid_count = 0
        member_paid = paid_payments[m.id]
        while curr <= end:
            if (curr.year, curr.month) not in member_paid:
                unpaid_count += 1
            curr += relativedelta(months=1)

        if unpaid_count >= 12:
            if m.status == 'active':
                m.status = 'inactive'
                remarks = m.remarks or ""
                m.remarks = (remarks + f"\nAuto-deactivated on {today} due to non-payment of Masavari for 12+ months (unpaid: {unpaid_count} months).").strip()
                m.save()
        else:
            if m.status == 'inactive':
                m.status = 'active'
                remarks = m.remarks or ""
                m.remarks = (remarks + f"\nAuto-reactivated on {today} after dues reduced to less than 1 year (unpaid: {unpaid_count} months).").strip()
                m.save()


def check_and_reactivate_member(member):
    """Re-evaluate the member's status based on their current unpaid dues.
    """
    update_member_masavari_status(member)


def populate_masavari_payments_up_to(member, paid_till_date_or_str, recorded_by=None):
    """
    Given a member and a paid-till date/string, automatically create/update MasavariPayment records
    with status='paid' for all months from joining_date up to the paid-till month/year.
    """
    from apps.dues.models import MasavariPayment
    from dateutil.relativedelta import relativedelta
    from datetime import datetime
    from decimal import Decimal

    if not paid_till_date_or_str:
        return

    # Parse paid_till date
    if isinstance(paid_till_date_or_str, str):
        try:
            if len(paid_till_date_or_str.strip()) == 7: # YYYY-MM
                paid_till = datetime.strptime(paid_till_date_or_str.strip(), '%Y-%m').date()
            else:
                paid_till = datetime.strptime(paid_till_date_or_str.strip(), '%Y-%m-%d').date()
        except ValueError:
            return
    else:
        paid_till = paid_till_date_or_str

    start_date = member.joining_date
    if not start_date or start_date > paid_till:
        return

    curr = start_date.replace(day=1)
    end = paid_till.replace(day=1)

    while curr <= end:
        # Check or create paid masavari payment
        MasavariPayment.objects.update_or_create(
            member=member,
            year=curr.year,
            month=curr.month,
            defaults={
                'amount': member.masavari_amount,
                'due_date': curr + relativedelta(day=5),
                'paid_date': timezone.now().date(),
                'status': 'paid',
                'remarks': 'Pre-populated cleared dues on member creation/import.',
                'recorded_by': recorded_by
            }
        )
        curr += relativedelta(months=1)
