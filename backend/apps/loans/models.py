"""
Loans app models — Loan and LoanRepayment.
"""

from django.db import models


class Loan(models.Model):
    LOAN_TYPES = [
        ('personal', 'Personal'),
        ('business', 'Business'),
        ('emergency', 'Emergency'),
        ('other', 'Other'),
    ]
    STATUS = [
        ('pending', 'Pending Approval'),
        ('active', 'Active'),
        ('closed', 'Closed'),
        ('defaulted', 'Defaulted'),
        ('written_off', 'Written Off'),
    ]

    loan_no = models.CharField(max_length=20, unique=True)
    member = models.ForeignKey(
        'members.Member',
        on_delete=models.PROTECT,
        related_name='loans',
    )
    loan_type = models.CharField(max_length=20, choices=LOAN_TYPES)
    loan_amount = models.DecimalField(max_digits=12, decimal_places=2)
    service_charge = models.DecimalField(
        max_digits=10, decimal_places=2, default=0,
        help_text='Fixed service charge amount in ₹ (not a percentage)'
    )
    urgent_charge = models.DecimalField(
        max_digits=10, decimal_places=2, default=0.00,
        help_text='Additional charge for urgent/early disbursement in ₹'
    )
    duration_months = models.PositiveIntegerField()
    emi_amount = models.DecimalField(max_digits=10, decimal_places=2)
    repayment_frequency = models.CharField(
        max_length=10,
        choices=[('monthly', 'Monthly'), ('daily', 'Daily')],
        default='monthly',
    )
    disbursement_date = models.DateField(null=True, blank=True)
    purpose = models.TextField(blank=True)
    guarantor = models.ForeignKey(
        'members.Member',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='guaranteed_loans',
    )
    guarantor2 = models.ForeignKey(
        'members.Member',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='guaranteed_loans2',
    )
    outstanding_balance = models.DecimalField(max_digits=12, decimal_places=2)
    status = models.CharField(max_length=20, choices=STATUS, default='pending')
    approved_by = models.ForeignKey(
        'accounts.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    remarks = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        db_table = 'loans_loan'

    def __str__(self):
        return f"{self.loan_no} — {self.member.full_name}"

    def update_outstanding_balance(self):
        from decimal import Decimal
        repayments = list(self.repayments.order_by('instalment_no'))
        running_balance = self.loan_amount
        total_principal_paid = Decimal('0.00')

        for r in repayments:
            paid_amt = r.amount_paid or Decimal('0.00')
            r.principal_paid = paid_amt
            r.interest_paid = Decimal('0.00')
            running_balance -= paid_amt
            total_principal_paid += paid_amt

            if running_balance < Decimal('0.00'):
                running_balance = Decimal('0.00')
            r.outstanding_after = running_balance
            r.save(update_fields=['principal_paid', 'interest_paid', 'outstanding_after'], skip_update=True)

        self.outstanding_balance = max(self.loan_amount - total_principal_paid, Decimal('0.00'))
        if self.outstanding_balance == Decimal('0.00'):
            if self.status in ['active', 'pending']:
                self.status = 'closed'
            for r in repayments:
                if not r.is_paid:
                    r.is_paid = True
                    r.amount_paid = Decimal('0.00')
                    r.principal_paid = Decimal('0.00')
                    r.outstanding_after = Decimal('0.00')
                    r.save(update_fields=['is_paid', 'amount_paid', 'principal_paid', 'outstanding_after'], skip_update=True)
        else:
            if self.status == 'closed':
                self.status = 'active'

        self.save(update_fields=['outstanding_balance', 'status'])

    def apply_loan_payment(self, start_instalment_no, amount, paid_date=None, payment_mode='cash', receipt_no='', recorded_by=None):
        from decimal import Decimal
        from django.utils import timezone
        if not paid_date:
            paid_date = timezone.now().date()

        remaining_payment = Decimal(str(amount))
        repayments = self.repayments.filter(instalment_no__gte=start_instalment_no).order_by('instalment_no')

        for r in repayments:
            if remaining_payment <= Decimal('0.00'):
                break

            needed = r.loan.emi_amount - (r.amount_paid if r.is_paid else Decimal('0.00'))
            if needed <= Decimal('0.00'):
                continue

            if remaining_payment >= needed:
                pay_here = needed
                remaining_payment -= needed
                r.amount_paid = (r.amount_paid or Decimal('0.00')) + pay_here
                r.principal_paid = r.amount_paid
                r.is_paid = True
                r.paid_date = paid_date
                r.payment_mode = payment_mode
                if receipt_no:
                    r.receipt_no = receipt_no
                if recorded_by:
                    r.recorded_by = recorded_by
                r.save(skip_update=True)
            else:
                pay_here = remaining_payment
                remaining_payment = Decimal('0.00')
                r.amount_paid = (r.amount_paid or Decimal('0.00')) + pay_here
                r.principal_paid = r.amount_paid
                r.paid_date = paid_date
                r.payment_mode = payment_mode
                if receipt_no:
                    r.receipt_no = receipt_no
                if recorded_by:
                    r.recorded_by = recorded_by
                if r.amount_paid >= r.loan.emi_amount:
                    r.is_paid = True
                r.save(skip_update=True)

        self.update_outstanding_balance()


class LoanRepayment(models.Model):
    PAYMENT_MODES = [
        ('cash', 'Cash'),
        ('bank_transfer', 'Bank Transfer'),
        ('cheque', 'Cheque'),
        ('upi', 'UPI'),
    ]

    loan = models.ForeignKey(Loan, on_delete=models.PROTECT, related_name='repayments')
    instalment_no = models.PositiveIntegerField()
    amount_paid = models.DecimalField(max_digits=10, decimal_places=2)
    principal_paid = models.DecimalField(max_digits=10, decimal_places=2)
    interest_paid = models.DecimalField(max_digits=10, decimal_places=2, default=0)  # service charge paid
    due_date = models.DateField()
    paid_date = models.DateField(null=True, blank=True)
    payment_mode = models.CharField(max_length=20, choices=PAYMENT_MODES, default='cash')
    receipt_no = models.CharField(max_length=50, blank=True)
    outstanding_after = models.DecimalField(max_digits=12, decimal_places=2)
    is_paid = models.BooleanField(default=False)
    recorded_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['instalment_no']
        db_table = 'loans_loanrepayment'

    def __str__(self):
        return f"Instalment {self.instalment_no} — {self.loan.loan_no}"

    def save(self, *args, **kwargs):
        skip_update = kwargs.pop('skip_update', False)
        from decimal import Decimal
        if self.is_paid:
            if not self.amount_paid:
                self.amount_paid = self.loan.emi_amount
            
            # Service charge is taken upfront at approval, so interest/surcharge paid during emi is 0
            self.interest_paid = Decimal('0.00')
            self.principal_paid = self.amount_paid
        
        super().save(*args, **kwargs)
        if not skip_update:
            self.loan.update_outstanding_balance()

    def delete(self, *args, **kwargs):
        loan = self.loan
        super().delete(*args, **kwargs)
        loan.update_outstanding_balance()

    @property
    def is_overdue(self):
        from django.utils import timezone
        return not self.is_paid and self.due_date < timezone.now().date()

    @property
    def days_overdue(self):
        from django.utils import timezone
        if self.is_overdue:
            return (timezone.now().date() - self.due_date).days
        return 0
