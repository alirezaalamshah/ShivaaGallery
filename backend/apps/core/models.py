from django.db import models

from .validators import hex_color


class StoreSettings(models.Model):
    """
    The one row that describes this store. Nothing store-specific is
    hard-coded elsewhere, so the same code can be installed for another shop.
    """

    class ReturnType(models.TextChoices):
        REFUND = "refund", "بازگشت وجه یا تعویض"
        EXCHANGE = "exchange", "فقط تعویض سایز"

    name = models.CharField("نام فروشگاه", max_length=80)
    name_latin = models.CharField("نام لاتین", max_length=80, blank=True)
    tagline = models.CharField("شعار کوتاه", max_length=160, blank=True)
    logo = models.ImageField("لوگو", upload_to="store/", blank=True)

    color_ink = models.CharField("رنگ اصلی (متن و دکمه)", max_length=7, default="#14110E", validators=[hex_color])
    color_accent = models.CharField("رنگ تأکید", max_length=7, default="#C9A24C", validators=[hex_color])
    color_background = models.CharField("رنگ زمینه", max_length=7, default="#E5D7C1", validators=[hex_color])

    hero_title = models.CharField("تیتر صفحه‌ی اصلی", max_length=80, blank=True, help_text="کلمه‌ای که بین * و * بیاید طلایی نمایش داده می‌شود، مثلاً: درخشش، *به سبک تو*")
    hero_text = models.CharField("متن صفحه‌ی اصلی", max_length=240, blank=True)
    about_title = models.CharField("تیتر معرفی فروشگاه", max_length=80, blank=True)
    about_text = models.TextField("متن معرفی فروشگاه", blank=True, help_text="در بخش معرفی صفحه‌ی اصلی نمایش داده می‌شود")

    phone = models.CharField("موبایل", max_length=20, blank=True)
    landline = models.CharField("تلفن ثابت", max_length=20, blank=True)
    instagram = models.CharField("اینستاگرام", max_length=60, blank=True, help_text="فقط نام کاربری، بدون @")
    city = models.CharField("شهر فروشگاه", max_length=60, blank=True)
    address = models.TextField("آدرس فروشگاه حضوری", blank=True)

    currency_label = models.CharField("واحد پول", max_length=20, default="تومان")

    returns_enabled = models.BooleanField("مرجوعی فعال است", default=True)
    returns_type = models.CharField("نوع مرجوعی", max_length=10, choices=ReturnType.choices, default=ReturnType.REFUND)
    returns_days = models.PositiveSmallIntegerField("مهلت مرجوعی (روز)", default=7)
    returns_policy = models.TextField("متن قوانین مرجوعی", blank=True)

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "تنظیمات فروشگاه"
        verbose_name_plural = "تنظیمات فروشگاه"

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise models.ProtectedError("تنظیمات فروشگاه قابل حذف نیست.", {self})

    @classmethod
    def load(cls):
        obj, _ = cls.objects.get_or_create(pk=1, defaults={"name": "فروشگاه من"})
        return obj
