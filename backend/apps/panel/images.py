from io import BytesIO
from pathlib import Path

from django.core.files.base import ContentFile
from PIL import Image, ImageOps, UnidentifiedImageError
from rest_framework.exceptions import ValidationError

MAX_SIDE = 2000
MAX_BYTES = 15 * 1024 * 1024


def prepare_photo(upload):
    """
    Turn an uploaded photo into a web-ready JPEG: applies the phone's EXIF
    rotation, drops metadata (including location), caps the long side.
    """
    if upload.size > MAX_BYTES:
        raise ValidationError("حجم عکس باید کمتر از ۱۵ مگابایت باشد.")
    try:
        im = Image.open(upload)
        im = ImageOps.exif_transpose(im)
    except (UnidentifiedImageError, OSError):
        raise ValidationError("این فایل عکس قابل خواندن نیست. فرمت JPG، PNG یا WEBP بفرستید.")
    if im.mode not in ("RGB", "L"):
        background = Image.new("RGB", im.size, (255, 255, 255))
        background.paste(im.convert("RGBA"), mask=im.convert("RGBA").split()[-1])
        im = background
    im = im.convert("RGB")
    im.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
    buf = BytesIO()
    im.save(buf, "JPEG", quality=85, optimize=True, progressive=True)
    return ContentFile(buf.getvalue(), name=f"{Path(upload.name).stem[:40] or 'photo'}.jpg")
