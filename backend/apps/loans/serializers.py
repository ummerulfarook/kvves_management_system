"""
Serializers for the loans app.
"""

from rest_framework import serializers
from .models import Loan, LoanRepayment


class LoanRepaymentSerializer(serializers.ModelSerializer):
    is_overdue = serializers.SerializerMethodField()
    days_overdue = serializers.SerializerMethodField()
    recorded_by_name = serializers.SerializerMethodField()
    emi_amount = serializers.DecimalField(source='loan.emi_amount', max_digits=10, decimal_places=2, read_only=True)

    class Meta:
        model = LoanRepayment
        fields = '__all__'
        read_only_fields = ['created_at', 'recorded_by']

    def get_is_overdue(self, obj):
        return obj.is_overdue

    def get_days_overdue(self, obj):
        return obj.days_overdue

    def get_recorded_by_name(self, obj):
        if obj.recorded_by:
            return obj.recorded_by.get_full_name() or obj.recorded_by.username
        return None

    def create(self, validated_data):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            validated_data['recorded_by'] = request.user
        return super().create(validated_data)


class LoanSerializer(serializers.ModelSerializer):
    member_name = serializers.CharField(source='member.full_name', read_only=True)
    member_no = serializers.CharField(source='member.member_no', read_only=True)
    guarantor_name = serializers.CharField(source='guarantor.full_name', read_only=True, allow_null=True)
    guarantor2_name = serializers.CharField(source='guarantor2.full_name', read_only=True, allow_null=True)
    approved_by_name = serializers.SerializerMethodField()
    repayments = LoanRepaymentSerializer(many=True, read_only=True)
    next_pending_instalment = serializers.SerializerMethodField()

    class Meta:
        model = Loan
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at', 'approved_by', 'outstanding_balance']

    def get_approved_by_name(self, obj):
        if obj.approved_by:
            return obj.approved_by.get_full_name() or obj.approved_by.username
        return None

    def get_next_pending_instalment(self, obj):
        # We need to filter by repayments that are not paid
        pending_payment = obj.repayments.filter(is_paid=False).order_by('instalment_no').first()
        if pending_payment:
            return pending_payment.instalment_no
        return None

    def create(self, validated_data):
        validated_data['outstanding_balance'] = validated_data.get('loan_amount', 0)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        from decimal import Decimal
        from django.utils import timezone
        import datetime
        from dateutil.relativedelta import relativedelta

        old_amount = instance.loan_amount
        old_emi = instance.emi_amount
        old_duration = instance.duration_months
        old_frequency = instance.repayment_frequency
        old_disb = instance.disbursement_date

        loan = super().update(instance, validated_data)

        # If any of these changed and the loan is active/pending, recalculate outstanding balance and recreate repayments
        amount_changed = 'loan_amount' in validated_data and validated_data['loan_amount'] != old_amount
        duration_changed = 'duration_months' in validated_data and validated_data['duration_months'] != old_duration
        emi_changed = 'emi_amount' in validated_data and validated_data['emi_amount'] != old_emi
        frequency_changed = 'repayment_frequency' in validated_data and validated_data['repayment_frequency'] != old_frequency
        disb_changed = 'disbursement_date' in validated_data and validated_data['disbursement_date'] != old_disb

        if amount_changed or duration_changed or emi_changed or frequency_changed or disb_changed:
            if loan.status == 'pending':
                # If pending, outstanding balance is just the loan amount
                loan.outstanding_balance = loan.loan_amount
                loan.save()
            elif loan.status == 'active':
                # Re-generate/update the repayments schedule
                # Delete unpaid repayments
                loan.repayments.filter(is_paid=False).delete()
                
                # Check how many repayments have been paid
                paid_repayments = list(loan.repayments.filter(is_paid=True).order_by('instalment_no'))
                paid_count = len(paid_repayments)

                # Re-calculate due dates for paid repayments if disbursement date changed
                if disb_changed:
                    is_daily = loan.repayment_frequency == 'daily'
                    disb_date = loan.disbursement_date or timezone.now().date()
                    for r in paid_repayments:
                        if is_daily:
                            r.due_date = disb_date + datetime.timedelta(days=r.instalment_no)
                        else:
                            r.due_date = disb_date + relativedelta(months=r.instalment_no)
                        r.save(skip_update=True)
                
                # Recreate remaining unpaid repayments
                total_paid_amt = sum(r.amount_paid for r in paid_repayments)
                balance = loan.loan_amount - total_paid_amt
                is_daily = loan.repayment_frequency == 'daily'
                disb_date = loan.disbursement_date or timezone.now().date()
                
                for i in range(paid_count + 1, loan.duration_months + 1):
                    if is_daily:
                        due_date = disb_date + datetime.timedelta(days=i)
                    else:
                        due_date = disb_date + relativedelta(months=i)
                    
                    principal = loan.emi_amount
                    if i == loan.duration_months:
                        principal = balance
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
                
                # Recalculate outstanding balance on the loan model
                loan.update_outstanding_balance()
                loan.save()

        return loan

    def validate_loan_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError('Loan amount must be positive.')
        return value

    def validate_service_charge(self, value):
        if value < 0:
            raise serializers.ValidationError('Service charge must be 0 or a positive amount.')
        return value

    def validate(self, attrs):
        member = attrs.get('member') or (self.instance.member if self.instance else None)
        guarantor = attrs.get('guarantor') or (self.instance.guarantor if self.instance else None)
        guarantor2 = attrs.get('guarantor2') or (self.instance.guarantor2 if self.instance else None)

        if not guarantor:
            raise serializers.ValidationError({'guarantor': 'Compulsory guarantor is required.'})

        if member == guarantor:
            raise serializers.ValidationError({'guarantor': 'Borrower cannot be their own guarantor.'})

        if guarantor2:
            if member == guarantor2:
                raise serializers.ValidationError({'guarantor2': 'Borrower cannot be their own guarantor.'})
            if guarantor == guarantor2:
                raise serializers.ValidationError({'guarantor2': 'Optional guarantor must be different from compulsory guarantor.'})

        return attrs
