from datetime import date

from django.contrib.auth import authenticate, login, logout
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle

from .club import valid_birthday
from .models import Address, Customer
from .roles import is_panel_user, role_of
from .otp import OtpError, RESEND_AFTER, expose_code_in_response, request_code, verify_code
from .serializers import AddressSerializer, OtpRequestSerializer, OtpVerifySerializer, StaffLoginSerializer, me_payload


class AuthThrottle(AnonRateThrottle):
    scope = "auth"


def client_ip(request):
    return request.META.get("REMOTE_ADDR")


@api_view(["GET"])
@ensure_csrf_cookie
def csrf(request):
    """Sets the csrftoken cookie the browser must echo back in X-CSRFToken."""
    return Response({"ok": True})


@api_view(["GET"])
@ensure_csrf_cookie
def me(request):
    return Response(me_payload(request.user))


@api_view(["POST"])
@throttle_classes([AuthThrottle])
def otp_request(request):
    s = OtpRequestSerializer(data=request.data)
    s.is_valid(raise_exception=True)
    try:
        _, code = request_code(s.validated_data["phone"], ip=client_ip(request))
    except OtpError as e:
        return Response({"detail": e.message, "retry_in": e.retry_in}, status=status.HTTP_429_TOO_MANY_REQUESTS)
    payload = {"sent": True, "resend_in": int(RESEND_AFTER.total_seconds())}
    if expose_code_in_response():
        payload["debug_code"] = code
    return Response(payload)


@api_view(["POST"])
@throttle_classes([AuthThrottle])
def otp_verify(request):
    s = OtpVerifySerializer(data=request.data)
    s.is_valid(raise_exception=True)
    try:
        user = verify_code(s.validated_data["phone"], s.validated_data["code"])
    except OtpError as e:
        return Response({"detail": e.message}, status=status.HTTP_400_BAD_REQUEST)
    login(request, user, backend="django.contrib.auth.backends.ModelBackend")
    return Response(me_payload(user))


@api_view(["POST"])
@throttle_classes([AuthThrottle])
def staff_login(request):
    s = StaffLoginSerializer(data=request.data)
    s.is_valid(raise_exception=True)
    user = authenticate(request, **s.validated_data)
    if user is None or not is_panel_user(user):
        return Response({"detail": "نام کاربری یا رمز عبور درست نیست."}, status=status.HTTP_400_BAD_REQUEST)
    login(request, user)
    return Response(me_payload(user))


@api_view(["POST"])
def logout_view(request):
    logout(request)
    return Response({"authenticated": False})


class AddressViewSet(viewsets.ModelViewSet):
    serializer_class = AddressSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        return Address.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


@api_view(["PATCH"])
@permission_classes([permissions.IsAuthenticated])
def update_profile(request):
    user = request.user
    if request.data.get("birthday"):
        # The customer gives their birthday once, for the birthday discount; after that only the shop changes it.
        if role_of(user) != "customer":
            return Response({"birthday": ["فقط مشتری تاریخ تولد ثبت می‌کند."]}, status=status.HTTP_400_BAD_REQUEST)
        try:
            birthday = date.fromisoformat(str(request.data["birthday"]))
        except ValueError:
            return Response({"birthday": ["تاریخ درست نیست."]}, status=status.HTTP_400_BAD_REQUEST)
        problem = valid_birthday(birthday)
        if problem:
            return Response({"birthday": [problem]}, status=status.HTTP_400_BAD_REQUEST)
        customer, _ = Customer.objects.get_or_create(phone=user.username)
        if customer.birthday and customer.birthday != birthday:
            return Response({"birthday": ["تاریخ تولد فقط یک بار ثبت می‌شود. برای تغییرش با فروشگاه تماس بگیر."]}, status=status.HTTP_400_BAD_REQUEST)
        customer.birthday = birthday
        customer.save(update_fields=["birthday", "updated_at"])
    for field in ("first_name", "last_name"):
        if field in request.data:
            setattr(user, field, str(request.data[field]).strip()[:150])
    user.save(update_fields=["first_name", "last_name"])
    return Response(me_payload(user))
