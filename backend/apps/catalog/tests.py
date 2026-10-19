import shutil
import tempfile

from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings

from apps.inventory.models import StockMovement
from apps.inventory.services import move_stock

from .models import Category, Color, Product, ProductImage, Size, SizeSystem, Variant

GUIDE = {"columns": ["سایز", "دور سینه"], "rows": [["S", "۸۶"], ["M", "۹۰"]]}


class CatalogFixture(TestCase):
    def setUp(self):
        self.letters = SizeSystem.objects.create(name="حروفی")
        self.s = Size.objects.create(system=self.letters, label="S", sort=1)
        self.m = Size.objects.create(system=self.letters, label="M", sort=2)
        self.black = Color.objects.create(name="مشکی", hex="#1A1A1A", sort=1)
        self.beige = Color.objects.create(name="بژ", hex="#CDB89A", sort=2)

        self.clothes = Category.objects.create(name="پوشاک", size_system=self.letters, size_guide=GUIDE)
        self.manto = Category.objects.create(name="مانتو", parent=self.clothes)
        self.shoes = Category.objects.create(name="کفش")

        self.coat = Product.objects.create(category=self.manto, name="مانتو کتان", price=3_200_000)
        self.dress = Product.objects.create(category=self.clothes, name="پیراهن", price=4_750_000)
        self.heel = Product.objects.create(category=self.shoes, name="کفش پاشنه‌بلند", price=2_000_000)
        self.hidden = Product.objects.create(category=self.manto, name="مانتو پیش‌نویس", price=1_000_000, is_active=False)

        self.coat_black_m = self.variant(self.coat, self.black, self.m, stock=3)
        self.variant(self.coat, self.beige, self.s, stock=0)
        self.dress_beige_s = self.variant(self.dress, self.beige, self.s, stock=2, sale_price=3_990_000)

    def variant(self, product, color, size, stock, **fields):
        v = Variant.objects.create(product=product, color=color, size=size, **fields)
        if stock:
            move_stock(v, stock, StockMovement.Reason.RECEIVE)
        return v

    def names(self, query=""):
        return {p["name"] for p in self.client.get(f"/api/products/{query}").json()["results"]}


class ModelTests(CatalogFixture):
    def test_prices(self):
        v = self.dress_beige_s
        self.assertEqual((v.price, v.regular_price, v.discount_percent), (3_990_000, 4_750_000, 16))
        v = self.coat_black_m
        self.assertEqual((v.price, v.regular_price, v.discount_percent), (3_200_000, 3_200_000, 0))
        v.price_override, v.sale_price = 2_900_000, 2_500_000
        self.assertEqual((v.price, v.regular_price), (2_500_000, 2_900_000))
        # A sale price left above a lowered price is ignored.
        v.price_override = 2_000_000
        self.assertEqual(v.price, 2_000_000)

    def test_sale_price_must_be_lower(self):
        self.coat_black_m.sale_price = 3_200_000
        with self.assertRaises(ValidationError):
            self.coat_black_m.full_clean()

    def test_persian_slugs_are_unique(self):
        twin = Product.objects.create(category=self.manto, name="مانتو کتان", price=1)
        self.assertEqual(self.coat.slug, "مانتو-کتان")
        self.assertEqual(twin.slug, "مانتو-کتان-2")

    def test_sku_is_generated(self):
        self.assertTrue(self.coat_black_m.sku.startswith(f"P{self.coat.pk}-"))

    def test_category_cannot_be_its_own_ancestor(self):
        self.clothes.parent = self.manto
        with self.assertRaises(ValidationError):
            self.clothes.full_clean()

    def test_size_system_and_guide_are_inherited(self):
        self.assertEqual(self.manto.effective_size_system(), self.letters)
        self.assertEqual(self.manto.effective_size_guide(), GUIDE)
        self.assertEqual(set(self.clothes.descendant_ids()), {self.clothes.pk, self.manto.pk})

    def test_size_guide_rows_must_match_columns(self):
        self.shoes.size_guide = {"columns": ["سایز", "طول"], "rows": [["۳۸"]]}
        with self.assertRaises(ValidationError):
            self.shoes.full_clean()


class ProductApiTests(CatalogFixture):
    def test_list_hides_inactive_products(self):
        self.assertEqual(self.names(), {"مانتو کتان", "پیراهن", "کفش پاشنه‌بلند"})

    def test_category_filter_includes_subcategories(self):
        self.assertEqual(self.names(f"?category={self.clothes.slug}"), {"مانتو کتان", "پیراهن"})
        self.assertEqual(self.names(f"?category={self.manto.slug}"), {"مانتو کتان"})
        self.assertEqual(self.names("?category=نیست"), set())

    def test_color_and_size_filters_only_match_sellable_variants(self):
        # The coat exists in beige/S but that variant is sold out.
        self.assertEqual(self.names(f"?color={self.beige.pk}"), {"پیراهن"})
        self.assertEqual(self.names(f"?size={self.m.pk}"), {"مانتو کتان"})

    def test_price_range_uses_sale_price(self):
        self.assertEqual(self.names("?min_price=3500000&max_price=4000000"), {"پیراهن"})

    def test_stock_and_sale_flags(self):
        self.assertEqual(self.names("?in_stock=true"), {"مانتو کتان", "پیراهن"})
        self.assertEqual(self.names("?in_stock=false"), {"کفش پاشنه‌بلند"})
        self.assertEqual(self.names("?on_sale=true"), {"پیراهن"})

    def test_ordering_by_current_price(self):
        rows = self.client.get("/api/products/?ordering=current").json()["results"]
        self.assertEqual([r["name"] for r in rows], ["کفش پاشنه‌بلند", "مانتو کتان", "پیراهن"])

    def test_search(self):
        self.assertEqual(self.names("?search=کتان"), {"مانتو کتان"})

    def test_list_item_shape(self):
        row = next(r for r in self.client.get("/api/products/").json()["results"] if r["name"] == "مانتو کتان")
        self.assertTrue(row["in_stock"])
        self.assertEqual([c["name"] for c in row["colors"]], ["مشکی", "بژ"])
        self.assertEqual(row["category"]["slug"], self.manto.slug)

    def test_list_has_a_photo_for_each_color(self):
        media = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, media, ignore_errors=True)
        with override_settings(MEDIA_ROOT=media):
            for i, color in enumerate([None, self.beige, self.black, self.beige]):
                ProductImage.objects.create(product=self.coat, color=color, sort=i, image=SimpleUploadedFile(f"{i}.webp", b"x"))
            row = next(r for r in self.client.get("/api/products/").json()["results"] if r["name"] == "مانتو کتان")
        self.assertTrue(row["image"].endswith("0.webp"))
        self.assertEqual(set(row["color_images"]), {str(self.black.pk), str(self.beige.pk)})
        self.assertTrue(row["color_images"][str(self.beige.pk)].endswith("1.webp"))
        self.assertTrue(row["color_images"][str(self.black.pk)].endswith("2.webp"))

    def test_list_prices_come_from_the_cheapest_variant(self):
        Variant.objects.filter(pk=self.coat_black_m.pk).update(price_override=3_000_000, sale_price=2_700_000)
        rows = {r["name"]: r for r in self.client.get("/api/products/").json()["results"]}
        coat, dress = rows["مانتو کتان"], rows["پیراهن"]
        self.assertEqual((coat["price"], coat["sale_price"], coat["current_price"], coat["discount_percent"]), (3_000_000, 2_700_000, 2_700_000, 10))
        self.assertEqual((dress["price"], dress["sale_price"], dress["discount_percent"]), (4_750_000, 3_990_000, 16))
        self.assertEqual(self.names("?max_price=2800000"), {"مانتو کتان", "کفش پاشنه‌بلند"})

    def test_detail(self):
        data = self.client.get(f"/api/products/{self.coat.slug}/").json()
        self.assertEqual(data["sizes"], [{"id": self.s.pk, "label": "S"}, {"id": self.m.pk, "label": "M"}])
        self.assertEqual(data["size_guide"], GUIDE)
        self.assertEqual([b["name"] for b in data["breadcrumbs"]], ["پوشاک", "مانتو"])
        stock = {(v["color"], v["size"]): (v["in_stock"], v["low_stock"]) for v in data["variants"]}
        self.assertEqual(stock[(self.black.pk, "M")], (True, False))
        self.assertEqual(stock[(self.beige.pk, "S")], (False, False))
        self.assertNotIn("stock", data["variants"][0])

    def test_variant_prices_in_detail(self):
        self.variant(self.dress, self.black, self.m, stock=1, price_override=5_100_000)
        data = self.client.get(f"/api/products/{self.dress.slug}/").json()
        prices = {v["color"]: (v["price"], v["regular_price"]) for v in data["variants"]}
        self.assertEqual(prices[self.beige.pk], (3_990_000, 4_750_000))
        self.assertEqual(prices[self.black.pk], (5_100_000, 5_100_000))

    def test_inactive_product_detail_is_404(self):
        self.assertEqual(self.client.get(f"/api/products/{self.hidden.slug}/").status_code, 404)


class CategoryApiTests(CatalogFixture):
    def test_tree_with_subtree_counts(self):
        tree = {c["name"]: c for c in self.client.get("/api/categories/").json()}
        self.assertEqual(set(tree), {"پوشاک", "کفش"})
        self.assertEqual(tree["پوشاک"]["product_count"], 2)
        self.assertEqual(tree["پوشاک"]["children"][0]["name"], "مانتو")
        self.assertEqual(tree["پوشاک"]["children"][0]["product_count"], 1)

    def test_facets(self):
        data = self.client.get("/api/facets/").json()
        self.assertEqual([c["name"] for c in data["colors"]], ["مشکی", "بژ"])
        self.assertEqual([z["label"] for z in data["size_systems"][0]["sizes"]], ["S", "M"])
