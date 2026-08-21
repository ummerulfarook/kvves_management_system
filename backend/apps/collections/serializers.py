from rest_framework import serializers
from .models import DailyEntry


class DailyEntrySerializer(serializers.ModelSerializer):
    member_name = serializers.CharField(source='member.full_name', read_only=True, default='')
    member_no = serializers.CharField(source='member.member_no', read_only=True, default='')
    description = serializers.CharField(required=False, allow_blank=True, allow_null=True, default='')
    recorded_by_name = serializers.SerializerMethodField()

    class Meta:
        model = DailyEntry
        fields = '__all__'
        read_only_fields = ['created_at', 'recorded_by']

    def get_recorded_by_name(self, obj):
        if obj.recorded_by:
            return obj.recorded_by.get_full_name() or obj.recorded_by.username
        return None
