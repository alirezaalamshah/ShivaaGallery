import secrets
from io import BytesIO
from pathlib import Path

from django.core.files.base import ContentFile
from PIL import Image, ImageOps, UnidentifiedImageError
from rest_framework.exceptions import ValidationError

# Every product and category photo is stored at exactly this size, the 3:4
# frame the storefront uses, so cards line up and pages stay light.
PHOTO_SIZE = (1200, 1600)
LOGO_SIZE = (600, 600)
# Home page banners: 4:3, which reads well on a phone and sits two or three to a row on a computer.
BANNER_SIZE = (1440, 1080)
MAX_BYTES = 20 * 1024 * 1024
QUALITY = 80


def prepare_photo(upload, size=PHOTO_SIZE):
    """
    Turn any uploaded photo into a light WebP of a fixed size: applies the
    phone's EXIF rotation, drops metadata (including location), and crops to
    the target shape around the centre. The admin panel crops in the browser
    first, so normally the centre crop changes nothing.
    """
    if upload.size > MAX_BYTES:
        raise ValidationError("حجم عکس باید کمتر از ۲۰ مگابایت باشد.")
    try:
        im = Image.open(upload)
        im = ImageOps.exif_transpose(im)
    except (UnidentifiedImageError, OSError):
        raise ValidationError("این فایل عکس قابل خواندن نیست. فرمت JPG، PNG یا WEBP بفرستید.")
    if im.mode in ("RGBA", "LA", "P"):
        rgba = im.convert("RGBA")
        background = Image.new("RGB", im.size, (255, 255, 255))
        background.paste(rgba, mask=rgba.split()[-1])
        im = background
    im = ImageOps.fit(im.convert("RGB"), size, Image.LANCZOS)
    buf = BytesIO()
    im.save(buf, "WEBP", quality=QUALITY, method=6)
    # A short random part makes every upload's name new, even after the old file is deleted,
    # so browsers and the image resizer may keep a copy for a long time (see config/urls.py).
    return ContentFile(buf.getvalue(), name=f"{Path(upload.name).stem[:40] or 'photo'}-{secrets.token_hex(4)}.webp")
