from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.accounts.roles import seller_group
from apps.catalog.models import Category, Color, Product, Size, SizeSystem, Variant
from apps.core.models import StoreSettings
from apps.inventory.models import StockMovement
from apps.inventory.services import move_stock

from .models import Sale

User = get_user_model()


class TillFixture(TestCase):
    def setUp(self):
        sizes = SizeSystem.objects.create(name="حروفی")
        cat = Category.objects.create(name="مانتو", size_system=sizes)
        self.coat = Product.objects.create(category=cat, name="مانتو کتان", price=1_000_000)
        black = Color.objects.create(name="مشکی", hex="#111111")
        self.m = Variant.objects.create(product=self.coat, color=black, size=Size.objects.create(system=sizes, label="M"))
        self.l = Variant.objects.create(product=self.coat, color=black, size=Size.objects.create(system=sizes, label="L"), sale_price=800_000)
        move_stock(self.m, 3, StockMovement.Reason.RECEIVE)
        move_stock(self.l, 1, StockMovement.Reason.RECEIVE)
        self.admin = User.objects.create_user("admin", password="secret-1", is_staff=True)
        self.seller = User.objects.create_user("sara", password="secret-1", first_name="سارا")
        self.seller.groups.add(seller_group())

    def sell(self, user=None, **kw):
        self.client.force_login(user or self.seller)
        body = {"lines": [{"variant": self.m.pk, "qty": 2}, {"variant": self.l.pk, "qty": 1}], "cash": 2_800_000, **kw}
        return self.client.post("/api/admin/pos/sales/", body, content_type="application/json")


class SellerAccessTests(TillFixture):
    def test_seller_signs_in_with_password_and_is_told_their_role(self):
        res = self.client.post("/api/auth/login/", {"username": "sara", "password": "secret-1"}, content_type="application/json")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["role"], "seller")

    def test_seller_cannot_reach_the_rest_of_the_panel(self):
        self.client.force_login(self.seller)
        for path in ("/api/admin/dashboard/", "/api/admin/orders/", "/api/admin/products/", "/api/admin/team/", "/api/admin/variants/"):
            self.assertEqual(self.client.get(path).status_code, 403, path)
        self.assertEqual(self.client.get("/api/admin/pos/lookup/").status_code, 200)

    def test_customer_cannot_use_the_till(self):
        self.client.force_login(User.objects.create_user("09121234567"))
        self.assertEqual(self.client.get("/api/admin/pos/lookup/").status_code, 403)

    def test_seller_phone_number_cannot_sign_in_with_sms_code(self):
        from apps.accounts.otp import OtpError, request_code, verify_code

        seller = User.objects.create_user("09125550000", password="x")
        seller.groups.add(seller_group())
        _, code = request_code("09125550000")
        with self.assertRaises(OtpError):
            verify_code("09125550000", code)

    def test_disabled_seller_is_locked_out(self):
        self.seller.is_active = False
        self.seller.save()
        res = self.client.post("/api/auth/login/", {"username": "sara", "password": "secret-1"}, content_type="application/json")
        self.assertEqual(res.status_code, 400)


class SaleTests(TillFixture):
    def test_sale_takes_pieces_out_of_shared_stock_at_todays_price(self):
        res = self.sell()
        self.assertEqual(res.status_code, 201, res.content)
        data = res.json()
        self.assertEqual((data["subtotal"], data["total"]), (2_800_000, 2_800_000))
        self.m.refresh_from_db()
        self.l.refresh_from_db()
        self.assertEqual((self.m.stock, self.l.stock), (1, 0))
        moves = StockMovement.objects.filter(reference=data["number"])
        self.assertEqual({m.reason for m in moves}, {"store_sale"})
        self.assertEqual(moves.first().created_by, self.seller)

    def test_payments_must_add_up_to_the_total(self):
        res = self.sell(cash=1_000_000, card=1_000_000)
        self.assertEqual(res.status_code, 409)
        self.assertEqual(self.sell(cash=1_000_000, card=1_000_000, transfer=800_000).status_code, 201)

    def test_not_enough_stock_sells_nothing(self):
        res = self.sell(lines=[{"variant": self.m.pk, "qty": 1}, {"variant": self.l.pk, "qty": 2}], cash=2_600_000)
        self.assertEqual(res.status_code, 409)
        self.assertEqual(res.json()["lines"], [{"variant": self.l.pk, "available": 1}])
        self.m.refresh_from_db()
        self.assertEqual(self.m.stock, 3)
        self.assertFalse(Sale.objects.exists())

    def test_seller_discount_is_capped_but_admin_is_not(self):
        StoreSettings.objects.update_or_create(pk=1, defaults={"name": "شیوا", "seller_max_discount": 10})
        self.assertEqual(self.sell(discount=500_000, cash=2_300_000).status_code, 409)
        self.assertEqual(self.sell(discount=280_000, cash=2_520_000).status_code, 201)
        res = self.sell(user=self.admin, lines=[{"variant": self.m.pk, "qty": 1}], discount=500_000, cash=500_000)
        self.assertEqual(res.status_code, 201)

    def test_same_checkout_sent_twice_is_recorded_once(self):
        self.sell(client_key="abc")
        self.sell(client_key="abc")
        self.assertEqual(Sale.objects.count(), 1)

    def test_seller_sees_only_own_sales_and_day_totals(self):
        self.sell(cash=1_000_000, card=1_800_000)
        other = User.objects.create_user("ali", password="x")
        other.groups.add(seller_group())
        self.client.force_login(other)
        self.assertEqual(self.client.get("/api/admin/pos/sales/").json()["totals"]["count"], 0)
        self.client.force_login(self.admin)
        totals = self.client.get("/api/admin/pos/sales/").json()["totals"]
        self.assertEqual((totals["total"], totals["cash"], totals["card"], totals["pieces"]), (2_800_000, 1_000_000, 1_800_000, 3))

    def test_only_admin_voids_and_pieces_come_back(self):
        sale_id = self.sell().json()["id"]
        self.assertEqual(self.client.post(f"/api/admin/pos/sales/{sale_id}/void/").status_code, 403)
        self.client.force_login(self.admin)
        res = self.client.post(f"/api/admin/pos/sales/{sale_id}/void/", {"reason": "اشتباه"}, content_type="application/json")
        self.assertEqual(res.json()["status"], "voided")
        self.m.refresh_from_db()
        self.assertEqual(self.m.stock, 3)
        self.assertEqual(self.client.post(f"/api/admin/pos/sales/{sale_id}/void/").status_code, 409)

    def test_lookup_finds_by_name_with_arabic_letters_and_by_exact_code(self):
        self.client.force_login(self.seller)
        res = self.client.get("/api/admin/pos/lookup/", {"q": "كتان"}).json()
        self.assertEqual([p["id"] for p in res["products"]], [self.coat.pk])
        res = self.client.get("/api/admin/pos/lookup/", {"q": self.l.sku.lower()}).json()
        self.assertEqual(res["exact"], self.l.pk)


class TeamTests(TillFixture):
    def test_admin_creates_edits_and_disables_a_seller(self):
        self.client.force_login(self.admin)
        res = self.client.post("/api/admin/team/", {"username": "neda", "password": "pass-123", "first_name": "ندا"}, content_type="application/json")
        self.assertEqual(res.status_code, 201, res.content)
        neda = User.objects.get(username="neda")
        self.assertEqual(res.json()["role"], "seller")
        self.assertFalse(neda.is_staff)
        self.client.patch(f"/api/admin/team/{neda.pk}/", {"is_active": False, "password": "new-pass"}, content_type="application/json")
        neda.refresh_from_db()
        self.assertFalse(neda.is_active)
        self.assertTrue(neda.check_password("new-pass"))

    def test_admin_accounts_are_not_editable_here(self):
        self.client.force_login(self.admin)
        res = self.client.patch(f"/api/admin/team/{self.admin.pk}/", {"is_active": False}, content_type="application/json")
        self.assertEqual(res.status_code, 403)

    def test_username_must_be_free(self):
        self.client.force_login(self.admin)
        res = self.client.post("/api/admin/team/", {"username": "SARA", "password": "pass-123"}, content_type="application/json")
        self.assertEqual(res.status_code, 400)
