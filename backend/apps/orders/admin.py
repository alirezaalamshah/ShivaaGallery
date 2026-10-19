from django.contrib import admin

from .models import DiscountCode, Order, OrderEvent, OrderItem, ShippingMethod


@admin.register(ShippingMethod)
class ShippingMethodAdmin(admin.ModelAdmin):
    list_display = ["name", "fee", "only_city", "is_active", "sort"]
    list_editable = ["fee", "is_active", "sort"]


@admin.register(DiscountCode)
class DiscountCodeAdmin(admin.ModelAdmin):
    list_display = ["code", "kind", "value", "used_count", "max_uses", "ends_at", "is_active"]
    search_fields = ["code"]


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0
    readonly_fields = ["product_name", "color_name", "size_label", "sku", "unit_price", "qty"]
    fields = readonly_fields


class OrderEventInline(admin.TabularInline):
    model = OrderEvent
    extra = 0
    readonly_fields = ["status", "note", "by", "created_at"]


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ["number", "receiver_name", "phone", "city", "total", "status", "created_at"]
    list_filter = ["status", "created_at"]
    search_fields = ["number", "phone", "receiver_name"]
    inlines = [OrderItemInline, OrderEventInline]
    readonly_fields = ["number", "user", "subtotal", "shipping_fee", "discount_amount", "total", "status"]
