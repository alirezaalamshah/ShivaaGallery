from django.contrib import admin
from django.shortcuts import redirect
from django.urls import reverse

from .models import StoreSettings


@admin.register(StoreSettings)
class StoreSettingsAdmin(admin.ModelAdmin):
    fieldsets = [
        ("هویت", {"fields": ["name", "name_latin", "tagline", "logo"]}),
        ("صفحه‌ی اصلی", {"fields": ["hero_title", "hero_text", "about_title", "about_text"]}),
        ("ظاهر", {"fields": ["theme"]}),
        ("تماس", {"fields": ["phone", "landline", "socials", "city", "address"]}),
        ("فروش", {"fields": ["currency_label"]}),
        ("مرجوعی", {"fields": ["returns_enabled", "returns_type", "returns_days", "returns_policy"]}),
    ]

    def has_add_permission(self, request):
        return not StoreSettings.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False

    def changelist_view(self, request, extra_context=None):
        obj = StoreSettings.load()
        return redirect(reverse("admin:core_storesettings_change", args=[obj.pk]))
