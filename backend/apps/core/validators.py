from django.core.validators import RegexValidator

hex_color = RegexValidator(
    regex=r"^#[0-9A-Fa-f]{6}$",
    message="رنگ باید به شکل #RRGGBB باشد، مثلاً #C9A24C.",
)

iran_mobile = RegexValidator(
    regex=r"^09\d{9}$",
    message="شماره موبایل باید ۱۱ رقم باشد و با ۰۹ شروع شود.",
)
