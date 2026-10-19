import shutil
import tempfile
from io import BytesIO

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from PIL import Image

from apps.catalog.models import Category, Color, Product, Size, SizeSystem, Variant
from apps.orders.models import Order, ShippingMethod
from apps.orders.services import place_order

User = get_user_model()
TMP_MEDIA = tempfile.mkdtemp()


def photo(name="p.jpg", size=(3000, 4000), orientation=None):
    buf = BytesIO()
    im = Image.new("RGB", size, (200, 30, 40))
    exif = Image.Exif()
    if orientation:
        exif[0x0112] = orientation
    im.save(buf, "JPEG", exif=exif)
    return SimpleUploadedFile(name, buf.getvalue(), content_type="image/jpeg")


@override_settings(MEDIA_ROOT=TMP_MEDIA)
class PanelTests(TestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(TMP_MEDIA, ignore_errors=True)

    def setUp(self):
        self.staff = User.objects.create_user("admin", password="x", is_staff=True)
        self.customer = User.objects.create_user("09121234567")
        self.sizes = SizeSystem.objects.create(name="حروفی")
        self.s = Size.objects.create(system=self.sizes, label="S", sort=0)
        self.m = Size.objects.create(system=self.sizes, label="M", sort=1)
        self.black = Color.objects.create(name="مشکی", hex="#111111")
        self.red = Color.objects.create(name="قرمز", hex="#aa2222")
        self.cat = Category.objects.create(name="مانتو", size_system=self.sizes)
        self.client.force_login(self.staff)

    def test_customers_and_guests_are_blocked(self):
        self.client.logout()
        self.assertEqual(self.client.get("/api/admin/products/").status_code, 403)
        self.client.force_login(self.customer)
        self.assertEqual(self.client.get("/api/admin/dashboard/").status_code, 403)

    def test_create_product_then_matrix_sets_variants_and_stock(self):
        res = self.client.post("/api/admin/products/", {"name": "مانتو تست", "category": self.cat.pk, "price": 2_000_000, "details": ["جنس: کتان"]}, content_type="application/json")
        self.assertEqual(res.status_code, 201, res.content)
        pid = res.json()["id"]
        res = self.client.post(f"/api/admin/products/{pid}/matrix/", {
            "colors": [self.black.pk, self.red.pk], "sizes": [self.s.pk, self.m.pk],
            "stock": {f"{self.black.pk}-{self.s.pk}": 5, f"{self.red.pk}-{self.m.pk}": 2},
        }, content_type="application/json")
        stock = {(v["color_name"], v["size_label"]): v["stock"] for v in res.json()["variants"]}
        self.assertEqual(stock, {("مشکی", "S"): 5, ("مشکی", "M"): 0, ("قرمز", "S"): 0, ("قرمز", "M"): 2})
        # Dropping red deactivates its variants instead of deleting them.
        self.client.post(f"/api/admin/products/{pid}/matrix/", {"colors": [self.black.pk], "sizes": [self.s.pk, self.m.pk]}, content_type="application/json")
        self.assertEqual(Variant.objects.filter(product_id=pid, is_active=True).count(), 2)
        self.assertEqual(Variant.objects.filter(product_id=pid).count(), 4)

    def test_matrix_sets_price_of_each_variant(self):
        product = Product.objects.create(category=self.cat, name="x", price=2_000_000)
        url = f"/api/admin/products/{product.pk}/matrix/"
        body = {"colors": [self.black.pk, self.red.pk], "sizes": [self.s.pk, self.m.pk]}
        res = self.client.post(url, {
            **body,
            "prices": {f"{self.black.pk}-{self.s.pk}": 2_500_000, f"{self.red.pk}-{self.m.pk}": None},
            "sale_prices": {f"{self.black.pk}-{self.s.pk}": 2_200_000, f"{self.red.pk}-{self.s.pk}": 1_800_000},
        }, content_type="application/json")
        prices = {(v["color_name"], v["size_label"]): (v["price"], v["regular_price"]) for v in res.json()["variants"]}
        self.assertEqual(prices, {
            ("مشکی", "S"): (2_200_000, 2_500_000), ("مشکی", "M"): (2_000_000, 2_000_000),
            ("قرمز", "S"): (1_800_000, 2_000_000), ("قرمز", "M"): (2_000_000, 2_000_000),
        })
        # A sale price must be below the price of that color and size.
        bad = self.client.post(url, {**body, "prices": {}, "sale_prices": {f"{self.red.pk}-{self.m.pk}": 2_000_000}}, content_type="application/json")
        self.assertEqual(bad.status_code, 400)
        self.assertIn("sale_prices", bad.json())
        self.assertEqual(Variant.objects.get(product=product, color=self.red, size=self.s).sale_price, 1_800_000)
        # Saving without prices leaves them alone; an empty map clears them.
        self.client.post(url, body, content_type="application/json")
        self.assertEqual(Variant.objects.get(product=product, color=self.black, size=self.s).price_override, 2_500_000)
        self.client.post(url, {**body, "prices": {}, "sale_prices": {}}, content_type="application/json")
        self.assertFalse(Variant.objects.filter(product=product, price_override__isnull=False).exists())
        self.assertFalse(Variant.objects.filter(product=product, sale_price__isnull=False).exists())
        self.assertEqual(self.client.post(url, {**body, "prices": {f"{self.black.pk}-{self.s.pk}": 0}}, content_type="application/json").status_code, 400)

    def test_photo_upload_is_rotated_resized_and_stripped(self):
        product = Product.objects.create(category=self.cat, name="عکس", price=1)
        res = self.client.post(f"/api/admin/products/{product.pk}/images/", {"files": [photo(orientation=6)], "color": self.red.pk})
        self.assertEqual(res.status_code, 200, res.content)
        img = product.images.get()
        with Image.open(img.image.path) as im:
            self.assertEqual(im.format, "WEBP")
            self.assertEqual(im.size, (1200, 1600))  # rotated by EXIF, then cropped to the 3:4 frame
            self.assertNotIn(0x0112, im.getexif())
        self.assertEqual(img.color, self.red)

    def test_bad_file_is_rejected(self):
        product = Product.objects.create(category=self.cat, name="عکس", price=1)
        bad = SimpleUploadedFile("x.jpg", b"not an image", content_type="image/jpeg")
        self.assertEqual(self.client.post(f"/api/admin/products/{product.pk}/images/", {"files": [bad]}).status_code, 400)

    def test_set_variant_stock_writes_ledger(self):
        product = Product.objects.create(category=self.cat, name="x", price=1)
        v = Variant.objects.create(product=product, color=self.black, size=self.s)
        res = self.client.post(f"/api/admin/variants/{v.pk}/stock/", {"stock": 7}, content_type="application/json")
        self.assertEqual(res.json()["stock"], 7)
        self.assertEqual(v.movements.get().reason, "receive")

    def test_size_system_cannot_drop_used_size(self):
        Variant.objects.create(product=Product.objects.create(category=self.cat, name="x", price=1), color=self.black, size=self.s)
        res = self.client.put(f"/api/admin/size-systems/{self.sizes.pk}/", {"name": "حروفی", "sizes": [{"id": self.m.pk, "label": "M"}]}, content_type="application/json")
        self.assertEqual(res.status_code, 400)
        self.assertTrue(Size.objects.filter(pk=self.s.pk).exists())

    def test_category_cycle_and_protected_delete(self):
        child = Category.objects.create(name="مجلسی", parent=self.cat)
        res = self.client.patch(f"/api/admin/categories/{self.cat.pk}/", {"parent": child.pk}, content_type="application/json")
        self.assertEqual(res.status_code, 400)
        Product.objects.create(category=child, name="x", price=1)
        self.assertEqual(self.client.delete(f"/api/admin/categories/{child.pk}/").status_code, 409)

    def test_store_settings_update(self):
        res = self.client.patch("/api/admin/store/", {"name": "فروشگاه", "color_accent": "#123456", "returns_days": 10}, content_type="application/json")
        self.assertEqual(res.json()["returns_days"], 10)
        bad = self.client.patch("/api/admin/store/", {"color_accent": "gold"}, content_type="application/json")
        self.assertEqual(bad.status_code, 400)

    def test_order_status_flow_and_dashboard(self):
        v = Variant.objects.create(product=Product.objects.create(category=self.cat, name="x", price=500_000), color=self.black, size=self.s)
        from apps.inventory.services import move_stock
        move_stock(v, 3, "receive")
        method = ShippingMethod.objects.create(name="پست", fee=100_000)
        order = place_order(self.customer, {"lines": [{"variant": v.pk, "qty": 1}], "receiver_name": "مریم", "city": "اهواز", "address": "خیابان یک پلاک ده", "shipping_method": method.pk})
        res = self.client.post(f"/api/admin/orders/{order.pk}/update_status/", {"status": "shipped"}, content_type="application/json")
        self.assertEqual(res.status_code, 409)  # awaiting_payment → shipped is not allowed
        self.client.post(f"/api/admin/orders/{order.pk}/update_status/", {"status": "paid"}, content_type="application/json")
        res = self.client.post(f"/api/admin/orders/{order.pk}/update_status/", {"status": "shipped", "tracking_code": "123"}, content_type="application/json")
        self.assertEqual((res.json()["status"], res.json()["tracking_code"]), ("shipped", "123"))
        self.assertEqual([s["value"] for s in res.json()["next_statuses"]], ["delivered"])
        dash = self.client.get("/api/admin/dashboard/").json()
        self.assertEqual(dash["orders_today"], 1)
        self.assertEqual(dash["sales_today"], 600_000)
        self.assertEqual(len(dash["sales_week"]), 7)
        self.assertEqual(Order.objects.get().events.count(), 3)

    def test_product_with_orders_cannot_be_deleted(self):
        v = Variant.objects.create(product=Product.objects.create(category=self.cat, name="x", price=1), color=self.black, size=self.s)
        from apps.inventory.services import move_stock
        move_stock(v, 1, "receive")
        method = ShippingMethod.objects.create(name="پست", fee=0)
        place_order(self.customer, {"lines": [{"variant": v.pk, "qty": 1}], "receiver_name": "مریم", "city": "اهواز", "address": "خیابان یک پلاک ده", "shipping_method": method.pk})
        self.assertEqual(self.client.delete(f"/api/admin/products/{v.product_id}/").status_code, 409)
        fresh = Product.objects.create(category=self.cat, name="y", price=1)
        Variant.objects.create(product=fresh, color=self.black, size=self.s)
        self.assertEqual(self.client.delete(f"/api/admin/products/{fresh.pk}/").status_code, 204)
