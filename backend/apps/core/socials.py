"""
The store's social media pages, as many as it has (two Instagram pages, a Telegram channel, Bale …).
Each is a network from the list below and an ID on it; the site builds the link. A full https://
address is kept as it is, for pages whose link does not follow the usual pattern.
"""

import re

# key → (Persian name, link pattern). Iranian networks first, as the shop's customers use them most.
NETWORKS = {
    "instagram": ("اینستاگرام", "https://instagram.com/{}"),
    "telegram": ("تلگرام", "https://t.me/{}"),
    "whatsapp": ("واتس‌اپ", "https://wa.me/{}"),
    "bale": ("بله", "https://ble.ir/{}"),
    "rubika": ("روبیکا", "https://rubika.ir/{}"),
    "eitaa": ("ایتا", "https://eitaa.com/{}"),
    "soroush": ("سروش‌پلاس", "https://splus.ir/{}"),
    "igap": ("آی‌گپ", "https://igap.net/{}"),
    "aparat": ("آپارات", "https://www.aparat.com/{}"),
    "youtube": ("یوتیوب", "https://youtube.com/@{}"),
    "tiktok": ("تیک‌تاک", "https://tiktok.com/@{}"),
    "pinterest": ("پینترست", "https://pinterest.com/{}"),
    "facebook": ("فیسبوک", "https://facebook.com/{}"),
    "x": ("ایکس (توییتر)", "https://x.com/{}"),
    "linkedin": ("لینکدین", "https://linkedin.com/in/{}"),
}

MAX = 30


def _whatsapp(handle):
    """wa.me takes the number with the country code: 0912… becomes 98912…."""
    digits = re.sub(r"\D", "", handle)
    return "98" + digits[1:] if digits.startswith("0") else digits


def clean(items):
    """Validate a list of {network, handle}; returns the cleaned list or raises ValueError with a message."""
    if not isinstance(items, list):
        raise ValueError("فهرست شبکه‌های اجتماعی درست نیست.")
    if len(items) > MAX:
        raise ValueError(f"حداکثر {MAX} شبکه‌ی اجتماعی را می‌شود ثبت کرد.")
    out = []
    for item in items:
        if not isinstance(item, dict) or item.get("network") not in NETWORKS:
            raise ValueError("یکی از شبکه‌های اجتماعی از فهرست انتخاب نشده.")
        handle = str(item.get("handle", "")).strip()
        if not handle.startswith("http"):
            handle = handle.lstrip("@").strip()
        if not handle:
            continue
        if len(handle) > 200 or (handle.startswith("http") and not handle.startswith("https://")) or re.search(r"\s", handle):
            raise ValueError(f"آیدی «{handle[:40]}» درست نیست؛ فقط آیدی را بدون فاصله بنویسید.")
        out.append({"network": item["network"], "handle": handle})
    return out


def with_links(items):
    """The list for the site: each page with its network's name and a ready link."""
    rows = []
    for item in items or []:
        net = NETWORKS.get(item.get("network"))
        handle = item.get("handle", "")
        if not net or not handle:
            continue
        if handle.startswith("https://"):
            url = handle
        else:
            url = net[1].format(_whatsapp(handle) if item["network"] == "whatsapp" else handle)
        rows.append({"network": item["network"], "label": net[0], "handle": handle, "url": url})
    return rows
