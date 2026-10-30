import secrets

from django.conf import settings
from django.db import models


def new_sale_number():
    return "S" + str(100000 + secrets.randbelow(900000))


class Sale(models.Model):
    """One checkout at the shop till. Its pieces leave the same stock the site sells from."""

    class Status(models.TextChoices):
        COMPLETED = "completed", "ثبت شده"
        VOIDED = "voided", "باطل شده"

    number = models.CharField("شماره فاکتور", max_length=12, unique=True, default=new_sale_number)
    seller = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="sales", verbose_name="فروشنده")
    customer_name = models.CharField("نام مشتری", max_length=80, blank=True)
    customer_phone = models.CharField("موبایل مشتری", max_length=11, blank=True)
    note = models.CharField("یادداشت", max_length=300, blank=True)

    subtotal = models.PositiveBigIntegerField("جمع کالاها")
    discount = models.PositiveBigIntegerField("تخفیف", default=0)
    total = models.PositiveBigIntegerField("مبلغ کل")
    cash = models.PositiveBigIntegerField("نقد", default=0)
    card = models.PositiveBigIntegerField("کارت‌خوان", default=0)
    transfer = models.PositiveBigIntegerField("کارت به کارت", default=0)

    status = models.CharField("وضعیت", max_length=10, choices=Status.choices, default=Status.COMPLETED, db_index=True)
    voided_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+", verbose_name="باطل‌کننده")
    voided_at = models.DateTimeField("زمان ابطال", null=True, blank=True)
    void_reason = models.CharField("دلیل ابطال", max_length=200, blank=True)
    client_key = models.CharField(max_length=40, unique=True, null=True, blank=True, editable=False, help_text="جلوی ثبت دوباره‌ی یک فروش را می‌گیرد")
    created_at = models.DateTimeField("زمان فروش", auto_now_add=True, db_index=True)

    class Meta:
        verbose_name = "فروش حضوری"
        verbose_name_plural = "فروش‌های حضوری"
        ordering = ["-created_at"]

    def __str__(self):
        return self.number


class SaleItem(models.Model):
    sale = models.ForeignKey(Sale, on_delete=models.CASCADE, related_name="items")
    variant = models.ForeignKey("catalog.Variant", on_delete=models.SET_NULL, null=True, related_name="sale_items")
    product_name = models.CharField("محصول", max_length=120)
    color_name = models.CharField("رنگ", max_length=40)
    size_label = models.CharField("سایز", max_length=20)
    sku = models.CharField(max_length=40)
    unit_price = models.PositiveBigIntegerField("قیمت واحد")
    qty = models.PositiveSmallIntegerField("تعداد")

    class Meta:
        verbose_name = "قلم فروش"
        verbose_name_plural = "اقلام فروش"

    @property
    def line_total(self):
        return self.unit_price * self.qty
