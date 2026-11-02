from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import Exists, F, Min, OuterRef, Q
from django.db.models.functions import Coalesce, Least
from django.utils.text import slugify

from apps.core.validators import hex_color


def unique_slug(instance, value, field="slug"):
    """Unicode slug (Persian stays readable in URLs), suffixed until unique."""
    base = slugify(value, allow_unicode=True)[:110] or "item"
    slug, n = base, 2
    qs = type(instance).objects.exclude(pk=instance.pk)
    while qs.filter(**{field: slug}).exists():
        slug, n = f"{base}-{n}", n + 1
    return slug


class Color(models.Model):
    name = models.CharField("نام رنگ", max_length=40, unique=True)
    hex = models.CharField("کد رنگ", max_length=7, validators=[hex_color])
    sort = models.PositiveSmallIntegerField("ترتیب", default=0)

    class Meta:
        verbose_name = "رنگ"
        verbose_name_plural = "رنگ‌ها"
        ordering = ["sort", "name"]

    def __str__(self):
        return self.name


class SizeSystem(models.Model):
    """A sizing scheme such as letters (S–XXL), numbers (38–46), shoes, or free size."""

    name = models.CharField("نام سایزبندی", max_length=40, unique=True)

    class Meta:
        verbose_name = "سایزبندی"
        verbose_name_plural = "سایزبندی‌ها"
        ordering = ["name"]

    def __str__(self):
        return self.name


class Size(models.Model):
    system = models.ForeignKey(SizeSystem, on_delete=models.CASCADE, related_name="sizes", verbose_name="سایزبندی")
    label = models.CharField("سایز", max_length=20)
    sort = models.PositiveSmallIntegerField("ترتیب", default=0)

    class Meta:
        verbose_name = "سایز"
        verbose_name_plural = "سایزها"
        ordering = ["system", "sort", "id"]
        constraints = [models.UniqueConstraint(fields=["system", "label"], name="uniq_size_per_system")]

    def __str__(self):
        return self.label


def validate_size_guide(value):
    """{"columns": ["سایز", "دور سینه", ...], "rows": [["S", "۸۶–۹۰", ...], ...], "note": "..."}"""
    if value in (None, {}):
        return
    if not isinstance(value, dict) or not isinstance(value.get("columns"), list) or not isinstance(value.get("rows"), list):
        raise ValidationError("جدول سایز باید ستون‌ها (columns) و ردیف‌ها (rows) داشته باشد.")
    width = len(value["columns"])
    for row in value["rows"]:
        if not isinstance(row, list) or len(row) != width:
            raise ValidationError("تعداد خانه‌های هر ردیف جدول سایز باید با تعداد ستون‌ها برابر باشد.")


class Category(models.Model):
    parent = models.ForeignKey("self", on_delete=models.PROTECT, null=True, blank=True, related_name="children", verbose_name="دسته‌ی والد")
    name = models.CharField("نام دسته", max_length=60)
    slug = models.SlugField("نامک", max_length=120, unique=True, allow_unicode=True, blank=True)
    description = models.TextField("توضیح", blank=True)
    image = models.ImageField("تصویر", upload_to="categories/", blank=True)
    size_system = models.ForeignKey(SizeSystem, on_delete=models.PROTECT, null=True, blank=True, verbose_name="سایزبندی")
    size_guide = models.JSONField("جدول سایز", default=dict, blank=True, validators=[validate_size_guide])
    sort = models.PositiveSmallIntegerField("ترتیب", default=0)
    is_active = models.BooleanField("فعال", default=True)

    class Meta:
        verbose_name = "دسته"
        verbose_name_plural = "دسته‌ها"
        ordering = ["sort", "name"]

    def __str__(self):
        return f"{self.parent} › {self.name}" if self.parent_id else self.name

    def clean(self):
        node = self.parent
        while node is not None:
            if node.pk == self.pk:
                raise ValidationError({"parent": "یک دسته نمی‌تواند زیرمجموعه‌ی خودش باشد."})
            node = node.parent

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = unique_slug(self, self.name)
        super().save(*args, **kwargs)

    def descendant_ids(self):
        """This category and every category under it."""
        ids, frontier = [self.pk], [self.pk]
        while frontier:
            frontier = list(Category.objects.filter(parent_id__in=frontier).values_list("pk", flat=True))
            ids += frontier
        return ids

    def effective_size_system(self):
        node = self
        while node is not None:
            if node.size_system_id:
                return node.size_system
            node = node.parent
        return None

    def effective_size_guide(self):
        node = self
        while node is not None:
            if node.size_guide:
                return node.size_guide
            node = node.parent
        return {}


class ProductQuerySet(models.QuerySet):
    def published(self):
        """Visible products: switched on, in an active category, with at least one color and size on sale."""
        has_variant = Variant.objects.filter(product=OuterRef("pk"), is_active=True)
        return self.filter(Exists(has_variant), is_active=True, category__is_active=True)

    def with_prices(self):
        """Adds `current`: the lowest price any active variant sells at (the product price when it has none)."""
        regular = Coalesce("variants__price_override", "price")
        selling = Least(Coalesce("variants__sale_price", regular), regular)
        return self.annotate(current=Coalesce(Min(selling, filter=Q(variants__is_active=True)), F("price")))


class Product(models.Model):
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name="products", verbose_name="دسته")
    name = models.CharField("نام محصول", max_length=120)
    slug = models.SlugField("نامک", max_length=140, unique=True, allow_unicode=True, blank=True)
    description = models.TextField("توضیحات", blank=True)
    details = models.JSONField("مشخصات", default=list, blank=True, help_text='فهرست مشخصات، مثلاً ["جنس: کتان", "قد: ۱۱۰ سانتی‌متر"]')
    price = models.PositiveBigIntegerField("قیمت", help_text="قیمت رنگ‌ها و سایزهایی که قیمت جدا ندارند")
    cost_price = models.PositiveBigIntegerField(
        "قیمت خرید", null=True, blank=True,
        help_text="فقط برای حساب سود؛ مشتری آن را نمی‌بیند. هنگام هر فروش در همان فروش ثبت می‌شود.",
    )
    is_active = models.BooleanField("نمایش در سایت", default=True)
    is_featured = models.BooleanField("ویژه", default=False)
    created_at = models.DateTimeField("تاریخ ثبت", auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = ProductQuerySet.as_manager()

    class Meta:
        verbose_name = "محصول"
        verbose_name_plural = "محصولات"
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["is_active", "-created_at"])]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = unique_slug(self, self.name)
        super().save(*args, **kwargs)


class ProductImage(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="images", verbose_name="محصول")
    image = models.ImageField("تصویر", upload_to="products/")
    color = models.ForeignKey(Color, on_delete=models.SET_NULL, null=True, blank=True, verbose_name="رنگ", help_text="اگر عکس مخصوص یک رنگ است")
    alt = models.CharField("متن جایگزین", max_length=160, blank=True)
    sort = models.PositiveSmallIntegerField("ترتیب", default=0)

    class Meta:
        verbose_name = "تصویر محصول"
        verbose_name_plural = "تصاویر محصول"
        ordering = ["sort", "id"]

    def __str__(self):
        return self.alt or f"{self.product} #{self.sort}"


class Variant(models.Model):
    """One purchasable combination of color and size, with its own stock."""

    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="variants", verbose_name="محصول")
    color = models.ForeignKey(Color, on_delete=models.PROTECT, verbose_name="رنگ")
    size = models.ForeignKey(Size, on_delete=models.PROTECT, verbose_name="سایز")
    sku = models.CharField("کد انبار", max_length=40, unique=True, blank=True)
    price_override = models.PositiveBigIntegerField("قیمت این تنوع", null=True, blank=True, help_text="خالی یعنی قیمت محصول")
    sale_price = models.PositiveBigIntegerField("قیمت حراج این تنوع", null=True, blank=True)
    stock = models.IntegerField("موجودی", default=0, editable=False, help_text="فقط از راه دفتر موجودی تغییر می‌کند")
    is_active = models.BooleanField("فعال", default=True)

    class Meta:
        verbose_name = "تنوع"
        verbose_name_plural = "تنوع‌ها"
        ordering = ["product", "color__sort", "size__sort"]
        constraints = [
            models.UniqueConstraint(fields=["product", "color", "size"], name="uniq_variant"),
            models.CheckConstraint(condition=models.Q(stock__gte=0), name="stock_not_negative"),
        ]

    def __str__(self):
        return f"{self.product} · {self.color} · {self.size}"

    def clean(self):
        if self.sale_price is not None and self.product_id and self.sale_price >= self.regular_price:
            raise ValidationError({"sale_price": "قیمت حراج باید کمتر از قیمت این تنوع باشد."})

    def save(self, *args, **kwargs):
        if not self.sku:
            self.sku = f"P{self.product_id}-C{self.color_id}-S{self.size_id}"
        super().save(*args, **kwargs)

    @property
    def regular_price(self):
        return self.price_override if self.price_override is not None else self.product.price

    @property
    def price(self):
        """What the customer pays. A sale price that is no longer below the regular price is ignored."""
        regular = self.regular_price
        return min(self.sale_price, regular) if self.sale_price is not None else regular

    @property
    def discount_percent(self):
        regular = self.regular_price
        return round((1 - self.price / regular) * 100) if regular else 0

    @property
    def in_stock(self):
        return self.is_active and self.stock > 0


class Favorite(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="favorites")
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="favorited_by")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "علاقه‌مندی"
        verbose_name_plural = "علاقه‌مندی‌ها"
        ordering = ["-created_at"]
        constraints = [models.UniqueConstraint(fields=["user", "product"], name="uniq_favorite")]


class Review(models.Model):
    """A buyer's rating and comment. Shown on the product page once the admin approves it."""

    class Status(models.TextChoices):
        PENDING = "pending", "در انتظار بررسی"
        APPROVED = "approved", "منتشر شده"
        REJECTED = "rejected", "رد شده"

    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="reviews", verbose_name="محصول")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="reviews", verbose_name="مشتری")
    rating = models.PositiveSmallIntegerField("امتیاز", validators=[MinValueValidator(1), MaxValueValidator(5)])
    text = models.TextField("متن نظر", max_length=1000, blank=True)
    status = models.CharField("وضعیت", max_length=10, choices=Status.choices, default=Status.PENDING, db_index=True)
    reply = models.TextField("پاسخ فروشگاه", max_length=1000, blank=True)
    created_at = models.DateTimeField("زمان ثبت", auto_now_add=True)

    class Meta:
        verbose_name = "نظر"
        verbose_name_plural = "نظرات"
        ordering = ["-created_at"]
        constraints = [models.UniqueConstraint(fields=["product", "user"], name="uniq_review_per_buyer")]

    def author_name(self):
        name = self.user.get_full_name()
        return name or "خریدار"


class StockAlert(models.Model):
    """"Tell me when it's back": one SMS when this color and size is in stock again."""

    variant = models.ForeignKey(Variant, on_delete=models.CASCADE, related_name="alerts", verbose_name="تنوع")
    phone = models.CharField("موبایل", max_length=11)
    created_at = models.DateTimeField("زمان درخواست", auto_now_add=True)
    notified_at = models.DateTimeField("زمان اطلاع‌رسانی", null=True, blank=True)

    class Meta:
        verbose_name = "درخواست «موجود شد خبرم کن»"
        verbose_name_plural = "درخواست‌های «موجود شد خبرم کن»"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["variant", "phone"], condition=models.Q(notified_at__isnull=True), name="uniq_waiting_alert"),
        ]
