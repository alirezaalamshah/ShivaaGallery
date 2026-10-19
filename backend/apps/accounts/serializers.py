from rest_framework import serializers

from apps.core.validators import iran_mobile

from .models import Address

PERSIAN_DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")


def normalize_digits(value):
    return "".join(ch for ch in str(value).translate(PERSIAN_DIGITS) if ch.isdigit())


class PhoneField(serializers.CharField):
    def to_internal_value(self, data):
        value = normalize_digits(super().to_internal_value(data))
        if value.startswith("98") and len(value) == 12:
            value = "0" + value[2:]
        elif value.startswith("9") and len(value) == 10:
            value = "0" + value
        iran_mobile(value)
        return value


class OtpRequestSerializer(serializers.Serializer):
    phone = PhoneField()


class OtpVerifySerializer(serializers.Serializer):
    phone = PhoneField()
    code = serializers.CharField(max_length=10)

    def validate_code(self, value):
        return normalize_digits(value)


class StaffLoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(trim_whitespace=False)


class AddressSerializer(serializers.ModelSerializer):
    class Meta:
        model = Address
        fields = ["id", "receiver_name", "city", "address", "postal_code"]

    def validate_postal_code(self, value):
        value = normalize_digits(value)
        if value and len(value) != 10:
            raise serializers.ValidationError("کد پستی باید ۱۰ رقم باشد.")
        return value


def me_payload(user):
    if not user.is_authenticated:
        return {"authenticated": False}
    return {
        "authenticated": True,
        "phone": None if user.is_staff else user.username,
        "name": user.get_full_name(),
        "is_staff": user.is_staff,
        "username": user.username,
    }
