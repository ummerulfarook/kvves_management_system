"""
URL configuration for the loans app.
"""

from django.urls import path
from . import views

urlpatterns = [
    path('loans/', views.LoanListCreateView.as_view(), name='loans-list'),
    path('loans/overdue/', views.LoanOverdueView.as_view(), name='loans-overdue'),
    path('loans/<int:pk>/', views.LoanDetailView.as_view(), name='loans-detail'),
    path('loans/<int:pk>/approve/', views.LoanApproveView.as_view(), name='loans-approve'),
    path('loans/<int:pk>/close/', views.LoanCloseView.as_view(), name='loans-close'),
    path('loans/<int:loan_pk>/repayments/', views.LoanRepaymentListCreateView.as_view(), name='loan-repayments-list'),
    path('loans/<int:loan_pk>/bulk-repayment/', views.LoanBulkRepaymentView.as_view(), name='loan-bulk-repayment'),
    path('repayments/<int:pk>/', views.LoanRepaymentDetailView.as_view(), name='loan-repayment-detail'),
]
