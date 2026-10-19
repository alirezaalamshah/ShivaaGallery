from rest_framework import serializers

from .models import StoreSettings


class StoreSettingsSerializer(serializers.ModelSerializer):
    returns = serializers.SerializerMethodField()

    class Meta:
        model = StoreSettings
        fields = [
            "name", "name_latin", "tagline", "logo", "hero_title", "hero_text",
            "color_ink", "color_accent", "color_background",
            "phone", "instagram", "city", "address",
            "currency_label", "returns",
        ]

    def get_returns(self, obj):
        return {
            "enabled": obj.returns_enabled,
            "type": obj.returns_type,
            "days": obj.returns_days,
            "policy": obj.returns_policy,
        }
