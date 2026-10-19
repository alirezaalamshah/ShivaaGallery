from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter(trailing_slash=True)
router.register("addresses", views.AddressViewSet, basename="address")

urlpatterns = [
    path("auth/csrf/", views.csrf),
    path("auth/me/", views.me),
    path("auth/otp/request/", views.otp_request),
    path("auth/otp/verify/", views.otp_verify),
    path("auth/login/", views.staff_login),
    path("auth/logout/", views.logout_view),
    path("auth/profile/", views.update_profile),
] + router.urls
