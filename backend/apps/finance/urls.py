from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("expenses", views.ExpenseViewSet, basename="admin-expense")

urlpatterns = [
    path("reports/", views.report),
] + router.urls
