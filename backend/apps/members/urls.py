"""
URL configuration for the members app.
"""

from django.urls import path, include
from . import views

urlpatterns = [
    path('members/', views.MemberListCreateView.as_view(), name='members-list'),
    path('members/<int:pk>/', views.MemberDetailView.as_view(), name='members-detail'),
    path('members/<int:pk>/summary/', views.MemberSummaryView.as_view(), name='members-summary'),
    path('members/<int:pk>/activities/', views.MemberActivitiesView.as_view(), name='members-activities'),
    path('members/<int:pk>/photo/', views.MemberPhotoView.as_view(), name='members-photo'),
    path('members/<int:pk>/chits/', views.MemberChitsView.as_view(), name='members-chits'),
    path('members/<int:pk>/loans/', views.MemberLoansView.as_view(), name='members-loans'),
    path('members/<int:pk>/dues/', views.MemberDuesView.as_view(), name='members-dues'),
    path('members/<int:pk>/deposits/', views.MemberDepositsView.as_view(), name='members-deposits'),
    path('members/<int:pk>/guarantor-loans/', views.MemberGuarantorLoansView.as_view(), name='members-guarantor-loans'),
    path('members/<int:pk>/guarantor-welfare/', views.MemberGuarantorWelfareView.as_view(), name='members-guarantor-welfare'),
    path('members/<int:pk>/masavari/', views.MemberMasavariView.as_view(), name='members-masavari'),
    path('members/<int:pk>/clear-dues/', views.MemberClearDuesView.as_view(), name='member-clear-dues'),
    path('members/<int:pk>/clear-masavari/', views.MemberClearMasavariView.as_view(), name='member-clear-masavari'),
    path('members/<int:pk>/allowances/', views.MemberAllowancesView.as_view(), name='member-allowances'),
    path('allowances/<int:pk>/', views.AllowanceDetailView.as_view(), name='allowance-detail'),
    path('members/<int:member_pk>/nominees/', include('apps.nominees.urls_nested')),
]
