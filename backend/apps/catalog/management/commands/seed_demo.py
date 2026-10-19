import json
from pathlib import Path

from django.conf import settings
from django.core.files import File
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.catalog.models import Category, Color, Product, Size, SizeSystem, Variant
from apps.core.models import StoreSettings
from apps.inventory.models import StockMovement
from apps.inventory.services import move_stock

DEFAULT_FILE = Path(settings.BASE_DIR) / "demo" / "demo_store.json"
DEMO_STOCK = 4


class Command(BaseCommand):
    help = "Load a demo store (settings, sizes, colors, categories, products with stock) from a JSON file."

    def add_arguments(self, parser):
        parser.add_argument("--file", default=str(DEFAULT_FILE))
        parser.add_argument("--force", action="store_true", help="Load even if products already exist")

    @transaction.atomic
    def handle(self, *args, **opts):
        if Product.objects.exists() and not opts["force"]:
            raise CommandError("Products already exist. Use --force to add the demo data anyway.")
        data = json.loads(Path(opts["file"]).read_text(encoding="utf-8"))

        store = StoreSettings.load()
        store_data = dict(data.get("store", {}))
        logo = store_data.pop("logo", None)
        for field, value in store_data.items():
            setattr(store, field, value)
        if logo:
            logo_path = Path(opts["file"]).parent / logo
            with logo_path.open("rb") as fh:
                store.logo.save(logo_path.name, File(fh), save=False)
        store.save()

        systems, sizes = {}, {}
        for name, labels in data["size_systems"].items():
            systems[name], _ = SizeSystem.objects.get_or_create(name=name)
            for i, label in enumerate(labels):
                sizes[(name, label)], _ = Size.objects.get_or_create(system=systems[name], label=label, defaults={"sort": i})

        colors = {}
        for i, (name, hex_) in enumerate(data["colors"]):
            colors[name], _ = Color.objects.get_or_create(name=name, defaults={"hex": hex_, "sort": i})

        cats, cat_system = {}, {}

        def make(node, parent, sort):
            system = node.get("sizes") or (cat_system[parent.name] if parent else None)
            cat = Category.objects.create(
                name=node["name"], parent=parent, sort=sort,
                size_system=systems[node["sizes"]] if node.get("sizes") else None,
                size_guide=data["guides"].get(node["sizes"], {}) if node.get("sizes") else {},
            )
            cats[cat.name], cat_system[cat.name] = cat, system
            for j, child in enumerate(node.get("children", [])):
                make(child, cat, j)

        for i, node in enumerate(data["categories"]):
            make(node, None, i)

        for p in data["products"]:
            product = Product.objects.create(
                category=cats[p["category"]], name=p["name"], price=p["price"],
                sale_price=p.get("sale_price"), is_featured=p.get("featured", False),
                details=p.get("details", []),
            )
            system = cat_system[p["category"]]
            for color in p["colors"]:
                for label in p["sizes"]:
                    v = Variant.objects.create(product=product, color=colors[color], size=sizes[(system, label)])
                    if label not in p.get("out", []):
                        move_stock(v, DEMO_STOCK, StockMovement.Reason.RECEIVE, note="داده‌ی نمونه")

        self.stdout.write(self.style.SUCCESS(
            f"Loaded {len(cats)} categories, {len(data['products'])} products, {Variant.objects.count()} variants."
        ))
