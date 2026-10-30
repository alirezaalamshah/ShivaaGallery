import secrets

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone


class ShippingMethod(models.Model):
    name = models.CharField("نام روش ارسال", max_length=60)
    description = models.CharField("توضیح کوتاه", max_length=120, blank=True)
    fee = models.PositiveBigIntegerField("هزینه")
    only_city = models.CharField("فقط برای شهر", max_length=60, blank=True, help_text="خالی یعنی همه‌ی شهرها")
    needs_postal_code = models.BooleanField("کد پستی لازم است", default=False, help_text="برای پست و تیپاکس روشن باشد")
    is_active = models.BooleanField("فعال", default=True)
    sort = models.PositiveSmallIntegerField("ترتیب", default=0)

    class Meta:
        verbose_name = "روش ارسال"
        verbose_name_plural = "روش‌های ارسال"
        ordering = ["sort", "id"]

    def __str__(self):
        return self.name

    def available_for(self, city):
        return self.is_active and (not self.only_city or self.only_city.strip() == (city or "").strip())


class DiscountCode(models.Model):
    class Kind(models.TextChoices):
        PERCENT = "percent", "درصدی"
        FIXED = "fixed", "مبلغ ثابت"

    code = models.CharField("کد", max_length=30, unique=True)
    kind = models.CharField("نوع", max_length=10, choices=Kind.choices, default=Kind.PERCENT)
    value = models.PositiveBigIntegerField("مقدار", help_text="درصد (۱ تا ۱۰۰) یا مبلغ")
    max_amount = models.PositiveBigIntegerField("سقف تخفیف", null=True, blank=True, help_text="برای کد درصدی")
    min_subtotal = models.PositiveBigIntegerField("حداقل مبلغ خرید", default=0)
    max_uses = models.PositiveIntegerField("حداکثر دفعات استفاده", null=True, blank=True)
    once_per_customer = models.BooleanField("هر مشتری فقط یک بار", default=True)
    used_count = models.PositiveIntegerField("دفعات استفاده", default=0, editable=False)
    starts_at = models.DateTimeField("شروع", null=True, blank=True)
    ends_at = models.DateTimeField("پایان", null=True, blank=True)
    is_active = models.BooleanField("فعال", default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "کد تخفیف"
        verbose_name_plural = "کدهای تخفیف"
        ordering = ["-created_at"]

    def __str__(self):
        return self.code

    def clean(self):
        self.code = self.code.strip().upper()
        if self.kind == self.Kind.PERCENT and not 1 <= self.value <= 100:
            raise ValidationError({"value": "درصد تخفیف باید بین ۱ و ۱۰۰ باشد."})

    def save(self, *args, **kwargs):
        self.code = self.code.strip().upper()
        super().save(*args, **kwargs)

    def problem(self, subtotal, user=None, now=None):
        """Why this code can't be used now, or None if it can."""
        now = now or timezone.now()
        if not self.is_active or (self.starts_at and now < self.starts_at) or (self.ends_at and now > self.ends_at):
            return "این کد معتبر نیست یا تاریخش گذشته است."
        if self.max_uses is not None and self.used_count >= self.max_uses:
            return "ظرفیت استفاده از این کد تمام شده است."
        if self.once_per_customer and user is not None and user.is_authenticated and (
            Order.objects.filter(user=user, discount_code=self.code).exclude(status=Order.Status.CANCELLED).exists()
        ):
            return "شما قبلاً از این کد استفاده کرده‌اید."
        if subtotal < self.min_subtotal:
            return f"این کد برای خرید بالای {self.min_subtotal:,} است."
        return None

    def amount_for(self, subtotal):
        if self.kind == self.Kind.FIXED:
            return min(self.value, subtotal)
        amount = subtotal * self.value // 100
        if self.max_amount:
            amount = min(amount, self.max_amount)
        return amount


def new_order_number():
    return str(100000 + secrets.randbelow(900000))


class Order(models.Model):
    class Status(models.TextChoices):
        AWAITING_PAYMENT = "awaiting_payment", "در انتظار پرداخت"
        PAID = "paid", "پرداخت شد"
        PROCESSING = "processing", "در حال آماده‌سازی"
        SHIPPED = "shipped", "ارسال شد"
        DELIVERED = "delivered", "تحویل شد"
        CANCELLED = "cancelled", "لغو شد"

    # Orders in these statuses count as sales.
    SOLD = ["paid", "processing", "shipped", "delivered"]
    OPEN = ["awaiting_payment", "paid", "processing"]

    # Statuses an admin may move an order to from each status.
    TRANSITIONS = {
        "awaiting_payment": ["paid", "processing", "cancelled"],
        "paid": ["processing", "shipped", "cancelled"],
        "processing": ["shipped", "cancelled"],
        "shipped": ["delivered"],
        "delivered": [],
        "cancelled": [],
    }

    number = models.CharField("شماره سفارش", max_length=12, unique=True, default=new_order_number)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="orders", verbose_name="مشتری")
    phone = models.CharField("موبایل", max_length=11)
    receiver_name = models.CharField("نام تحویل‌گیرنده", max_length=80)
    receiver_phone = models.CharField("موبایل تحویل‌گیرنده", max_length=11, blank=True)
    province = models.CharField("استان", max_length=40, blank=True)
    city = models.CharField("شهر", max_length=60)
    address = models.TextField("آدرس")
    postal_code = models.CharField("کد پستی", max_length=10, blank=True)
    note = models.CharField("یادداشت مشتری", max_length=300, blank=True)

    shipping_method = models.ForeignKey(ShippingMethod, on_delete=models.SET_NULL, null=True, verbose_name="روش ارسال")
    shipping_name = models.CharField("روش ارسال", max_length=60)
    shipping_fee = models.PositiveBigIntegerField("هزینه‌ی ارسال")
    subtotal = models.PositiveBigIntegerField("جمع کالاها")
    discount_code = models.CharField("کد تخفیف", max_length=30, blank=True)
    discount_amount = models.PositiveBigIntegerField("مبلغ تخفیف", default=0)
    total = models.PositiveBigIntegerField("مبلغ کل")

    status = models.CharField("وضعیت", max_length=20, choices=Status.choices, default=Status.AWAITING_PAYMENT, db_index=True)
    tracking_code = models.CharField("کد رهگیری مرسوله", max_length=40, blank=True)
    payment_deadline = models.DateTimeField("مهلت پرداخت", null=True, blank=True, help_text="بعد از این زمان، سفارش پرداخت‌نشده خودکار لغو می‌شود")
    paid_at = models.DateTimeField("زمان پرداخت", null=True, blank=True)
    client_key = models.CharField(max_length=40, unique=True, null=True, blank=True, editable=False, help_text="جلوی ثبت دوباره‌ی یک سفارش را می‌گیرد")
    admin_note = models.TextField("یادداشت مدیر", blank=True)
    created_at = models.DateTimeField("زمان ثبت", auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "سفارش"
        verbose_name_plural = "سفارش‌ها"
        ordering = ["-created_at"]

    def __str__(self):
        return f"#{self.number}"


class OrderItem(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="items")
    variant = models.ForeignKey("catalog.Variant", on_delete=models.SET_NULL, null=True, related_name="order_items")
    product_slug = models.CharField(max_length=140)
    product_name = models.CharField("محصول", max_length=120)
    color_name = models.CharField("رنگ", max_length=40)
    size_label = models.CharField("سایز", max_length=20)
    sku = models.CharField(max_length=40)
    image = models.CharField(max_length=300, blank=True)
    unit_price = models.PositiveBigIntegerField("قیمت واحد")
    qty = models.PositiveSmallIntegerField("تعداد")

    class Meta:
        verbose_name = "قلم سفارش"
        verbose_name_plural = "اقلام سفارش"

    @property
    def line_total(self):
        return self.unit_price * self.qty


class OrderEvent(models.Model):
    """Status history shown to the customer as a timeline."""

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="events")
    status = models.CharField(max_length=20, choices=Order.Status.choices)
    note = models.CharField(max_length=200, blank=True)
    by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]


class ReturnRequest(models.Model):
    """A customer's request to return or exchange items of a received order, within the store's return window."""

    class Reason(models.TextChoices):
        SIZE = "size", "سایز مناسب نبود"
        DEFECT = "defect", "ایراد یا آسیب در کالا"
        DIFFERENT = "different", "با عکس و توضیحات فرق داشت"
        OTHER = "other", "دلیل دیگر"

    class Status(models.TextChoices):
        PENDING = "pending", "در انتظار بررسی"
        APPROVED = "approved", "تأیید شد، کالا را بفرستید"
        REJECTED = "rejected", "رد شد"
        COMPLETED = "completed", "کالا دریافت شد و انجام شد"

    # Statuses an admin may move a request to from each status.
    TRANSITIONS = {
        "pending": ["approved", "rejected"],
        "approved": ["completed", "rejected"],
        "rejected": [],
        "completed": [],
    }

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="returns", verbose_name="سفارش")
    reason = models.CharField("دلیل", max_length=10, choices=Reason.choices)
    wants = models.CharField("درخواست مشتری", max_length=10, choices=[("refund", "بازگشت وجه"), ("exchange", "تعویض")], default="exchange")
    text = models.TextField("توضیح مشتری", max_length=1000, blank=True)
    status = models.CharField("وضعیت", max_length=10, choices=Status.choices, default=Status.PENDING, db_index=True)
    admin_note = models.TextField("پیام فروشگاه به مشتری", max_length=1000, blank=True)
    created_at = models.DateTimeField("زمان ثبت", auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "درخواست مرجوعی"
        verbose_name_plural = "درخواست‌های مرجوعی"
        ordering = ["-created_at"]


class ReturnItem(models.Model):
    request = models.ForeignKey(ReturnRequest, on_delete=models.CASCADE, related_name="items")
    order_item = models.ForeignKey(OrderItem, on_delete=models.CASCADE, related_name="returns")
    qty = models.PositiveSmallIntegerField("تعداد")
