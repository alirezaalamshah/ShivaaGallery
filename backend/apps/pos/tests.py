from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import StaffAccess
from apps.accounts.roles import TEMPLATES, normalize
from apps.catalog.models import Category, Color, Product, Size, SizeSystem, Variant
from apps.core.models import StoreSettings
from apps.inventory.models import StockMovement
from apps.inventory.services import move_stock

from .models import Sale, TillClose

User = get_user_model()
SELLER = normalize(dict((k, p) for k, _, p in TEMPLATES)["seller"])


def make_staff(user, perms=SELLER):
    StaffAccess.objects.create(user=user, perms=normalize(perms))
    return user


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
        make_staff(self.seller)

    def sell(self, user=None, **kw):
        self.client.force_login(user or self.seller)
        body = {"lines": [{"variant": self.m.pk, "qty": 2}, {"variant": self.l.pk, "qty": 1}], "cash": 2_800_000, **kw}
        return self.client.post("/api/admin/pos/sales/", body, content_type="application/json")


class SellerAccessTests(TillFixture):
    def test_seller_signs_in_with_password_and_is_told_their_role(self):
        res = self.client.post("/api/auth/login/", {"username": "sara", "password": "secret-1"}, content_type="application/json")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["role"], "staff")

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
        make_staff(seller)
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
        make_staff(other)
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
        res = self.client.post("/api/admin/team/", {"username": "neda", "password": "pass-123", "first_name": "ندا", "perms": SELLER}, content_type="application/json")
        self.assertEqual(res.status_code, 201, res.content)
        neda = User.objects.get(username="neda")
        self.assertEqual(res.json()["role"], "staff")
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


class ReturnAndExchangeTests(TillFixture):
    def first_sale(self, discount=0):
        res = self.sell(discount=discount, cash=2_800_000 - discount)
        self.assertEqual(res.status_code, 201, res.content)
        return Sale.objects.get(pk=res.json()["id"])

    def ticket(self, user=None, **body):
        self.client.force_login(user or self.seller)
        return self.client.post("/api/admin/pos/sales/", body, content_type="application/json")

    def test_exchange_takes_the_piece_back_at_what_was_paid_and_settles_the_difference(self):
        sale = self.first_sale(discount=280_000)  # 10% off: one M cost the customer 900,000
        m_line = sale.items.get(variant=self.m)
        move_stock(self.l, 1, StockMovement.Reason.RECEIVE)
        res = self.ticket(lines=[{"variant": self.l.pk, "qty": 1}], returns=[{"item": m_line.pk, "qty": 1}], cash=-100_000)
        self.assertEqual(res.status_code, 201, res.content)
        x = res.json()
        self.assertEqual((x["subtotal"], x["returned_total"], x["total"], x["cash"]), (800_000, 900_000, -100_000, -100_000))
        self.assertEqual(x["returns"][0]["from_sale"], sale.number)
        self.m.refresh_from_db()
        self.l.refresh_from_db()
        self.assertEqual((self.m.stock, self.l.stock), (2, 0))

    def test_cannot_take_back_more_than_was_sold(self):
        line = self.first_sale().items.get(variant=self.m)
        self.assertEqual(self.ticket(returns=[{"item": line.pk, "qty": 3}], cash=-3_000_000).status_code, 409)
        self.assertEqual(self.ticket(returns=[{"item": line.pk, "qty": 2}], cash=-2_000_000).status_code, 201)
        self.assertEqual(self.ticket(returns=[{"item": line.pk, "qty": 1}], cash=-1_000_000).status_code, 409)

    def test_refund_must_be_paid_out_not_in(self):
        line = self.first_sale().items.get(variant=self.m)
        res = self.ticket(returns=[{"item": line.pk, "qty": 1}], cash=1_000_000)
        self.assertEqual(res.status_code, 409)

    def test_seller_respects_the_return_window_and_exchange_only_policy_but_admin_does_not(self):
        sale = self.first_sale()
        line = sale.items.get(variant=self.m)
        Sale.objects.filter(pk=sale.pk).update(created_at=timezone.now() - timedelta(days=30))
        self.assertIn("مهلت", self.ticket(returns=[{"item": line.pk, "qty": 1}], cash=-1_000_000).json()["detail"])
        Sale.objects.filter(pk=sale.pk).update(created_at=timezone.now())
        store = StoreSettings.load()
        store.returns_type = StoreSettings.ReturnType.EXCHANGE
        store.save()
        self.assertIn("فقط تعویض", self.ticket(returns=[{"item": line.pk, "qty": 1}], card=-1_000_000).json()["detail"])
        self.assertEqual(self.ticket(user=self.admin, returns=[{"item": line.pk, "qty": 1}], card=-1_000_000).status_code, 201)

    def test_voiding_follows_returns(self):
        sale = self.first_sale()
        line = sale.items.get(variant=self.m)
        back = self.ticket(returns=[{"item": line.pk, "qty": 1}], cash=-1_000_000).json()
        self.client.force_login(self.admin)
        res = self.client.post(f"/api/admin/pos/sales/{sale.pk}/void/", {}, content_type="application/json")
        self.assertEqual(res.status_code, 409)
        self.assertEqual(self.client.post(f"/api/admin/pos/sales/{back['id']}/void/", {}, content_type="application/json").status_code, 200)
        self.m.refresh_from_db()
        self.assertEqual(self.m.stock, 1)  # the returned piece left stock again
        self.assertEqual(self.client.post(f"/api/admin/pos/sales/{sale.pk}/void/", {}, content_type="application/json").status_code, 200)

    def test_lookup_finds_tickets_by_number_or_phone_with_what_is_left(self):
        sale = self.first_sale()
        Sale.objects.filter(pk=sale.pk).update(customer_phone="09125550000")
        self.client.force_login(self.seller)
        rows = self.client.get("/api/admin/pos/returnable/?q=۰۹۱۲۵۵۵۰۰۰۰").json()
        self.assertEqual(rows[0]["number"], sale.number)
        self.assertEqual({i["returnable"] for i in rows[0]["items"]}, {2, 1})
        self.assertEqual(self.client.get(f"/api/admin/pos/returnable/?q={sale.number}").json()[0]["id"], sale.pk)

    def test_day_totals_count_money_handed_back(self):
        line = self.first_sale().items.get(variant=self.m)
        self.ticket(returns=[{"item": line.pk, "qty": 1}], cash=-1_000_000)
        t = self.client.get("/api/admin/pos/sales/").json()["totals"]
        self.assertEqual((t["cash"], t["returned"], t["pieces_returned"]), (1_800_000, 1_000_000, 1))


class CustomerLookupTests(TillFixture):
    def test_known_customer_is_recognised(self):
        self.sell(customer_phone="09125550000", customer_name="نرگس")
        self.client.force_login(self.seller)
        res = self.client.get("/api/admin/pos/customer/?phone=09125550000").json()
        self.assertEqual((res["found"], res["name"], res["purchases"]), (True, "نرگس", 1))
        self.assertFalse(self.client.get("/api/admin/pos/customer/?phone=09129999999").json()["found"])

    def test_an_order_placed_with_no_name_does_not_make_the_mobile_a_name(self):
        from apps.orders.models import Order

        phone = "09125550001"
        user = get_user_model().objects.create_user(phone)
        Order.objects.create(user=user, phone=phone, receiver_name=phone, city="دزفول", address="خیابان یک", shipping_fee=0, subtotal=1, total=1, status=Order.Status.PAID)
        self.client.force_login(self.seller)
        res = self.client.get(f"/api/admin/pos/customer/?phone={phone}").json()
        self.assertEqual((res["name"], res["purchases"]), ("", 1))


class TillCloseTests(TillFixture):
    def test_expected_cash_and_next_days_opening(self):
        from apps.finance.models import Expense

        self.sell()  # 2,800,000 cash
        Expense.objects.create(amount=300_000, from_till=True, category="other")
        Expense.objects.create(amount=5_000_000, from_till=False, category="rent")
        self.client.force_login(self.seller)
        drawer = self.client.get("/api/admin/pos/close/").json()["drawer"]
        self.assertEqual((drawer["opening_cash"], drawer["cash_sales"], drawer["cash_expenses"], drawer["expected_cash"]), (0, 2_800_000, 300_000, 2_500_000))
        res = self.client.post("/api/admin/pos/close/", {"counted_cash": 2_450_000, "left_in_drawer": 500_000}, content_type="application/json")
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.json()["difference"], -50_000)
        # Closing again the same day replaces the count.
        self.client.post("/api/admin/pos/close/", {"counted_cash": 2_500_000, "left_in_drawer": 500_000}, content_type="application/json")
        self.assertEqual(TillClose.objects.get().difference, 0)
        TillClose.objects.update(day=timezone.localdate() - timedelta(days=1))
        self.assertEqual(self.client.get("/api/admin/pos/close/").json()["drawer"]["opening_cash"], 500_000)

    def test_cannot_keep_more_than_was_counted(self):
        self.client.force_login(self.seller)
        res = self.client.post("/api/admin/pos/close/", {"counted_cash": 100, "left_in_drawer": 200}, content_type="application/json")
        self.assertEqual(res.status_code, 400)
