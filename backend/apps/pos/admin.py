from django.contrib import admin

from .models import Sale, SaleItem


class SaleItemInline(admin.TabularInline):
    model = SaleItem
    extra = 0
    readonly_fields = ["variant", "product_name", "color_name", "size_label", "sku", "unit_price", "qty"]
    can_delete = False


@admin.register(Sale)
class SaleAdmin(admin.ModelAdmin):
    list_display = ["number", "created_at", "seller", "total", "status"]
    list_filter = ["status", "seller"]
    search_fields = ["number", "customer_phone", "customer_name"]
    inlines = [SaleItemInline]
    readonly_fields = [f.name for f in Sale._meta.fields]
