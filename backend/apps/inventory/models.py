from django.conf import settings
from django.db import models


class StockMovement(models.Model):
    """
    Append-only ledger. Variant.stock is the running sum of these rows and is
    only ever changed through apps.inventory.services.move_stock.
    """

    class Reason(models.TextChoices):
        RECEIVE = "receive", "ورود کالا"
        SALE = "sale", "فروش"
        CANCEL = "cancel", "لغو سفارش"
        RETURN = "return", "مرجوعی"
        ADJUST = "adjust", "اصلاح دستی"

    variant = models.ForeignKey("catalog.Variant", on_delete=models.PROTECT, related_name="movements", verbose_name="تنوع")
    delta = models.IntegerField("تغییر", help_text="مثبت برای ورود، منفی برای خروج")
    reason = models.CharField("علت", max_length=10, choices=Reason.choices)
    balance = models.IntegerField("موجودی بعد از تغییر")
    note = models.CharField("یادداشت", max_length=200, blank=True)
    reference = models.CharField("مرجع", max_length=40, blank=True, help_text="مثلاً شماره‌ی سفارش")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, verbose_name="ثبت‌کننده")
    created_at = models.DateTimeField("زمان", auto_now_add=True)

    class Meta:
        verbose_name = "گردش موجودی"
        verbose_name_plural = "دفتر موجودی"
        ordering = ["-created_at", "-id"]

    def __str__(self):
        sign = "+" if self.delta > 0 else ""
        return f"{self.variant} {sign}{self.delta}"
