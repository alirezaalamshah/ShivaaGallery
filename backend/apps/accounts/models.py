import hashlib
import hmac

from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.core.validators import iran_mobile


def hash_code(phone, code):
    key = settings.SECRET_KEY.encode()
    return hmac.new(key, f"{phone}:{code}".encode(), hashlib.sha256).hexdigest()


class OtpCode(models.Model):
    """A one-time login code. Only its hash is stored."""

    phone = models.CharField(max_length=11, validators=[iran_mobile], db_index=True)
    code_hash = models.CharField(max_length=64)
    attempts = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(default=timezone.now, db_index=True)
    used_at = models.DateTimeField(null=True, blank=True)
    ip = models.GenericIPAddressField(null=True, blank=True)

    class Meta:
        verbose_name = "کد ورود"
        verbose_name_plural = "کدهای ورود"
        ordering = ["-created_at"]

    def matches(self, code):
        return hmac.compare_digest(self.code_hash, hash_code(self.phone, code))


class Address(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="addresses")
    receiver_name = models.CharField("نام تحویل‌گیرنده", max_length=80)
    receiver_phone = models.CharField("موبایل تحویل‌گیرنده", max_length=11, blank=True)
    province = models.CharField("استان", max_length=40, blank=True)
    city = models.CharField("شهر", max_length=60)
    address = models.TextField("آدرس")
    postal_code = models.CharField("کد پستی", max_length=10, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "آدرس"
        verbose_name_plural = "آدرس‌ها"
        ordering = ["-updated_at"]

    def __str__(self):
        return f"{self.receiver_name} · {self.city}"


class CustomerNote(models.Model):
    """
    What the shop knows about a customer beyond their orders, keyed by mobile number so it also
    covers shop customers who never made an account. Only the admin sees it.
    """

    phone = models.CharField("موبایل", max_length=11, unique=True, validators=[iran_mobile])
    name = models.CharField("نام", max_length=80, blank=True, help_text="برای مشتری حضوری که نامش جای دیگری ثبت نشده")
    note = models.TextField("یادداشت مدیر", max_length=2000, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "یادداشت مشتری"
        verbose_name_plural = "یادداشت‌های مشتری"

    def __str__(self):
        return self.phone
