from django.db import models
from django.conf import settings


class DailyEntry(models.Model):
    ENTRY_TYPES = [
        ('income', 'Income'),
        ('expense', 'Expense'),
    ]

    CATEGORIES = [
        ('welfare_payment', 'Welfare Payment'),
        ('loan_emi', 'Loan EMI'),
        ('curry_payment', 'Curry Payment'),
        ('deposit', 'Deposit'),
        ('due', 'Due'),
        ('membership_fee', 'Membership Fee'),
        ('share_capital', 'Share Capital'),
        ('masavari', 'Masavari / Monthly Fee'),
        ('registration_fee', 'Registration Fee'),
        ('welfare_surcharge', 'Welfare Surcharge (Profit)'),
        ('welfare_reduction', 'Welfare Grace Period Reduction (Profit)'),
        ('loan_service_charge', 'Loan Service Charge (Profit)'),
        ('other_income', 'Other Income'),
        ('salary', 'Salary Expense'),
        ('rent', 'Rent Expense'),
        ('current_bill', 'Current Bill'),
        ('district_counsil', 'District Council'),
        ('cycle_expense', 'Cycle Expense'),
        ('printing_stationary', 'Printing & Stationary'),
        ('office_expense', 'Office Expense'),
        ('internet', 'Internet'),
        ('water', 'Water'),
        ('pothuyokam', 'Pothuyokam'),
        ('sitting_fees', 'Sitting Fees'),
        ('welfare_payout', 'Welfare Payout'),
        ('misc_expense', 'Miscellaneous Expense'),
        ('other_expense', 'Other Expense'),
    ]

    PAYMENT_MODES = [
        ('cash', 'Cash'),
        ('bank_transfer', 'Bank Transfer'),
        ('cheque', 'Cheque'),
        ('upi', 'UPI'),
    ]

    date = models.DateField()
    entry_type = models.CharField(max_length=10, choices=ENTRY_TYPES)
    category = models.CharField(max_length=30, choices=CATEGORIES)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    description = models.TextField(blank=True)

    # Optional relationships
    member = models.ForeignKey(
        'members.Member',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='daily_entries'
    )
    payment_mode = models.CharField(max_length=20, choices=PAYMENT_MODES, default='cash')
    receipt_no = models.CharField(max_length=50, blank=True, default='')
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True
    )
    created_at = models.DateTimeField(auto_now_add=True)

    # Internal references to trigger/track updates
    chit_payment = models.ForeignKey(
        'chits.ChitPayment',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='daily_entries'
    )
    loan_repayment = models.ForeignKey(
        'loans.LoanRepayment',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='daily_entries'
    )
    curry_payment = models.ForeignKey(
        'curries.CurryPayment',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='daily_entries'
    )
    deposit = models.ForeignKey(
        'dues.Deposit',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='daily_entries'
    )
    due = models.ForeignKey(
        'dues.Due',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='daily_entries'
    )

    class Meta:
        ordering = ['-date', '-created_at']
        db_table = 'collections_dailyentry'

    def __str__(self):
        return f"{self.date} — {self.entry_type} — {self.category} — ₹{self.amount}"
