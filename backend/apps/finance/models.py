from django.conf import settings
from django.db import models
from django.utils import timezone


class Expense(models.Model):
    """
    A running cost of the shop (rent, wages, bills, ads, courier fees …). Buying stock is not
    an expense here: its cost is the product's purchase price, counted when a piece is sold.
    """

    class Category(models.TextChoices):
        RENT = "rent", "اجاره"
        WAGES = "wages", "حقوق و دستمزد"
        BILLS = "bills", "قبوض و شارژ"
        ADS = "ads", "تبلیغات"
        SHIPPING = "shipping", "هزینه‌ی ارسال"
        PACKAGING = "packaging", "بسته‌بندی و ملزومات"
        FEES = "fees", "کارمزد و مالیات"
        REPAIRS = "repairs", "تعمیرات و تجهیزات"
        OTHER = "other", "سایر"

    day = models.DateField("تاریخ", default=timezone.localdate, db_index=True)
    category = models.CharField("دسته", max_length=12, choices=Category.choices, default=Category.OTHER)
    amount = models.PositiveBigIntegerField("مبلغ")
    note = models.CharField("شرح", max_length=200, blank=True)
    from_till = models.BooleanField("از صندوق مغازه پرداخت شد", default=False, help_text="از نقد مورد انتظار صندوق در آن روز کم می‌شود")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "هزینه"
        verbose_name_plural = "هزینه‌ها"
        ordering = ["-day", "-id"]

    def __str__(self):
        return f"{self.get_category_display()} {self.amount}"
