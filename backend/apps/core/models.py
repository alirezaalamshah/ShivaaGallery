from django.db import models
from django.db.models import Q
from django.utils import timezone

from .validators import split_mobiles


class StoreSettings(models.Model):
    """
    The one row that describes this store. Nothing store-specific is
    hard-coded elsewhere, so the same code can be installed for another shop.
    """

    class Theme(models.TextChoices):
        DAY = "day", "روز گرم (روشن)"
        NIGHT = "night", "شب طلایی (تیره)"

    class ReturnType(models.TextChoices):
        REFUND = "refund", "بازگشت وجه یا تعویض"
        EXCHANGE = "exchange", "فقط تعویض سایز"

    name = models.CharField("نام فروشگاه", max_length=80)
    name_latin = models.CharField("نام لاتین", max_length=80, blank=True)
    tagline = models.CharField("شعار کوتاه", max_length=160, blank=True)
    logo = models.ImageField("لوگو", upload_to="store/", blank=True)

    theme = models.CharField(
        "تم سایت", max_length=10, choices=Theme.choices, default=Theme.DAY,
        help_text="هر تم رنگ‌های کامل و آزموده‌ی خودش را دارد. پنل مدیریت همیشه تم روشن می‌ماند تا خوانا باشد.",
    )

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

    terms_text = models.TextField("قوانین و مقررات خرید", blank=True, help_text="در صفحه‌ی «قوانین و مقررات» نمایش داده می‌شود")
    privacy_text = models.TextField("حریم خصوصی", blank=True, help_text="در صفحه‌ی «حریم خصوصی» نمایش داده می‌شود")
    working_hours = models.CharField("ساعت کاری", max_length=120, blank=True, help_text="مثلاً شنبه تا پنجشنبه، ۱۰ تا ۱۴ و ۱۷ تا ۲۲")
    enamad_id = models.CharField("شناسه‌ی اینماد (id)", max_length=20, blank=True)
    enamad_code = models.CharField("کد اینماد (Code)", max_length=40, blank=True)

    order_notify_phone = models.CharField(
        "موبایل‌های دریافت خبر سفارش جدید", max_length=200, blank=True,
        help_text="با هر سفارش جدید و هر درخواست مرجوعی به این شماره‌ها پیامک می‌رود. چند شماره را با ویرگول جدا کنید.",
    )
    unpaid_hold_hours = models.PositiveSmallIntegerField(
        "نگه‌داشتن سفارش پرداخت‌نشده (ساعت)", default=24,
        help_text="تا وقتی پرداخت آنلاین فعال نیست: سفارشی که در این مدت پرداخت نشود خودکار لغو و کالایش به موجودی برمی‌گردد. صفر یعنی هیچ‌وقت.",
    )

    seller_max_discount = models.PositiveSmallIntegerField(
        "سقف تخفیف فروشنده (درصد)", default=10,
        help_text="بیشترین تخفیفی که فروشنده در صندوق می‌تواند بدهد. مدیر محدودیتی ندارد.",
    )

    birthday_discount_enabled = models.BooleanField(
        "تخفیف تولد", default=False,
        help_text="مشتری‌ای که تاریخ تولدش ثبت شده، از ۳ روز قبل تا ۳ روز بعد از تولدش یک بار در سال تخفیف می‌گیرد.",
    )
    birthday_discount_percent = models.PositiveSmallIntegerField("درصد تخفیف تولد", default=10)
    birthday_discount_max = models.PositiveBigIntegerField("سقف مبلغ تخفیف تولد", null=True, blank=True, help_text="خالی یعنی بدون سقف")

    hero_products = models.JSONField(
        "کارت‌های اسلایدر صفحه‌ی اصلی", default=list, blank=True,
        help_text="شناسه‌ی محصولات به ترتیب نمایش. خالی یعنی محصولات ویژه و تازه‌ترین‌ها خودکار نشان داده شوند.",
    )

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

    def notify_phones(self):
        """The staff numbers that get the new order and new return messages."""
        return split_mobiles(self.order_notify_phone)[0]


class BannerQuerySet(models.QuerySet):
    def live(self):
        """Switched on and inside its start and end dates, if it has them."""
        now = timezone.now()
        return self.filter(is_active=True).filter(Q(starts_at__isnull=True) | Q(starts_at__lte=now)).filter(
            Q(ends_at__isnull=True) | Q(ends_at__gt=now)
        )


class Banner(models.Model):
    """A campaign shown on the site for a while: a picture banner on the home page, or a line of text above every page."""

    class Placement(models.TextChoices):
        HOME = "home", "بنر تصویری صفحه‌ی اصلی"
        BAR = "bar", "نوار متنی بالای همه‌ی صفحه‌ها"

    placement = models.CharField("جای نمایش", max_length=8, choices=Placement.choices, default=Placement.HOME)
    title = models.CharField("تیتر", max_length=80)
    text = models.CharField("متن", max_length=200, blank=True)
    image = models.ImageField("تصویر", upload_to="banners/", blank=True)
    link = models.CharField("لینک", max_length=300, blank=True, help_text="مثلاً /shop?on_sale=true یا /c/manto")
    button_label = models.CharField("متن دکمه", max_length=30, blank=True)
    starts_at = models.DateTimeField("شروع", null=True, blank=True)
    ends_at = models.DateTimeField("پایان", null=True, blank=True)
    is_active = models.BooleanField("فعال", default=True)
    sort = models.PositiveSmallIntegerField("ترتیب", default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    objects = BannerQuerySet.as_manager()

    class Meta:
        verbose_name = "بنر و کمپین"
        verbose_name_plural = "بنرها و کمپین‌ها"
        ordering = ["sort", "-id"]

    def __str__(self):
        return self.title
