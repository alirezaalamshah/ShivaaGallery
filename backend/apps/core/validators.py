import re

from django.core.validators import RegexValidator

hex_color = RegexValidator(
    regex=r"^#[0-9A-Fa-f]{6}$",
    message="رنگ باید به شکل #RRGGBB باشد، مثلاً #C9A24C.",
)

iran_mobile = RegexValidator(
    regex=r"^09\d{9}$",
    message="شماره موبایل باید ۱۱ رقم باشد و با ۰۹ شروع شود.",
)


_DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")


def split_mobiles(value):
    """Split a list of mobile numbers typed by hand (commas, Persian commas, spaces or new lines).
    Returns (valid, invalid), each without repeats and with Persian digits made Latin."""
    valid, invalid = [], []
    for part in re.split(r"[\s,،;]+", str(value or "").translate(_DIGITS)):
        if not part:
            continue
        target = valid if re.fullmatch(r"09\d{9}", part) else invalid
        if part not in target:
            target.append(part)
    return valid, invalid
