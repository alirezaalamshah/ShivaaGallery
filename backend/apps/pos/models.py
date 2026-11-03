import secrets

from django.conf import settings
from django.db import models


def new_sale_number():
    return "S" + str(100000 + secrets.randbelow(900000))


class Sale(models.Model):
    """
    One checkout at the shop till. Its pieces leave the same stock the site sells from.
    A ticket may also take back pieces from an earlier ticket (a return or an exchange):
    their value is `returned_total`, and when it is more than the new pieces the total and
    the payments are negative, meaning money handed back to the customer.
    """

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
    birthday_discount = models.BooleanField("تخفیف تولد", default=False, help_text="تخفیف این فاکتور تخفیف تولد مشتری است")
    returned_total = models.PositiveBigIntegerField("ارزش کالاهای پس‌گرفته", default=0)
    total = models.BigIntegerField("مبلغ کل", help_text="منفی یعنی پولی که به مشتری پس داده شد")
    cash = models.BigIntegerField("نقد", default=0)
    card = models.BigIntegerField("کارت‌خوان", default=0)
    transfer = models.BigIntegerField("کارت به کارت", default=0)

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
    # The purchase price at the time of sale, for profit reports; empty if it was not entered yet.
    unit_cost = models.PositiveBigIntegerField("قیمت خرید واحد", null=True, blank=True)
    qty = models.PositiveSmallIntegerField("تعداد")

    class Meta:
        verbose_name = "قلم فروش"
        verbose_name_plural = "اقلام فروش"

    @property
    def line_total(self):
        return self.unit_price * self.qty

    @property
    def paid_unit(self):
        """What one piece really cost the customer, after its share of the ticket discount."""
        sale = self.sale
        if not sale.subtotal:
            return self.unit_price
        return round(self.unit_price * (sale.subtotal - sale.discount) / sale.subtotal)


class ReturnedItem(models.Model):
    """Pieces of an earlier ticket brought back to the shop, recorded on the ticket that took them."""

    sale = models.ForeignKey(Sale, on_delete=models.CASCADE, related_name="returned", verbose_name="فاکتور مرجوعی")
    item = models.ForeignKey(SaleItem, on_delete=models.PROTECT, related_name="returns", verbose_name="قلم فاکتور اصلی")
    qty = models.PositiveSmallIntegerField("تعداد")
    unit_refund = models.PositiveBigIntegerField("ارزش هر عدد", help_text="همان مبلغی که مشتری برای هر عدد پرداخته بود")

    class Meta:
        verbose_name = "کالای پس‌گرفته"
        verbose_name_plural = "کالاهای پس‌گرفته"

    @property
    def line_total(self):
        return self.unit_refund * self.qty


class TillClose(models.Model):
    """
    The end-of-day count of the cash drawer. Expected cash is what the drawer started the
    day with, plus the day's net cash at the till, minus expenses paid from the drawer.
    What is left in the drawer becomes the next day's starting cash.
    """

    day = models.DateField("روز", unique=True)
    opening_cash = models.BigIntegerField("موجودی اول روز")
    cash_sales = models.BigIntegerField("نقد خالص فروش روز")
    cash_expenses = models.PositiveBigIntegerField("هزینه‌های پرداخت‌شده از صندوق", default=0)
    expected_cash = models.BigIntegerField("نقد مورد انتظار")
    counted_cash = models.BigIntegerField("نقد شمرده‌شده")
    card_total = models.BigIntegerField("کارت‌خوان طبق سیستم", default=0)
    counted_card = models.BigIntegerField("کارت‌خوان طبق رسید دستگاه", null=True, blank=True)
    transfer_total = models.BigIntegerField("کارت به کارت طبق سیستم", default=0)
    left_in_drawer = models.BigIntegerField("پول باقی‌مانده در صندوق برای فردا", default=0)
    note = models.CharField("یادداشت", max_length=300, blank=True)
    closed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+", verbose_name="بسته شده توسط")
    closed_at = models.DateTimeField("زمان بستن", auto_now=True)

    class Meta:
        verbose_name = "بستن صندوق"
        verbose_name_plural = "بستن صندوق"
        ordering = ["-day"]

    def __str__(self):
        return str(self.day)

    @property
    def difference(self):
        """Positive: more cash than expected; negative: cash is missing."""
        return self.counted_cash - self.expected_cash
