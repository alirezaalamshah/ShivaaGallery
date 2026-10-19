from django.core.management import CommandError, call_command
from django.test import TestCase

from apps.core.models import StoreSettings

from .models import Category, Product, Variant


class SeedDemoTests(TestCase):
    def test_loads_demo_store_once(self):
        call_command("seed_demo", stdout=None)
        self.assertEqual(StoreSettings.load().city, "دزفول")
        self.assertEqual(Product.objects.count(), 9)
        self.assertTrue(Category.objects.filter(name="مانتو مجلسی", parent__name="مانتو").exists())
        sold_out = Variant.objects.get(product__name="مانتو اداری کتان «نسیم»", color__name="بژ", size__label="XXL")
        self.assertEqual(sold_out.stock, 0)
        with self.assertRaises(CommandError):
            call_command("seed_demo")
