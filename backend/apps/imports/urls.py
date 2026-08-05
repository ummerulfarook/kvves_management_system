"""
URL configuration for the imports app.
"""

from django.urls import path
from . import views

urlpatterns = [
    path('import/members/', views.MemberImportView.as_view(), name='import-members'),
    path('import/template/members/', views.MemberImportTemplateView.as_view(), name='import-template-members'),
    path('export/members/', views.MemberExportView.as_view(), name='export-members'),
    path('export/member/<int:pk>/', views.SingleMemberExportView.as_view(), name='export-member-single'),
    path('export/overdue/', views.OverdueExportView.as_view(), name='export-overdue'),
    path('export/report/', views.PeriodReportExportView.as_view(), name='export-report'),
    path('export/welfare-report/', views.WelfareReportExportView.as_view(), name='export-welfare-report'),
    path('export/loan-report/', views.LoanReportExportView.as_view(), name='export-loan-report'),
]
