from django.contrib import admin

from .models import Address, OtpCode


@admin.register(Address)
class AddressAdmin(admin.ModelAdmin):
    list_display = ["receiver_name", "user", "city", "updated_at"]
    search_fields = ["receiver_name", "user__username", "city"]


@admin.register(OtpCode)
class OtpCodeAdmin(admin.ModelAdmin):
    list_display = ["phone", "created_at", "used_at", "attempts", "ip"]
    search_fields = ["phone"]
    readonly_fields = ["phone", "code_hash", "attempts", "created_at", "used_at", "ip"]
