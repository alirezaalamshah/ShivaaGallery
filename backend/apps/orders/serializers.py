from rest_framework import serializers

from apps.accounts.serializers import PhoneField, normalize_digits

from .models import Order, OrderEvent, OrderItem, ShippingMethod


class ShippingMethodSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShippingMethod
        fields = ["id", "name", "description", "fee", "only_city"]


class LineSerializer(serializers.Serializer):
    variant = serializers.IntegerField(min_value=1)
    qty = serializers.IntegerField(min_value=1, max_value=10)


class CartSerializer(serializers.Serializer):
    lines = LineSerializer(many=True)


class QuoteSerializer(CartSerializer):
    city = serializers.CharField(max_length=60, required=False, allow_blank=True)
    shipping_method = serializers.IntegerField(required=False, allow_null=True)
    discount_code = serializers.CharField(max_length=30, required=False, allow_blank=True)


class CheckoutSerializer(CartSerializer):
    receiver_name = serializers.CharField(max_length=80, min_length=3)
    province = serializers.CharField(max_length=40, required=False, allow_blank=True)
    city = serializers.CharField(max_length=60)
    address = serializers.CharField(max_length=500, min_length=10)
    postal_code = serializers.CharField(max_length=20, required=False, allow_blank=True)
    shipping_method = serializers.IntegerField()
    discount_code = serializers.CharField(max_length=30, required=False, allow_blank=True)
    note = serializers.CharField(max_length=300, required=False, allow_blank=True)
    save_address = serializers.BooleanField(default=True)

    def validate_postal_code(self, value):
        value = normalize_digits(value)
        if value and len(value) != 10:
            raise serializers.ValidationError("کد پستی باید ۱۰ رقم باشد.")
        return value


class OrderItemSerializer(serializers.ModelSerializer):
    line_total = serializers.IntegerField()

    class Meta:
        model = OrderItem
        fields = ["product_slug", "product_name", "color_name", "size_label", "sku", "image", "unit_price", "qty", "line_total"]


class OrderEventSerializer(serializers.ModelSerializer):
    label = serializers.CharField(source="get_status_display")

    class Meta:
        model = OrderEvent
        fields = ["status", "label", "note", "created_at"]


class OrderSerializer(serializers.ModelSerializer):
    status_label = serializers.CharField(source="get_status_display")
    items = OrderItemSerializer(many=True)
    events = OrderEventSerializer(many=True)

    class Meta:
        model = Order
        fields = [
            "number", "status", "status_label", "created_at", "receiver_name", "phone", "province", "city", "address", "postal_code",
            "note", "shipping_name", "shipping_fee", "subtotal", "discount_code", "discount_amount", "total",
            "tracking_code", "items", "events",
        ]


class OrderSummarySerializer(serializers.ModelSerializer):
    status_label = serializers.CharField(source="get_status_display")
    item_count = serializers.IntegerField()
    first_image = serializers.CharField()

    class Meta:
        model = Order
        fields = ["number", "status", "status_label", "created_at", "total", "item_count", "first_image"]


class TrackSerializer(serializers.Serializer):
    number = serializers.CharField(max_length=12)
    phone = PhoneField()

    def validate_number(self, value):
        return normalize_digits(value)
