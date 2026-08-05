"""
URL configuration for the reports app.
"""

from django.urls import path
from . import views

urlpatterns = [
    path('reports/dashboard/', views.DashboardView.as_view(), name='reports-dashboard'),
    path('reports/members-summary/', views.MembersSummaryView.as_view(), name='reports-members'),
    path('reports/chits-summary/', views.ChitsSummaryView.as_view(), name='reports-chits'),
    path('reports/loans-summary/', views.LoansSummaryView.as_view(), name='reports-loans'),
    path('reports/dues-summary/', views.DuesSummaryView.as_view(), name='reports-dues'),
    path('reports/overdue-list/', views.OverdueListView.as_view(), name='reports-overdue'),
    path('reports/period/', views.PeriodReportView.as_view(), name='reports-period'),
    path('reports/welfare-payments/', views.WelfarePaymentsReportView.as_view(), name='report-welfare-payments'),
    path('reports/loan-repayments/', views.LoanRepaymentsReportView.as_view(), name='report-loan-repayments'),
]
