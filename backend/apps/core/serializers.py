from django.conf import settings
from rest_framework import serializers

from .models import Banner, StoreSettings


class StoreSettingsSerializer(serializers.ModelSerializer):
    returns = serializers.SerializerMethodField()
    online_payment = serializers.SerializerMethodField()
    announcements = serializers.SerializerMethodField()

    class Meta:
        model = StoreSettings
        fields = [
            "name", "name_latin", "tagline", "logo", "hero_title", "hero_text", "about_title", "about_text",
            "theme",
            "phone", "landline", "instagram", "city", "address",
            "currency_label", "returns", "terms_text", "privacy_text", "working_hours",
            "enamad_id", "enamad_code", "online_payment", "announcements",
        ]

    def get_announcements(self, obj):
        """Live text campaigns for the line above every page."""
        return [{"id": b.id, "title": b.title, "text": b.text, "link": b.link} for b in Banner.objects.live().filter(placement=Banner.Placement.BAR)]

    def get_online_payment(self, obj):
        return settings.PAYMENT_GATEWAY != "none"

    def get_returns(self, obj):
        return {
            "enabled": obj.returns_enabled,
            "type": obj.returns_type,
            "days": obj.returns_days,
            "policy": obj.returns_policy,
        }


class BannerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Banner
        fields = ["id", "title", "text", "image", "link", "button_label"]
