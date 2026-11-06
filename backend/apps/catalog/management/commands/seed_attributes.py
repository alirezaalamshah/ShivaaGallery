"""
Fill in the main colors and the standard sizes, so the admin can pick them straight away.

Safe to run twice and on a live store: what already exists keeps its name and color code. Run it
by hand rather than on every deploy, or a color the admin deleted on purpose would come back.
"""

import re

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.catalog.models import Color, Size, SizeSystem

COLORS = [
    ("مشکی", "#1C1A18"), ("سفید", "#FFFFFF"), ("کرم", "#E3D5BC"), ("بژ", "#D2BFA3"), ("نسکافه‌ای", "#A67B5B"),
    ("قهوه‌ای", "#773A09"), ("خاکی", "#B6AC96"), ("طوسی", "#8A8A86"), ("نوک‌مدادی", "#3F4246"), ("نقره‌ای", "#BFC1C2"),
    ("طلایی", "#C9A43E"), ("زرد", "#EFC93B"), ("لیمویی", "#E7E00D"), ("خردلی", "#C9962A"), ("نارنجی", "#E2762B"),
    ("آجری", "#B85A22"), ("قرمز", "#A3262E"), ("زرشکی", "#8F1919"), ("گلبهی", "#E8A798"), ("صورتی", "#E58BAA"),
    ("یاسی", "#BFA2D6"), ("بنفش", "#5E3A87"), ("آبی آسمانی", "#8CC4E8"), ("آبی", "#3F5E8C"), ("سرمه‌ای", "#2E4385"),
    ("فیروزه‌ای", "#5DBDD5"), ("سبز", "#2E8028"), ("سبز یشمی", "#1F6B55"), ("زیتونی", "#6B6B2E"),
]

SIZES = {
    "حروفی": ["XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL"],
    "عددی": [str(n) for n in range(32, 64, 2)],
    "کفش": [str(n) for n in range(36, 42)],
    "فری‌سایز": ["فری‌سایز"],
}


def same_name(name):
    """«سرمه ای» and «سرمه‌ای» are one color, however they were typed."""
    return re.sub(r"[\s‌]", "", name)


class Command(BaseCommand):
    help = "Add the main colors and standard sizes that are missing. Existing ones are kept."

    @transaction.atomic
    def handle(self, *args, **opts):
        known = {same_name(c.name) for c in Color.objects.all()}
        sort = max(Color.objects.values_list("sort", flat=True), default=-1)
        added_colors = 0
        for name, hex_ in COLORS:
            if same_name(name) not in known:
                sort += 1
                Color.objects.create(name=name, hex=hex_, sort=sort)
                added_colors += 1

        added_sizes = 0
        for system_name, labels in SIZES.items():
            system, _ = SizeSystem.objects.get_or_create(name=system_name)
            for i, label in enumerate(labels):
                _, made = Size.objects.update_or_create(system=system, label=label, defaults={"sort": i})
                added_sizes += made
            # The admin's own sizes stay, after the standard ones.
            own = system.sizes.exclude(label__in=labels).order_by("sort", "id")
            for i, size in enumerate(own, start=len(labels)):
                Size.objects.filter(pk=size.pk).update(sort=i)

        self.stdout.write(f"Added {added_colors} colors and {added_sizes} sizes.")
