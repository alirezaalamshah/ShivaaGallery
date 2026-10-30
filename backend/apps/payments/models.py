from django.db import models


class Payment(models.Model):
    """One attempt to pay an order online. An order may have several if the customer retries."""

    class Status(models.TextChoices):
        PENDING = "pending", "در انتظار"
        PAID = "paid", "موفق"
        FAILED = "failed", "ناموفق"

    order = models.ForeignKey("orders.Order", on_delete=models.PROTECT, related_name="payments", verbose_name="سفارش")
    gateway = models.CharField("درگاه", max_length=20)
    amount = models.PositiveBigIntegerField("مبلغ (ریال)")
    authority = models.CharField("شناسه‌ی درگاه", max_length=64, blank=True, db_index=True)
    ref_id = models.CharField("کد پیگیری بانک", max_length=64, blank=True)
    card = models.CharField("کارت", max_length=32, blank=True)
    status = models.CharField("وضعیت", max_length=10, choices=Status.choices, default=Status.PENDING)
    message = models.CharField("پیام", max_length=200, blank=True)
    created_at = models.DateTimeField("شروع", auto_now_add=True)
    verified_at = models.DateTimeField("تأیید", null=True, blank=True)

    class Meta:
        verbose_name = "پرداخت"
        verbose_name_plural = "پرداخت‌ها"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.order} · {self.get_status_display()}"
