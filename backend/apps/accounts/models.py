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


class Customer(models.Model):
    """
    A member of the customer club, keyed by mobile number so it also covers shop customers who never
    made a site account: what the shop knows about them beyond their orders. Made when the shop
    registers someone, writes a note, or the customer gives their birthday.
    """

    phone = models.CharField("موبایل", max_length=11, unique=True, validators=[iran_mobile])
    name = models.CharField("نام", max_length=80, blank=True, help_text="برای مشتری حضوری که نامش جای دیگری ثبت نشده")
    note = models.TextField("یادداشت مدیر", max_length=2000, blank=True)
    birthday = models.DateField("تاریخ تولد", null=True, blank=True, help_text="مشتری فقط یک بار وارد می‌کند؛ بعد فقط فروشگاه تغییرش می‌دهد")
    is_active = models.BooleanField("فعال", default=True, help_text="مشتری غیرفعال نه در سایت و نه در مغازه خرید نمی‌تواند بکند")
    created_at = models.DateTimeField("ثبت", default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "مشتری"
        verbose_name_plural = "مشتری‌ها"

    def __str__(self):
        return self.phone


class BirthdayUse(models.Model):
    """A birthday discount taken: once per birthday, on an order or a till ticket (`reference` is its number)."""

    phone = models.CharField("موبایل", max_length=11)
    cycle = models.PositiveSmallIntegerField("سال تولد (شمسی)", help_text="سالی که این تولد در آن است")
    reference = models.CharField("شماره سفارش یا فاکتور", max_length=20, db_index=True)
    amount = models.PositiveBigIntegerField("مبلغ تخفیف")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "تخفیف تولد"
        verbose_name_plural = "تخفیف‌های تولد"
        ordering = ["-created_at"]
        constraints = [models.UniqueConstraint(fields=["phone", "cycle"], name="one_birthday_discount_a_year")]


class StaffAccess(models.Model):
    """A panel user who is not an admin, and what they may see and do (codes from `roles.CATALOG`)."""

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="staff_access")
    perms = models.JSONField("دسترسی‌ها", default=list, blank=True)

    class Meta:
        verbose_name = "دسترسی کاربر پنل"
        verbose_name_plural = "دسترسی کاربران پنل"

    def __str__(self):
        return self.user.username
