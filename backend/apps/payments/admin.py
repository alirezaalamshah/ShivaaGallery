from django.contrib import admin

from .models import Payment


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ["order", "gateway", "amount", "status", "ref_id", "created_at"]
    list_filter = ["status", "gateway"]
    search_fields = ["order__number", "ref_id", "authority"]
    readonly_fields = [f.name for f in Payment._meta.fields]
