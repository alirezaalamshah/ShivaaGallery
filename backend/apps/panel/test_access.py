from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.accounts.models import StaffAccess
from apps.accounts.roles import ALL, normalize
from apps.catalog.models import Category, Color, Product, Size, SizeSystem, Variant
from apps.core.models import StoreSettings
from apps.inventory.models import StockMovement
from apps.inventory.services import move_stock
from apps.pos.models import Sale

User = get_user_model()


class AccessFixture(TestCase):
    def setUp(self):
        sizes = SizeSystem.objects.create(name="حروفی")
        self.cat = Category.objects.create(name="مانتو", size_system=sizes)
        self.coat = Product.objects.create(category=self.cat, name="مانتو کتان", price=1_000_000, cost_price=600_000)
        self.black = Color.objects.create(name="مشکی", hex="#111111")
        self.size = Size.objects.create(system=sizes, label="M")
        self.v = Variant.objects.create(product=self.coat, color=self.black, size=self.size)
        move_stock(self.v, 5, StockMovement.Reason.RECEIVE)
        self.admin = User.objects.create_user("admin", password="x", is_staff=True)

    def staff(self, *perms, username="neda"):
        user = User.objects.create_user(username, password="x")
        StaffAccess.objects.create(user=user, perms=normalize(perms))
        self.client.force_login(user)
        return user


class CatalogTests(TestCase):
    def test_a_permission_brings_the_view_of_its_part_and_what_it_builds_on(self):
        self.assertEqual(normalize(["orders.manage", "pos.discount_any", "nonsense"]), ["orders.manage", "orders.view", "pos.discount", "pos.discount_any"])
        self.assertIn("stock.history", ALL)


class PanelAccessTests(AccessFixture):
    def test_stock_keeper_works_the_stock_but_sees_no_purchase_price_and_nothing_else(self):
        self.staff("stock.view", "stock.edit", "products.view", "products.edit")
        self.assertEqual(self.client.get("/api/admin/variants/").status_code, 200)
        res = self.client.post(f"/api/admin/variants/{self.v.pk}/move/", {"kind": "receive", "qty": 2}, content_type="application/json")
        self.assertEqual(res.status_code, 200, res.content)
        rows = self.client.get("/api/admin/products/").json()["results"]
        self.assertNotIn("cost_price", rows[0])
        self.assertNotIn("cost_price", self.client.get(f"/api/admin/products/{self.coat.pk}/").json())
        self.client.patch(f"/api/admin/products/{self.coat.pk}/", {"cost_price": 1}, content_type="application/json")
        self.coat.refresh_from_db()
        self.assertEqual(self.coat.cost_price, 600_000)
        for path in ("/api/admin/dashboard/", "/api/admin/orders/", "/api/admin/reports/", "/api/admin/team/", "/api/admin/customers/", "/api/admin/stock-movements/"):
            self.assertEqual(self.client.get(path).status_code, 403, path)
        self.assertEqual(self.client.delete(f"/api/admin/products/{self.coat.pk}/").status_code, 403)

    def test_product_editor_without_stock_access_cannot_change_stock_through_the_matrix(self):
        self.staff("products.edit")
        body = {"colors": [self.black.pk], "sizes": [self.size.pk], "stock": {f"{self.black.pk}-{self.size.pk}": 50}}
        res = self.client.post(f"/api/admin/products/{self.coat.pk}/matrix/", body, content_type="application/json")
        self.assertEqual(res.status_code, 403)
        self.v.refresh_from_db()
        self.assertEqual(self.v.stock, 5)
        body["stock"] = {f"{self.black.pk}-{self.size.pk}": 5}
        self.assertEqual(self.client.post(f"/api/admin/products/{self.coat.pk}/matrix/", body, content_type="application/json").status_code, 200)

    def test_viewing_orders_does_not_allow_changing_or_exporting_them(self):
        self.staff("orders.view")
        self.assertEqual(self.client.get("/api/admin/orders/").status_code, 200)
        self.assertEqual(self.client.get("/api/admin/orders/export/").status_code, 403)
        self.assertEqual(self.client.post("/api/admin/orders/1/update_status/", {}, content_type="application/json").status_code, 403)

    def test_home_editor_may_change_the_slider_but_not_the_store_settings(self):
        self.staff("home.manage")
        ok = self.client.patch("/api/admin/store/", {"hero_products": [self.coat.pk]}, content_type="application/json")
        self.assertEqual(ok.status_code, 200, ok.content)
        res = self.client.patch("/api/admin/store/", {"name": "فروشگاه دیگر"}, content_type="application/json")
        self.assertEqual(res.status_code, 403)
        self.assertNotEqual(StoreSettings.load().name, "فروشگاه دیگر")

    def test_menu_badges_only_count_what_the_user_may_open(self):
        self.staff("returns.view")
        self.assertEqual(set(self.client.get("/api/admin/badges/").json()), {"returns_open"})
        self.client.force_login(User.objects.create_user("09121234567"))
        self.assertEqual(self.client.get("/api/admin/badges/").status_code, 403)

    def test_only_the_admin_manages_users_even_for_staff_with_every_permission(self):
        self.staff(*ALL)
        self.assertEqual(self.client.get("/api/admin/team/").status_code, 403)
        self.client.force_login(self.admin)
        team = self.client.get("/api/admin/team/").json()
        self.assertEqual({m["role"] for m in team["members"]}, {"admin", "staff"})
        self.assertIn("seller", [t["key"] for t in team["templates"]])
        neda = User.objects.get(username="neda")
        res = self.client.patch(f"/api/admin/team/{neda.pk}/", {"perms": ["expenses.delete", "made.up"]}, content_type="application/json")
        self.assertEqual(res.json()["perms"], ["expenses.delete", "expenses.view"])

    def test_disabled_staff_lose_every_permission(self):
        user = self.staff(*ALL)
        user.is_active = False
        user.save()
        self.client.force_login(self.admin)
        self.client.logout()
        self.client.force_login(user)
        self.assertEqual(self.client.get("/api/admin/variants/").status_code, 403)


class TillAccessTests(AccessFixture):
    def sell(self, discount=0):
        return self.client.post("/api/admin/pos/sales/", {"lines": [{"variant": self.v.pk, "qty": 1}], "discount": discount, "cash": 1_000_000 - discount}, content_type="application/json")

    def test_discount_needs_its_own_permission_and_the_limit_needs_another(self):
        StoreSettings.objects.update(seller_max_discount=10)
        self.staff("pos.sell")
        self.assertEqual(self.client.get("/api/admin/pos/lookup/").json()["max_discount"], 0)
        self.assertEqual(self.sell(discount=50_000).status_code, 409)
        self.staff("pos.sell", "pos.discount", username="sara")
        self.assertEqual(self.sell(discount=200_000).status_code, 409)
        self.assertEqual(self.sell(discount=100_000).status_code, 201)
        self.staff("pos.sell", "pos.discount_any", username="mina")
        self.assertIsNone(self.client.get("/api/admin/pos/lookup/").json()["max_discount"])
        self.assertEqual(self.sell(discount=500_000).status_code, 201)

    def test_closing_only_the_till_cannot_sell(self):
        self.staff("pos.close")
        self.assertEqual(self.client.get("/api/admin/pos/close/").status_code, 200)
        self.assertEqual(self.sell().status_code, 403)
        self.assertEqual(self.client.get("/api/admin/pos/close/", {"date": "2020-01-01"}).status_code, 403)

    def test_voiding_and_seeing_everyone_are_given_separately(self):
        seller = self.staff("pos.sell")
        sale = self.sell().json()
        self.assertEqual(self.client.post(f"/api/admin/pos/sales/{sale['id']}/void/").status_code, 403)
        self.staff("pos.void", "pos.all_sales", username="manager")
        self.assertEqual(self.client.get("/api/admin/pos/sales/").json()["totals"]["count"], 1)
        res = self.client.post(f"/api/admin/pos/sales/{sale['id']}/void/", {"reason": "اشتباه"}, content_type="application/json")
        self.assertEqual(res.json()["status"], "voided")
        self.staff("pos.void", username="shift")
        self.assertEqual(self.client.post(f"/api/admin/pos/sales/{sale['id']}/void/").status_code, 404)
        self.assertEqual(Sale.objects.get().seller, seller)
