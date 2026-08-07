from django.urls import path
from . import views


urlpatterns = [
    path('collections/daily/', views.DailyEntryListCreateView.as_view(), name='daily-collections-list'),
    path('collections/daily/<int:pk>/', views.DailyEntryDetailView.as_view(), name='daily-collections-detail'),
    path('collections/summary/', views.DailySummaryView.as_view(), name='daily-collections-summary'),
]
