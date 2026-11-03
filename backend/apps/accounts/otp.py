import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.utils import timezone

from .models import OtpCode, hash_code
from .roles import is_panel_user
from .sms import send_sms

CODE_LENGTH = 5
TTL = timedelta(minutes=2)
RESEND_AFTER = timedelta(seconds=60)
MAX_ATTEMPTS = 5
MAX_PER_HOUR = 5


class OtpError(Exception):
    def __init__(self, message, retry_in=None):
        super().__init__(message)
        self.message, self.retry_in = message, retry_in


def request_code(phone, ip=None):
    """Create and send a code. Returns (otp, plain_code). Enforces resend delay and hourly limit."""
    now = timezone.now()
    recent = OtpCode.objects.filter(phone=phone, created_at__gte=now - timedelta(hours=1))
    last = recent.first()
    if last and now - last.created_at < RESEND_AFTER:
        wait = int((RESEND_AFTER - (now - last.created_at)).total_seconds()) + 1
        raise OtpError("کد قبلی هنوز معتبر است. کمی صبر کن.", retry_in=wait)
    if recent.count() >= MAX_PER_HOUR:
        raise OtpError("تعداد درخواست کد زیاد شد. یک ساعت دیگر دوباره امتحان کن.")
    code = "".join(secrets.choice("0123456789") for _ in range(CODE_LENGTH))
    otp = OtpCode.objects.create(phone=phone, code_hash=hash_code(phone, code), ip=ip)
    send_sms(phone, "otp", code)
    return otp, code


def verify_code(phone, code):
    """Check the newest unused code for this phone. Returns the (new or existing) customer user."""
    otp = OtpCode.objects.filter(phone=phone, used_at__isnull=True).first()
    if otp is None or timezone.now() - otp.created_at > TTL:
        raise OtpError("کد منقضی شده است. کد جدید بگیر.")
    if otp.attempts >= MAX_ATTEMPTS:
        raise OtpError("دفعات وارد کردن کد زیاد شد. کد جدید بگیر.")
    if not otp.matches(code):
        otp.attempts += 1
        otp.save(update_fields=["attempts"])
        raise OtpError("کد درست نیست.")
    otp.used_at = timezone.now()
    otp.save(update_fields=["used_at"])
    User = get_user_model()
    user, created = User.objects.get_or_create(username=phone)
    if is_panel_user(user):
        # Admins and panel staff sign in with a password; a phone code must never open the panel.
        raise OtpError("این شماره برای ورود مشتری قابل استفاده نیست.")
    if created:
        user.set_unusable_password()
        user.save(update_fields=["password"])
    return user


def expose_code_in_response():
    """In development with the console SMS backend, return the code to the client to make testing easy."""
    return settings.DEBUG and settings.SMS_BACKEND == "console"
