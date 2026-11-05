from rest_framework import serializers

from django.utils import timezone

from apps.accounts.serializers import OptionalPhoneField, PhoneField, normalize_digits

from .models import Order, OrderEvent, OrderItem, ReturnRequest, ShippingMethod


class ShippingMethodSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShippingMethod
        fields = ["id", "name", "description", "fee", "free_from", "only_city", "needs_postal_code"]


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
    receiver_phone = OptionalPhoneField(required=False, allow_blank=True)
    province = serializers.CharField(max_length=40, required=False, allow_blank=True)
    city = serializers.CharField(max_length=60)
    address = serializers.CharField(max_length=500, min_length=10)
    postal_code = serializers.CharField(max_length=20, required=False, allow_blank=True)
    shipping_method = serializers.IntegerField()
    discount_code = serializers.CharField(max_length=30, required=False, allow_blank=True)
    note = serializers.CharField(max_length=300, required=False, allow_blank=True)
    save_address = serializers.BooleanField(default=True)
    client_key = serializers.CharField(max_length=40, required=False, allow_blank=True)

    def validate_postal_code(self, value):
        value = normalize_digits(value)
        if value and len(value) != 10:
            raise serializers.ValidationError("کد پستی باید ۱۰ رقم باشد.")
        return value


class OrderItemSerializer(serializers.ModelSerializer):
    line_total = serializers.IntegerField()

    class Meta:
        model = OrderItem
        fields = ["id", "product_slug", "product_name", "color_name", "size_label", "sku", "image", "unit_price", "qty", "line_total"]


class OrderEventSerializer(serializers.ModelSerializer):
    label = serializers.CharField(source="get_status_display")

    class Meta:
        model = OrderEvent
        fields = ["status", "label", "note", "created_at"]


class OrderSerializer(serializers.ModelSerializer):
    status_label = serializers.CharField(source="get_status_display")
    items = OrderItemSerializer(many=True)
    events = OrderEventSerializer(many=True)
    can_pay = serializers.SerializerMethodField()
    returns = serializers.SerializerMethodField()
    return_window = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = [
            "number", "status", "status_label", "created_at", "receiver_name", "receiver_phone", "phone", "province", "city",
            "address", "postal_code", "note", "shipping_name", "shipping_fee", "subtotal", "discount_code", "discount_amount", "birthday_discount", "total",
            "tracking_code", "payment_deadline", "paid_at", "can_pay", "items", "events", "returns", "return_window",
        ]

    def get_returns(self, obj):
        return ReturnSerializer(obj.returns.prefetch_related("items__order_item"), many=True).data

    def get_return_window(self, obj):
        """{deadline, can, problem}: whether the customer may ask to return this order now."""
        from apps.orders.services import return_window

        if obj.status not in (Order.Status.SHIPPED, Order.Status.DELIVERED):
            return None
        deadline, problem = return_window(obj)
        return {"deadline": deadline, "can": problem is None, "problem": problem}

    def get_can_pay(self, obj):
        """Online payment is on and this unpaid order is still within its deadline."""
        from apps.orders.services import online_payment

        return (
            online_payment() and obj.status == Order.Status.AWAITING_PAYMENT
            and (obj.payment_deadline is None or obj.payment_deadline > timezone.now())
        )


class ReturnSerializer(serializers.ModelSerializer):
    status_label = serializers.CharField(source="get_status_display")
    reason_label = serializers.CharField(source="get_reason_display")
    wants_label = serializers.CharField(source="get_wants_display")
    items = serializers.SerializerMethodField()

    class Meta:
        model = ReturnRequest
        fields = ["id", "reason", "reason_label", "wants", "wants_label", "text", "status", "status_label", "admin_note", "created_at", "updated_at", "items"]

    def get_items(self, obj):
        return [
            {"item": ri.order_item_id, "product_name": ri.order_item.product_name, "color_name": ri.order_item.color_name,
             "size_label": ri.order_item.size_label, "image": ri.order_item.image, "qty": ri.qty}
            for ri in obj.items.all()
        ]


class ReturnLineSerializer(serializers.Serializer):
    item = serializers.IntegerField()
    qty = serializers.IntegerField(min_value=1, max_value=10)


class ReturnInSerializer(serializers.Serializer):
    items = ReturnLineSerializer(many=True)
    reason = serializers.ChoiceField(choices=ReturnRequest.Reason.choices)
    wants = serializers.ChoiceField(choices=["refund", "exchange"])
    text = serializers.CharField(max_length=1000, required=False, allow_blank=True)


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
