import shutil
import tempfile

from django.core.management import CommandError, call_command
from django.test import TestCase, override_settings

from apps.core.models import StoreSettings

from .models import Category, Product, Variant

TMP_MEDIA = tempfile.mkdtemp()


@override_settings(MEDIA_ROOT=TMP_MEDIA)
class SeedDemoTests(TestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(TMP_MEDIA, ignore_errors=True)

    def test_loads_demo_store_once(self):
        call_command("seed_demo", stdout=None)
        self.assertEqual(StoreSettings.load().city, "دزفول")
        self.assertTrue(StoreSettings.load().logo.name.startswith("store/"))
        self.assertEqual(Product.objects.count(), 9)
        self.assertTrue(Category.objects.filter(name="مانتو مجلسی", parent__name="مانتو").exists())
        sold_out = Variant.objects.get(product__name="مانتو اداری کتان «نسیم»", color__name="بژ", size__label="XXL")
        self.assertEqual(sold_out.stock, 0)
        with self.assertRaises(CommandError):
            call_command("seed_demo")
