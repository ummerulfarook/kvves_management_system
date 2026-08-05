"""
Views for import/export — Excel upload, validation, preview, and download.
"""

import io
from django.http import HttpResponse
from django.db import transaction
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsAdminOrStaffOrReadOnly
from apps.members.models import Member

from .validators import validate_member_row
from .exporters import export_members, export_overdue, get_member_import_template, export_period_report


class MemberImportView(APIView):
    """POST /api/import/members/ — upload, validate, and import member Excel."""

    permission_classes = [IsAuthenticated, IsAdminOrStaffOrReadOnly]

    def post(self, request):
        try:
            import pandas as pd
        except ImportError:
            return Response({'error': True, 'message': 'pandas not installed.'}, status=500)

        file = request.FILES.get('file')
        if not file:
            return Response({'error': True, 'message': 'No file provided.'}, status=status.HTTP_400_BAD_REQUEST)

        preview_only = request.data.get('preview', 'false').lower() == 'true'

        try:
            df = pd.read_excel(file, dtype=str)
            df = df.fillna('')
        except Exception as e:
            return Response({'error': True, 'message': f'Could not read Excel file: {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)

        # Existing member nos for duplicate check
        existing_nos = set(Member.objects.values_list('member_no', flat=True))
        newly_added = set()

        valid_rows = []
        all_errors = []

        for i, row in df.iterrows():
            row_dict = row.to_dict()
            data, errors = validate_member_row(row_dict, i + 2, existing_nos | newly_added)
            if errors:
                all_errors.extend(errors)
            else:
                valid_rows.append(data)
                newly_added.add(data.get('member_no', ''))

        if preview_only:
            return Response({
                'total_rows': len(df),
                'valid_rows': len(valid_rows),
                'error_count': len(all_errors),
                'errors': all_errors[:50],  # limit to 50 errors in preview
                'preview': valid_rows[:10],  # show first 10 valid rows
            })

        if all_errors:
            return Response({
                'error': True,
                'message': f'{len(all_errors)} validation errors found. Fix them and re-upload.',
                'errors': all_errors[:50],
                'valid_count': len(valid_rows),
            }, status=status.HTTP_400_BAD_REQUEST)

        # Import all valid rows atomically
        try:
            with transaction.atomic():
                created = []
                for data in valid_rows:
                    masavari_paid_till = data.pop('masavari_paid_till', None)
                    member = Member.objects.create(
                        created_by=request.user,
                        **{k: v for k, v in data.items() if v != ''},
                    )
                    created.append(member.member_no)
                    
                    if masavari_paid_till:
                        from apps.members.utils import populate_masavari_payments_up_to
                        populate_masavari_payments_up_to(member, masavari_paid_till, recorded_by=request.user)

                from apps.members.utils import check_member_masavari_statuses
                check_member_masavari_statuses()
        except Exception as e:
            return Response({'error': True, 'message': f'Import failed: {str(e)}'}, status=500)

        return Response({
            'message': f'Successfully imported {len(created)} members.',
            'imported_count': len(created),
            'member_nos': created,
        })


class MemberExportView(APIView):
    """GET /api/export/members/ — download all members as Excel."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        members = Member.objects.prefetch_related(
            'nominees', 'chit_enrollments__chit_group', 'loans', 'deposits'
        ).all()

        # Apply filters from query params
        status_filter = request.query_params.get('status')
        if status_filter:
            members = members.filter(status=status_filter)

        excel_bytes = export_members(members)
        response = HttpResponse(
            excel_bytes,
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        response['Content-Disposition'] = 'attachment; filename="kvva_members.xlsx"'
        return response


class SingleMemberExportView(APIView):
    """GET /api/export/member/{id}/ — download single member full report."""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            member = Member.objects.prefetch_related(
                'nominees', 'chit_enrollments__chit_group', 'loans', 'deposits'
            ).get(pk=pk)
        except Member.DoesNotExist:
            return Response({'error': True, 'message': 'Member not found.'}, status=404)

        excel_bytes = export_members([member])
        response = HttpResponse(
            excel_bytes,
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        response['Content-Disposition'] = f'attachment; filename="member_{member.member_no}.xlsx"'
        return response


class OverdueExportView(APIView):
    """GET /api/export/overdue/ — download overdue or upcoming list as Excel."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        from apps.reports.views import OverdueListView
        view = OverdueListView()
        view.request = request
        res = view.get(request)
        if res.status_code != 200:
            return res

        data = res.data
        t_param = request.query_params.get('type', 'overdue')
        if t_param == 'upcoming':
            records = data.get('upcoming_list', [])
            filename = "kvva_upcoming.xlsx"
        else:
            records = data.get('overdue_list', [])
            filename = "kvva_overdue.xlsx"

        from .exporters import export_overdue
        excel_bytes = export_overdue(records)
        response = HttpResponse(
            excel_bytes,
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response


class MemberImportTemplateView(APIView):
    """GET /api/import/template/members/ — download import template."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        excel_bytes = get_member_import_template()
        response = HttpResponse(
            excel_bytes,
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        response['Content-Disposition'] = 'attachment; filename="kvva_members_import_template.xlsx"'
        return response


class PeriodReportExportView(APIView):
    """GET /api/export/report/ — download period report as Excel."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from apps.reports.views import PeriodReportView
        # We can construct a request and call PeriodReportView
        view = PeriodReportView()
        view.request = request
        response = view.get(request)
        if response.status_code != 200:
            return response

        data = response.data
        from .exporters import export_period_report
        excel_bytes = export_period_report(data)

        response = HttpResponse(
            excel_bytes,
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        period = data.get('period', 'report')
        label = data.get('label', 'report').replace(' ', '_')
        response['Content-Disposition'] = f'attachment; filename="kvva_{period}_{label}.xlsx"'
        return response


class WelfareReportExportView(APIView):
    permission_classes = [IsAuthenticated]
    def get(self, request):
        from apps.reports.views import WelfarePaymentsReportView
        view = WelfarePaymentsReportView()
        view.request = request
        res = view.get(request)
        if res.status_code != 200:
            return res
        from .exporters import export_welfare_report
        excel_bytes = export_welfare_report(res.data['results'])
        response = HttpResponse(
            excel_bytes,
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        response['Content-Disposition'] = 'attachment; filename="welfare_report.xlsx"'
        return response

class LoanReportExportView(APIView):
    permission_classes = [IsAuthenticated]
    def get(self, request):
        from apps.reports.views import LoanRepaymentsReportView
        view = LoanRepaymentsReportView()
        view.request = request
        res = view.get(request)
        if res.status_code != 200:
            return res
        from .exporters import export_loan_report
        excel_bytes = export_loan_report(res.data['results'])
        response = HttpResponse(
            excel_bytes,
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        response['Content-Disposition'] = 'attachment; filename="loan_report.xlsx"'
        return response
