"""
Serializers for the members app.
"""

import re
from rest_framework import serializers
from django.utils import timezone

from .models import Member, Allowance


class MemberListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for list views."""

    class Meta:
        model = Member
        fields = [
            'id', 'member_no', 'full_name', 'phone', 'membership_type',
            'status', 'joining_date', 'gender', 'district', 'photo',
        ]


class MemberDetailSerializer(serializers.ModelSerializer):
    """Full serializer for create/retrieve/update."""

    created_by_name = serializers.SerializerMethodField()
    age = serializers.SerializerMethodField()
    masavari_paid_till = serializers.DateField(required=False, allow_null=True)

    class Meta:
        model = Member
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at', 'created_by']

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        last_paid = instance.masavari_payments.filter(status='paid').order_by('-year', '-month').first()
        if last_paid:
            import datetime
            ret['masavari_paid_till'] = datetime.date(last_paid.year, last_paid.month, 1).isoformat()
        else:
            ret['masavari_paid_till'] = None
        return ret

    def get_created_by_name(self, obj):
        if obj.created_by:
            return f"{obj.created_by.first_name} {obj.created_by.last_name}".strip() or obj.created_by.username
        return None

    def get_age(self, obj):
        return obj.age

    def validate_member_no(self, value):
        qs = Member.objects.filter(member_no=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('A member with this number already exists.')
        return value

    def validate_phone(self, value):
        cleaned = re.sub(r'\D', '', value)
        if len(cleaned) != 10:
            raise serializers.ValidationError('Phone number must be exactly 10 digits.')
        return cleaned

    def validate_aadhaar_number(self, value):
        if value and not re.fullmatch(r'\d{12}', value):
            raise serializers.ValidationError('Aadhaar number must be exactly 12 digits.')
        return value

    def validate_pan_number(self, value):
        if value and not re.fullmatch(r'[A-Z]{5}[0-9]{4}[A-Z]{1}', value.upper()):
            raise serializers.ValidationError('PAN must follow the format: ABCDE1234F')
        return value.upper() if value else value

    def validate_joining_date(self, value):
        if value > timezone.localdate():
            raise serializers.ValidationError('Joining date cannot be in the future.')
        return value

    def validate_pin_code(self, value):
        if value and not re.fullmatch(r'\d{6}', value):
            raise serializers.ValidationError('PIN code must be 6 digits.')
        return value

    def create(self, validated_data):
        masavari_paid_till = validated_data.pop('masavari_paid_till', None)
        request = self.context.get('request')
        recorded_by = None
        if request and request.user.is_authenticated:
            validated_data['created_by'] = request.user
            recorded_by = request.user
        member = super().create(validated_data)
        if masavari_paid_till:
            from .utils import populate_masavari_payments_up_to
            populate_masavari_payments_up_to(member, masavari_paid_till, recorded_by=recorded_by)
        return member

    def update(self, instance, validated_data):
        masavari_paid_till = validated_data.pop('masavari_paid_till', None)
        member = super().update(instance, validated_data)
        if masavari_paid_till:
            request = self.context.get('request')
            recorded_by = request.user if request and request.user.is_authenticated else None
            from .utils import populate_masavari_payments_up_to
            populate_masavari_payments_up_to(member, masavari_paid_till, recorded_by=recorded_by)
        return member


class MemberSummarySerializer(serializers.Serializer):
    """Aggregated summary for a single member."""

    member_id = serializers.IntegerField()
    member_no = serializers.CharField()
    full_name = serializers.CharField()
    status = serializers.CharField()
    total_deposits = serializers.DecimalField(max_digits=14, decimal_places=2)
    active_chits = serializers.IntegerField()
    total_chit_paid = serializers.DecimalField(max_digits=14, decimal_places=2)
    active_loans = serializers.IntegerField()
    total_loan_outstanding = serializers.DecimalField(max_digits=14, decimal_places=2)
    pending_dues = serializers.IntegerField()
    total_due_amount = serializers.DecimalField(max_digits=14, decimal_places=2)


class MemberPhotoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Member
        fields = ['id', 'photo']


class AllowanceSerializer(serializers.ModelSerializer):
    member_name = serializers.CharField(source='member.full_name', read_only=True)
    member_no = serializers.CharField(source='member.member_no', read_only=True)

    class Meta:
        model = Allowance
        fields = '__all__'
        read_only_fields = ['created_at']
