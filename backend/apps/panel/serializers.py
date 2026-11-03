from django.db import transaction
from rest_framework import serializers

from apps.accounts.roles import can
from apps.catalog.models import Category, Color, Product, ProductImage, Review, Size, SizeSystem, Variant
from apps.core.models import Banner, StoreSettings
from apps.core.validators import split_mobiles
from apps.inventory.models import StockMovement
from apps.orders.models import DiscountCode, Order, ReturnRequest, ShippingMethod
from apps.orders.serializers import OrderSerializer, ReturnSerializer

from .images import prepare_photo


class ColorSerializer(serializers.ModelSerializer):
    in_use = serializers.SerializerMethodField()

    class Meta:
        model = Color
        fields = ["id", "name", "hex", "sort", "in_use"]

    def get_in_use(self, obj):
        return obj.variant_set.exists()


class SizeSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(required=False)

    class Meta:
        model = Size
        fields = ["id", "label", "sort"]


class SizeSystemSerializer(serializers.ModelSerializer):
    sizes = SizeSerializer(many=True)

    class Meta:
        model = SizeSystem
        fields = ["id", "name", "sizes"]

    def validate_sizes(self, sizes):
        labels = [s["label"].strip() for s in sizes]
        if len(labels) != len(set(labels)):
            raise serializers.ValidationError("سایز تکراری وارد شده است.")
        if not labels:
            raise serializers.ValidationError("حداقل یک سایز لازم است.")
        return sizes

    @transaction.atomic
    def _sync_sizes(self, system, sizes):
        keep = []
        for i, s in enumerate(sizes):
            obj = system.sizes.filter(pk=s.get("id")).first() if s.get("id") else None
            if obj is None:
                obj = Size(system=system)
            obj.label, obj.sort = s["label"].strip(), i
            obj.save()
            keep.append(obj.pk)
        removed = system.sizes.exclude(pk__in=keep)
        if Variant.objects.filter(size__in=removed).exists():
            raise serializers.ValidationError({"sizes": "سایزی که در محصولات استفاده شده قابل حذف نیست."})
        removed.delete()

    def create(self, validated):
        sizes = validated.pop("sizes")
        system = SizeSystem.objects.create(**validated)
        self._sync_sizes(system, sizes)
        return system

    def update(self, system, validated):
        sizes = validated.pop("sizes", None)
        system.name = validated.get("name", system.name)
        system.save()
        if sizes is not None:
            self._sync_sizes(system, sizes)
        return system


class CategorySerializer(serializers.ModelSerializer):
    product_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Category
        fields = ["id", "parent", "name", "slug", "description", "image", "size_system", "size_guide", "sort", "is_active", "product_count"]
        extra_kwargs = {"slug": {"required": False}}

    def validate_image(self, value):
        return prepare_photo(value) if value else value

    def validate(self, attrs):
        node = attrs.get("parent", getattr(self.instance, "parent", None))
        while node is not None:
            if self.instance and node.pk == self.instance.pk:
                raise serializers.ValidationError({"parent": "یک دسته نمی‌تواند زیرمجموعه‌ی خودش باشد."})
            node = node.parent
        return attrs


class ImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductImage
        fields = ["id", "image", "color", "alt", "sort"]
        read_only_fields = ["image"]


class VariantSerializer(serializers.ModelSerializer):
    color_name = serializers.CharField(source="color.name", read_only=True)
    color_hex = serializers.CharField(source="color.hex", read_only=True)
    size_label = serializers.CharField(source="size.label", read_only=True)
    price = serializers.IntegerField(read_only=True)
    regular_price = serializers.IntegerField(read_only=True)

    class Meta:
        model = Variant
        fields = ["id", "color", "color_name", "color_hex", "size", "size_label", "sku", "price_override", "sale_price", "regular_price", "price", "stock", "is_active"]
        read_only_fields = ["color", "size", "stock"]


class HidesCost:
    """The purchase price is shown and taken only from those allowed to see it."""

    def _sees_cost(self):
        request = self.context.get("request")
        return request is None or can(request.user, "cost.view")

    def to_representation(self, obj):
        data = super().to_representation(obj)
        if not self._sees_cost():
            data.pop("cost_price", None)
        return data

    def validate(self, attrs):
        if not self._sees_cost():
            attrs.pop("cost_price", None)
        return super().validate(attrs)


class ProductListSerializer(HidesCost, serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name")
    thumb = serializers.SerializerMethodField()
    total_stock = serializers.IntegerField()
    variant_count = serializers.IntegerField()
    out_count = serializers.IntegerField()
    sale_count = serializers.IntegerField()

    class Meta:
        model = Product
        fields = ["id", "name", "slug", "category", "category_name", "price", "cost_price", "sale_count", "is_active", "is_featured", "thumb", "total_stock", "variant_count", "out_count", "created_at"]

    def get_thumb(self, obj):
        first = next(iter(obj.images.all()), None)
        if not first:
            return None
        request = self.context.get("request")
        return request.build_absolute_uri(first.image.url) if request else first.image.url


class ProductSerializer(HidesCost, serializers.ModelSerializer):
    images = ImageSerializer(many=True, read_only=True)
    variants = VariantSerializer(many=True, read_only=True)

    class Meta:
        model = Product
        fields = ["id", "name", "slug", "category", "description", "details", "price", "cost_price", "is_active", "is_featured", "created_at", "images", "variants"]
        read_only_fields = ["slug", "created_at"]

    def validate_details(self, value):
        if not isinstance(value, list) or not all(isinstance(x, str) for x in value):
            raise serializers.ValidationError("مشخصات باید فهرستی از متن باشد.")
        return [x.strip() for x in value if x.strip()]


class MatrixSerializer(serializers.Serializer):
    """The full set of colors × sizes a product is sold in, with the stock, own price and sale price of each combination."""

    colors = serializers.PrimaryKeyRelatedField(queryset=Color.objects.all(), many=True)
    sizes = serializers.PrimaryKeyRelatedField(queryset=Size.objects.all(), many=True)
    stock = serializers.DictField(child=serializers.IntegerField(min_value=0, max_value=999), required=False)
    # The stock the panel showed when the admin opened the product, to catch sales made meanwhile.
    stock_base = serializers.DictField(child=serializers.IntegerField(), required=False)
    # A missing or empty price means the combination sells at the product's price.
    prices = serializers.DictField(child=serializers.IntegerField(min_value=1, allow_null=True), required=False)
    # A missing or empty sale price means the combination is not on sale.
    sale_prices = serializers.DictField(child=serializers.IntegerField(min_value=1, allow_null=True), required=False)


class StockRowSerializer(serializers.ModelSerializer):
    product_id = serializers.IntegerField()
    product = serializers.CharField(source="product.name")
    product_active = serializers.BooleanField(source="product.is_active")
    color_name = serializers.CharField(source="color.name")
    color_hex = serializers.CharField(source="color.hex")
    size_label = serializers.CharField(source="size.label")
    price = serializers.IntegerField()
    thumb = serializers.SerializerMethodField()

    class Meta:
        model = Variant
        fields = ["id", "product_id", "product", "product_active", "color", "color_name", "color_hex", "size", "size_label", "sku", "price", "stock", "thumb"]

    def get_thumb(self, obj):
        images = list(obj.product.images.all())
        img = next((i for i in images if i.color_id == obj.color_id), None) or next(iter(images), None)
        if not img:
            return None
        request = self.context.get("request")
        return request.build_absolute_uri(img.image.url) if request else img.image.url


class StockMoveSerializer(serializers.Serializer):
    # kind → (ledger reason, sign of the change)
    KINDS = {
        "store_sale": (StockMovement.Reason.STORE_SALE, -1),
        "receive": (StockMovement.Reason.RECEIVE, 1),
        "return": (StockMovement.Reason.RETURN, 1),
        "remove": (StockMovement.Reason.ADJUST, -1),
    }

    kind = serializers.ChoiceField(choices=list(KINDS))
    qty = serializers.IntegerField(min_value=1, max_value=100)
    note = serializers.CharField(max_length=200, required=False, allow_blank=True)


class StockSetSerializer(serializers.Serializer):
    stock = serializers.IntegerField(min_value=0)
    note = serializers.CharField(max_length=200, required=False, allow_blank=True)


class StoreSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = StoreSettings
        exclude = ["id", "updated_at"]

    def validate_hero_products(self, value):
        if not isinstance(value, list) or not all(isinstance(i, int) for i in value):
            raise serializers.ValidationError("فهرست محصولات درست نیست.")
        ids = list(dict.fromkeys(value))
        if len(ids) > 8:
            raise serializers.ValidationError("حداکثر ۸ محصول را می‌شود در اسلایدر گذاشت.")
        known = set(Product.objects.filter(pk__in=ids).values_list("pk", flat=True))
        return [i for i in ids if i in known]

    def validate_order_notify_phone(self, value):
        valid, invalid = split_mobiles(value)
        if invalid:
            raise serializers.ValidationError(f"این شماره درست نیست: {'، '.join(invalid)}. هر شماره ۱۱ رقم است و با ۰۹ شروع می‌شود.")
        return ", ".join(valid)


class ShippingMethodSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShippingMethod
        fields = ["id", "name", "description", "fee", "only_city", "needs_postal_code", "is_active", "sort"]


class DiscountCodeSerializer(serializers.ModelSerializer):
    class Meta:
        model = DiscountCode
        fields = ["id", "code", "kind", "value", "max_amount", "min_subtotal", "max_uses", "once_per_customer", "used_count", "starts_at", "ends_at", "is_active", "created_at"]
        read_only_fields = ["used_count", "created_at"]

    def validate_code(self, value):
        value = value.strip().upper()
        if not value.replace("-", "").replace("_", "").isalnum():
            raise serializers.ValidationError("کد فقط می‌تواند حروف انگلیسی، عدد، - و _ داشته باشد.")
        return value

    def validate(self, attrs):
        kind = attrs.get("kind", getattr(self.instance, "kind", DiscountCode.Kind.PERCENT))
        value = attrs.get("value", getattr(self.instance, "value", 0))
        if kind == DiscountCode.Kind.PERCENT and not 1 <= value <= 100:
            raise serializers.ValidationError({"value": "درصد تخفیف باید بین ۱ و ۱۰۰ باشد."})
        return attrs


class AdminOrderListSerializer(serializers.ModelSerializer):
    status_label = serializers.CharField(source="get_status_display")
    item_count = serializers.IntegerField()

    class Meta:
        model = Order
        fields = ["id", "number", "receiver_name", "phone", "city", "total", "status", "status_label", "item_count", "shipping_name", "created_at"]


class AdminOrderSerializer(OrderSerializer):
    next_statuses = serializers.SerializerMethodField()
    payments = serializers.SerializerMethodField()
    customer_orders = serializers.SerializerMethodField()

    class Meta(OrderSerializer.Meta):
        fields = ["id", "user"] + OrderSerializer.Meta.fields + ["admin_note", "next_statuses", "payments", "customer_orders"]

    def get_payments(self, obj):
        return [
            {"status": p.status, "status_label": p.get_status_display(), "amount": p.amount, "ref_id": p.ref_id, "card": p.card, "created_at": p.created_at}
            for p in obj.payments.all()
        ]

    def get_customer_orders(self, obj):
        return Order.objects.filter(user_id=obj.user_id).count()

    def get_next_statuses(self, obj):
        labels = dict(Order.Status.choices)
        return [{"value": s, "label": labels[s]} for s in Order.TRANSITIONS[obj.status]]


class StatusChangeSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=Order.Status.choices, required=False)
    note = serializers.CharField(max_length=200, required=False, allow_blank=True)
    tracking_code = serializers.CharField(max_length=40, required=False, allow_blank=True)
    admin_note = serializers.CharField(required=False, allow_blank=True)


class MovementSerializer(serializers.ModelSerializer):
    product = serializers.CharField(source="variant.product.name")
    color = serializers.CharField(source="variant.color.name")
    size = serializers.CharField(source="variant.size.label")
    reason_label = serializers.CharField(source="get_reason_display")
    by = serializers.CharField(source="created_by.username", default="")

    class Meta:
        model = StockMovement
        fields = ["id", "created_at", "product", "color", "size", "delta", "balance", "reason", "reason_label", "reference", "note", "by"]


class ReviewSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    product_slug = serializers.CharField(source="product.slug", read_only=True)
    author = serializers.CharField(source="author_name", read_only=True)
    phone = serializers.CharField(source="user.username", read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = Review
        fields = ["id", "product", "product_name", "product_slug", "author", "phone", "rating", "text", "status", "status_label", "reply", "created_at"]
        read_only_fields = ["product", "rating", "text", "created_at"]


class AdminReturnSerializer(ReturnSerializer):
    order_id = serializers.IntegerField(source="order.id")
    order_number = serializers.CharField(source="order.number")
    receiver_name = serializers.CharField(source="order.receiver_name")
    phone = serializers.CharField(source="order.phone")
    next_statuses = serializers.SerializerMethodField()

    class Meta(ReturnSerializer.Meta):
        fields = ReturnSerializer.Meta.fields + ["order_id", "order_number", "receiver_name", "phone", "next_statuses"]

    def get_next_statuses(self, obj):
        labels = dict(ReturnRequest.Status.choices)
        return [{"value": s, "label": labels[s]} for s in ReturnRequest.TRANSITIONS[obj.status]]


class StaffMemberSerializer(serializers.Serializer):
    username = serializers.RegexField(r"^[A-Za-z0-9_.-]{3,30}$", error_messages={"invalid": "نام کاربری فقط حروف انگلیسی، عدد و . _ - (۳ تا ۳۰ حرف)."})
    first_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    password = serializers.CharField(min_length=6, max_length=128, required=False, allow_blank=True, trim_whitespace=False)
    is_active = serializers.BooleanField(required=False)
    perms = serializers.ListField(child=serializers.CharField(max_length=40), required=False, max_length=100)


class BannerAdminSerializer(serializers.ModelSerializer):
    placement_label = serializers.CharField(source="get_placement_display", read_only=True)
    live = serializers.SerializerMethodField()

    class Meta:
        model = Banner
        fields = ["id", "placement", "placement_label", "title", "text", "image", "link", "button_label",
                  "starts_at", "ends_at", "is_active", "sort", "live", "created_at"]
        read_only_fields = ["image", "created_at"]

    def get_live(self, obj):
        return Banner.objects.live().filter(pk=obj.pk).exists()

    def validate_link(self, value):
        value = value.strip()
        if value and not (value.startswith("/") or value.startswith("https://") or value.startswith("http://")):
            raise serializers.ValidationError("لینک باید با / (صفحه‌ای از همین سایت) یا https:// شروع شود.")
        return value

    def validate(self, attrs):
        starts = attrs.get("starts_at", getattr(self.instance, "starts_at", None))
        ends = attrs.get("ends_at", getattr(self.instance, "ends_at", None))
        if starts and ends and ends <= starts:
            raise serializers.ValidationError({"ends_at": "پایان باید بعد از شروع باشد."})
        return attrs
