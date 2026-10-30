from django.conf import settings
from rest_framework import serializers

from .models import StoreSettings


class StoreSettingsSerializer(serializers.ModelSerializer):
    returns = serializers.SerializerMethodField()
    online_payment = serializers.SerializerMethodField()

    class Meta:
        model = StoreSettings
        fields = [
            "name", "name_latin", "tagline", "logo", "hero_title", "hero_text", "about_title", "about_text",
            "color_ink", "color_accent", "color_background",
            "phone", "landline", "instagram", "city", "address",
            "currency_label", "returns", "terms_text", "privacy_text", "working_hours",
            "enamad_id", "enamad_code", "online_payment",
        ]

    def get_online_payment(self, obj):
        return settings.PAYMENT_GATEWAY != "none"

    def get_returns(self, obj):
        return {
            "enabled": obj.returns_enabled,
            "type": obj.returns_type,
            "days": obj.returns_days,
            "policy": obj.returns_policy,
        }
