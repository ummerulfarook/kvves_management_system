"""
Serializers for the chits app.
"""

from rest_framework import serializers
from django.utils import timezone

from .models import ChitGroup, ChitEnrollment, ChitPayment, WelfareAuction, WelfareAuctionSlot


class ChitPaymentSerializer(serializers.ModelSerializer):
    is_overdue = serializers.SerializerMethodField()
    days_overdue = serializers.SerializerMethodField()
    recorded_by_name = serializers.SerializerMethodField()

    class Meta:
        model = ChitPayment
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


class ChitPaymentOverdueSerializer(serializers.ModelSerializer):
    """Richer serializer for overdue list - includes nested enrollment info."""
    is_overdue = serializers.SerializerMethodField()
    days_overdue = serializers.SerializerMethodField()
    enrollment_id = serializers.IntegerField(source='enrollment.id', read_only=True)
    member_name = serializers.SerializerMethodField()
    member_no = serializers.SerializerMethodField()
    member_id = serializers.SerializerMethodField()
    group_name = serializers.CharField(source='enrollment.chit_group.group_name', read_only=True)
    group_no = serializers.CharField(source='enrollment.chit_group.group_no', read_only=True)

    class Meta:
        model = ChitPayment
        fields = [
            'id', 'enrollment_id', 'member_name', 'member_no', 'member_id',
            'group_name', 'group_no', 'month_number', 'installment_amount', 'amount_paid',
            'due_date', 'is_overdue', 'days_overdue', 'is_paid',
        ]

    def get_is_overdue(self, obj):
        return obj.is_overdue

    def get_days_overdue(self, obj):
        return obj.days_overdue

    def get_member_name(self, obj):
        if obj.enrollment and obj.enrollment.member:
            return obj.enrollment.member.full_name
        if obj.enrollment and obj.enrollment.non_member_name:
            return f"{obj.enrollment.non_member_name} (Non-Member)"
        return 'Non-Member'

    def get_member_no(self, obj):
        if obj.enrollment and obj.enrollment.member:
            return obj.enrollment.member.member_no
        return 'Non-Member'

    def get_member_id(self, obj):
        if obj.enrollment and obj.enrollment.member:
            return obj.enrollment.member.id
        return None


class ChitEnrollmentSerializer(serializers.ModelSerializer):
    member_name = serializers.SerializerMethodField()
    member_no = serializers.SerializerMethodField()
    group_name = serializers.CharField(source='chit_group.group_name', read_only=True)
    group_no = serializers.CharField(source='chit_group.group_no', read_only=True)
    guarantor1_name = serializers.SerializerMethodField()
    guarantor2_name = serializers.SerializerMethodField()
    monthly_instalment = serializers.DecimalField(
        source='chit_group.monthly_instalment',
        max_digits=10, decimal_places=2, read_only=True
    )
    paid_months = serializers.IntegerField(read_only=True)
    total_paid_amount = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    payments = ChitPaymentSerializer(many=True, read_only=True)
    next_pending_month = serializers.SerializerMethodField()

    class Meta:
        model = ChitEnrollment
        fields = '__all__'
        read_only_fields = ['created_at']
        validators = []  # Disable automatic unique-together validator
        extra_kwargs = {
            'chit_group': {'required': False},
            'ticket_number': {'required': False, 'allow_blank': True, 'allow_null': True},
            'enrollment_date': {'required': False, 'allow_null': True},
            'guarantor1': {'required': False, 'allow_null': True},
            'guarantor2': {'required': False, 'allow_null': True},
            'member': {'required': False, 'allow_null': True},
            'non_member_name': {'required': False, 'allow_blank': True, 'allow_null': True},
            'non_member_phone': {'required': False, 'allow_blank': True, 'allow_null': True},
            'non_member_address': {'required': False, 'allow_blank': True, 'allow_null': True},
            'guarantor1_non_member_name': {'required': False, 'allow_blank': True, 'allow_null': True},
            'guarantor1_non_member_phone': {'required': False, 'allow_blank': True, 'allow_null': True},
            'guarantor2_non_member_name': {'required': False, 'allow_blank': True, 'allow_null': True},
            'guarantor2_non_member_phone': {'required': False, 'allow_blank': True, 'allow_null': True},
        }

    def get_guarantor1_name(self, obj):
        if obj.guarantor1:
            return obj.guarantor1.full_name
        if obj.guarantor1_non_member_name:
            return f"{obj.guarantor1_non_member_name} (Non-Member)"
        return None

    def get_guarantor2_name(self, obj):
        if obj.guarantor2:
            return obj.guarantor2.full_name
        if obj.guarantor2_non_member_name:
            return f"{obj.guarantor2_non_member_name} (Non-Member)"
        return None

    def get_next_pending_month(self, obj):
        pending = obj.payments.filter(is_paid=False).order_by('month_number').first()
        if pending:
            return pending.month_number
        return None

    def get_member_name(self, obj):
        if obj.member:
            return obj.member.full_name
        return obj.non_member_name

    def get_member_no(self, obj):
        if obj.member:
            return obj.member.member_no
        return 'Non-Member'

    def create(self, validated_data):
        char_fields = [
            'non_member_name', 'non_member_phone', 'non_member_address',
            'guarantor1_non_member_name', 'guarantor1_non_member_phone',
            'guarantor2_non_member_name', 'guarantor2_non_member_phone',
            'ticket_number', 'division_label', 'remarks', 'cheque_number'
        ]
        for field in char_fields:
            if field not in validated_data or validated_data[field] is None:
                validated_data[field] = ""
        return super().create(validated_data)

    def validate(self, attrs):
        view = self.context.get('view')
        group = None
        if view and hasattr(view, 'kwargs') and 'group_pk' in view.kwargs:
            try:
                from .models import ChitGroup
                group = ChitGroup.objects.get(pk=view.kwargs['group_pk'])
            except ChitGroup.DoesNotExist:
                pass

        if not group and self.instance:
            group = self.instance.chit_group

        if not group:
            group = attrs.get('chit_group')

        if not group:
            raise serializers.ValidationError({'chit_group': 'Welfare scheme is required.'})

        # Enforce total members limit on new enrollments
        if not self.instance:
            if group.enrolled_count >= group.total_members:
                raise serializers.ValidationError({
                    'non_field_errors': f"Cannot add member. This welfare scheme is already full (limit of {group.total_members} members reached)."
                })

        member = attrs.get('member')
        non_member_name = attrs.get('non_member_name')
        non_member_phone = attrs.get('non_member_phone')
        guarantor1 = attrs.get('guarantor1')
        guarantor2 = attrs.get('guarantor2')

        # Fallback to existing instance values for partial updates (PATCH)
        if self.instance:
            if 'member' not in attrs:
                member = self.instance.member
            if 'non_member_name' not in attrs:
                non_member_name = self.instance.non_member_name
            if 'non_member_phone' not in attrs:
                non_member_phone = self.instance.non_member_phone
            if 'guarantor1' not in attrs:
                guarantor1 = self.instance.guarantor1
            if 'guarantor2' not in attrs:
                guarantor2 = self.instance.guarantor2

        # Division validation and auto ticket assignment
        division_label = attrs.get('division_label') or (self.instance.division_label if self.instance else None)
        if not division_label:
            division_label = group.effective_division_labels[0]
            attrs['division_label'] = division_label

        if division_label:
            valid_labels = group.effective_division_labels
            if division_label not in valid_labels:
                raise serializers.ValidationError({
                    'division_label': f"Invalid division. Choose from {', '.join(valid_labels)}."
                })

        if not attrs.get('enrollment_date'):
            from django.utils import timezone
            attrs['enrollment_date'] = timezone.now().date()

        # Clean CharFields to avoid IntegrityError (NOT NULL constraint failed)
        char_fields = [
            'non_member_name', 'non_member_phone', 'non_member_address',
            'guarantor1_non_member_name', 'guarantor1_non_member_phone',
            'guarantor2_non_member_name', 'guarantor2_non_member_phone',
            'ticket_number', 'division_label', 'remarks', 'cheque_number'
        ]
        for field in char_fields:
            if field in attrs and attrs[field] is None:
                attrs[field] = ""
            elif field not in attrs and not self.instance:
                attrs[field] = ""

        if not attrs.get('ticket_number') and not (self.instance and self.instance.ticket_number):
            from re import search
            enrollments = group.enrollments.all()
            max_num = 0
            for e in enrollments:
                if e.ticket_number:
                    match = search(r'(\d+)', str(e.ticket_number))
                    if match:
                        num = int(match.group(1))
                        if num > max_num:
                            max_num = num
            attrs['ticket_number'] = str(max_num + 1)

        ticket_no = attrs.get('ticket_number') or (self.instance.ticket_number if self.instance else None)
        if ticket_no and group:
            qs_ticket = ChitEnrollment.objects.filter(chit_group=group, ticket_number=ticket_no)
            if self.instance:
                qs_ticket = qs_ticket.exclude(pk=self.instance.pk)
            if qs_ticket.exists():
                raise serializers.ValidationError({
                    'ticket_number': f'Token / Ticket number {ticket_no} is already assigned in this welfare scheme.'
                })

        # Non-member validation
        if not member:
            if not non_member_name:
                raise serializers.ValidationError({
                    'non_member_name': 'Either a Member or a Non-Member Name is required.'
                })
            if guarantor1 and guarantor2 and guarantor1 == guarantor2:
                raise serializers.ValidationError({
                    'guarantor2': 'Guarantor 1 and Guarantor 2 must be different.'
                })

        # 3. Ticket number uniqueness in this group
        ticket_number = attrs.get('ticket_number') or (self.instance.ticket_number if self.instance else None)
        if ticket_number:
            qs_ticket = ChitEnrollment.objects.filter(chit_group=group, ticket_number=ticket_number)
            if self.instance:
                qs_ticket = qs_ticket.exclude(pk=self.instance.pk)
            if qs_ticket.exists():
                raise serializers.ValidationError({
                    'ticket_number': f'Ticket number {ticket_number} is already taken in this welfare scheme.'
                })

        return attrs


class ChitGroupSerializer(serializers.ModelSerializer):
    enrolled_count = serializers.IntegerField(read_only=True)
    enrollments = ChitEnrollmentSerializer(many=True, read_only=True)
    suggested_ticket_number = serializers.SerializerMethodField()

    class Meta:
        model = ChitGroup
        fields = '__all__'
        read_only_fields = ['created_at']
        extra_kwargs = {
            'monthly_instalment': {'required': False},
        }

    def get_suggested_ticket_number(self, obj):
        tickets = obj.enrollments.values_list('ticket_number', flat=True)
        int_tickets = []
        import re
        for t in tickets:
            if not t:
                continue
            try:
                int_tickets.append(int(t))
            except ValueError:
                nums = re.findall(r'\d+', str(t))
                if nums:
                    int_tickets.append(int(nums[-1]))
        return max(int_tickets) + 1 if int_tickets else 1

    def validate(self, attrs):
        # Auto-calculate monthly instalment
        chit_value = attrs.get('chit_value')
        number_of_divisions = attrs.get('number_of_divisions')
        eff_divs = 1 if (number_of_divisions is None or number_of_divisions == 0) else number_of_divisions
        total_members = attrs.get('total_members')
        if chit_value and total_members:
            from decimal import Decimal
            attrs['monthly_instalment'] = (Decimal(str(chit_value)) * Decimal(str(eff_divs))) / Decimal(str(total_members))

        start = attrs.get('start_date')
        end = attrs.get('end_date')
        if start and end and end < start:
            raise serializers.ValidationError({'end_date': 'End date must be after start date.'})
        return attrs


class ChitGroupListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for chit group list view."""
    enrolled_count = serializers.SerializerMethodField()
    suggested_ticket_number = serializers.SerializerMethodField()

    class Meta:
        model = ChitGroup
        fields = [
            'id', 'group_no', 'group_name', 'chit_value', 'monthly_instalment',
            'duration_months', 'total_members', 'start_date', 'end_date',
            'status', 'enrolled_count', 'suggested_ticket_number',
            'number_of_divisions', 'division_labels', 'current_month',
            'processing_days',
        ]

    def get_enrolled_count(self, obj):
        return obj.enrollments.filter(status__in=['active', 'awarded']).count()

    def get_suggested_ticket_number(self, obj):
        tickets = obj.enrollments.values_list('ticket_number', flat=True)
        int_tickets = []
        for t in tickets:
            try:
                int_tickets.append(int(t))
            except ValueError:
                pass
        return max(int_tickets) + 1 if int_tickets else 1


class WelfareAuctionSlotSerializer(serializers.ModelSerializer):
    member_name = serializers.CharField(source='enrollment.member.full_name', read_only=True, allow_null=True)
    member_no = serializers.CharField(source='enrollment.member.member_no', read_only=True, allow_null=True)
    non_member_name = serializers.CharField(source='enrollment.non_member_name', read_only=True, allow_null=True)
    enrollment_ticket_number = serializers.CharField(source='enrollment.ticket_number', read_only=True, allow_null=True)

    class Meta:
        model = WelfareAuctionSlot
        fields = '__all__'


class WelfareAuctionSerializer(serializers.ModelSerializer):
    slots = WelfareAuctionSlotSerializer(many=True, read_only=True)

    class Meta:
        model = WelfareAuction
        fields = '__all__'
