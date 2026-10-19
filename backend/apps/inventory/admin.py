from django.contrib import admin

from .models import StockMovement


@admin.register(StockMovement)
class StockMovementAdmin(admin.ModelAdmin):
    list_display = ["created_at", "variant", "delta", "balance", "reason", "reference", "created_by"]
    list_filter = ["reason", "created_at"]
    search_fields = ["variant__sku", "variant__product__name", "reference", "note"]
    list_select_related = ["variant__product", "variant__color", "variant__size", "created_by"]

    # The ledger is append-only: rows are written by move_stock, never edited.
    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
