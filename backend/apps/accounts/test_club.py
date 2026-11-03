from datetime import date, timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.catalog.models import Category, Color, Product, Size, SizeSystem, Variant
from apps.core.jalali import to_gregorian
from apps.core.models import StoreSettings
from apps.inventory.models import StockMovement
from apps.inventory.services import move_stock
from apps.orders.models import DiscountCode, Order, ShippingMethod
from apps.orders.services import change_status

from .club import birthday_near
from .models import BirthdayUse, Customer

User = get_user_model()
TODAY = date(2026, 11, 3)  # 1405/08/12


class BirthdayWindowTests(TestCase):
    def test_three_days_either_side_of_the_persian_birthday(self):
        born = to_gregorian(1370, 8, 14)
        self.assertEqual(birthday_near(born, TODAY), (to_gregorian(1405, 8, 14), 1405))
        self.assertIsNone(birthday_near(to_gregorian(1370, 8, 16), TODAY))
        self.assertIsNotNone(birthday_near(to_gregorian(1370, 8, 9), TODAY))

    def test_window_crosses_the_new_year_and_esfand_30(self):
        new_year_eve = date(2027, 3, 19)  # 1405/12/28
        self.assertEqual(birthday_near(to_gregorian(1380, 1, 1), new_year_eve)[1], 1406)
        # Born on Esfand 30 of a leap year: in 1405, which has no Esfand 30, the birthday is Esfand 29.
        self.assertEqual(birthday_near(to_gregorian(1399, 12, 30), new_year_eve)[0], to_gregorian(1405, 12, 29))


class ClubFixture(TestCase):
    def setUp(self):
        today = mock.patch("django.utils.timezone.localdate", return_value=TODAY)
        today.start()
        self.addCleanup(today.stop)
        sizes = SizeSystem.objects.create(name="حروفی")
        cat = Category.objects.create(name="مانتو", size_system=sizes)
        coat = Product.objects.create(category=cat, name="مانتو کتان", price=1_000_000)
        self.v = Variant.objects.create(product=coat, color=Color.objects.create(name="مشکی", hex="#111111"), size=Size.objects.create(system=sizes, label="M"))
        move_stock(self.v, 10, StockMovement.Reason.RECEIVE)
        store = StoreSettings.load()
        store.birthday_discount_enabled, store.birthday_discount_percent, store.birthday_discount_max = True, 10, 80_000
        store.save()
        self.ship = ShippingMethod.objects.create(name="پست", fee=50_000)
        self.customer = User.objects.create_user("09121234567")
        Customer.objects.create(phone="09121234567", birthday=to_gregorian(1370, 8, 13))
        self.admin = User.objects.create_user("admin", password="x", is_staff=True)

    def order(self, **extra):
        self.client.force_login(self.customer)
        body = {"lines": [{"variant": self.v.pk, "qty": 1}], "receiver_name": "مریم", "city": "دزفول", "address": "خیابان شریعتی پلاک ۱", "shipping_method": self.ship.pk, **extra}
        return self.client.post("/api/orders/", body, content_type="application/json")

    def ticket(self, user=None, **extra):
        self.client.force_login(user or self.admin)
        body = {"lines": [{"variant": self.v.pk, "qty": 1}], "customer_phone": "09121234567", **extra}
        body.setdefault("cash", 1_000_000 - body.get("discount", 0))
        return self.client.post("/api/admin/pos/sales/", body, content_type="application/json")


class BirthdayDiscountTests(ClubFixture):
    def test_online_birthday_discount_once_a_year_with_its_cap(self):
        quote = self.client.post("/api/checkout/quote/", {"lines": [{"variant": self.v.pk, "qty": 1}]}, content_type="application/json")
        self.assertEqual(quote.json()["discount"], 0)  # not signed in
        self.client.force_login(self.customer)
        quote = self.client.post("/api/checkout/quote/", {"lines": [{"variant": self.v.pk, "qty": 1}]}, content_type="application/json").json()
        self.assertEqual((quote["discount"], quote["discount_kind"]), (80_000, "birthday"))
        res = self.order()
        self.assertEqual(res.status_code, 201, res.content)
        order = Order.objects.get()
        self.assertEqual((order.discount_amount, order.birthday_discount, order.total), (80_000, True, 970_000))
        self.order()
        self.assertEqual(Order.objects.latest("id").discount_amount, 0)

    def test_cancelling_the_order_gives_the_birthday_discount_back(self):
        self.order()
        change_status(Order.objects.get(), Order.Status.CANCELLED)
        self.assertFalse(BirthdayUse.objects.exists())

    def test_the_larger_of_code_and_birthday_applies(self):
        DiscountCode.objects.create(code="BIG", kind="percent", value=20)
        DiscountCode.objects.create(code="SMALL", kind="fixed", value=10_000)
        self.client.force_login(self.customer)
        q = self.client.post("/api/checkout/quote/", {"lines": [{"variant": self.v.pk, "qty": 1}], "discount_code": "SMALL"}, content_type="application/json").json()
        self.assertEqual((q["discount"], q["discount_kind"]), (80_000, "birthday"))
        self.order(discount_code="BIG")
        order = Order.objects.get()
        self.assertEqual((order.discount_amount, order.discount_code, order.birthday_discount), (200_000, "BIG", False))
        self.assertFalse(BirthdayUse.objects.exists())

    def test_till_birthday_discount_ignores_the_seller_limit_and_counts_as_this_years(self):
        from apps.accounts.roles import TEMPLATES, normalize
        from apps.accounts.models import StaffAccess

        seller = User.objects.create_user("sara", password="x")
        StaffAccess.objects.create(user=seller, perms=normalize(dict((k, p) for k, _, p in TEMPLATES)["seller"]))
        self.client.force_login(seller)
        info = self.client.get("/api/admin/pos/customer/", {"phone": "09121234567"}).json()
        self.assertEqual((info["birthday_offer"]["percent"], info["birthday_offer"]["used"]), (10, False))
        res = self.ticket(user=seller, birthday_discount=True, cash=920_000)
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual((res.json()["discount"], res.json()["birthday_discount"]), (80_000, True))
        self.assertEqual(self.ticket(birthday_discount=True, cash=920_000).status_code, 409)
        self.client.force_login(self.admin)
        self.client.post(f"/api/admin/pos/sales/{res.json()['id']}/void/", {"reason": "اشتباه"}, content_type="application/json")
        self.assertEqual(self.ticket(birthday_discount=True, cash=920_000).status_code, 201)

    def test_outside_the_week_there_is_no_birthday_discount(self):
        Customer.objects.filter(phone="09121234567").update(birthday=to_gregorian(1370, 2, 1))
        self.assertEqual(self.ticket(birthday_discount=True, cash=920_000).status_code, 409)
        self.client.force_login(self.customer)
        q = self.client.post("/api/checkout/quote/", {"lines": [{"variant": self.v.pk, "qty": 1}]}, content_type="application/json").json()
        self.assertEqual(q["discount"], 0)


class CustomerClubTests(ClubFixture):
    def test_shop_registers_a_customer_without_a_purchase_and_the_till_knows_them(self):
        self.client.force_login(self.admin)
        res = self.client.post("/api/admin/customers/", {"phone": "۰۹۱۳۰۰۰۰۰۰۰", "name": "نرگس", "birthday": "1990-05-01"}, content_type="application/json")
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(self.client.post("/api/admin/customers/", {"phone": "09130000000"}, content_type="application/json").status_code, 400)
        rows = self.client.get("/api/admin/customers/", {"kind": "none"}).json()["results"]
        self.assertIn("09130000000", [r["phone"] for r in rows])
        info = self.client.get("/api/admin/pos/customer/", {"phone": "09130000000"}).json()
        self.assertEqual((info["found"], info["name"]), (True, "نرگس"))

    def test_site_account_without_purchase_or_name_is_known_at_the_till(self):
        User.objects.create_user("09140000000")
        self.client.force_login(self.admin)
        info = self.client.get("/api/admin/pos/customer/", {"phone": "09140000000"}).json()
        self.assertEqual((info["found"], info["has_account"]), (True, True))

    def test_a_disabled_customer_cannot_buy_online_or_at_the_till(self):
        self.client.force_login(self.admin)
        self.client.patch("/api/admin/customers/09121234567/", {"is_active": False}, content_type="application/json")
        self.assertEqual(self.client.get("/api/admin/pos/customer/", {"phone": "09121234567"}).json()["active"], False)
        self.assertEqual(self.ticket().status_code, 409)
        self.assertEqual(self.order().status_code, 409)
        self.client.force_login(self.admin)
        self.assertEqual(self.client.get("/api/admin/customers/", {"kind": "blocked"}).json()["count"], 1)

    def test_blocking_and_editing_need_their_own_permissions(self):
        from apps.accounts.models import StaffAccess

        clerk = User.objects.create_user("clerk", password="x")
        StaffAccess.objects.create(user=clerk, perms=["customers.edit", "customers.view"])
        self.client.force_login(clerk)
        self.assertEqual(self.client.patch("/api/admin/customers/09121234567/", {"is_active": False}, content_type="application/json").status_code, 403)
        self.assertEqual(self.client.patch("/api/admin/customers/09121234567/", {"note": "سایز ۴۰"}, content_type="application/json").status_code, 200)
        self.assertEqual(self.client.post("/api/admin/customers/", {"phone": "09130000000"}, content_type="application/json").status_code, 403)

    def test_customer_sets_birthday_once_and_only_the_shop_changes_it(self):
        Customer.objects.filter(phone="09121234567").update(birthday=None)
        self.client.force_login(self.customer)
        res = self.client.patch("/api/auth/profile/", {"birthday": "1991-11-05"}, content_type="application/json")
        self.assertEqual(res.json()["birthday"], "1991-11-05")
        res = self.client.patch("/api/auth/profile/", {"birthday": "1992-01-01"}, content_type="application/json")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(self.client.patch("/api/auth/profile/", {"birthday": (TODAY + timedelta(days=5)).isoformat()}, content_type="application/json").status_code, 400)
        self.client.force_login(self.admin)
        self.client.patch("/api/admin/customers/09121234567/", {"birthday": "1992-01-01"}, content_type="application/json")
        self.assertEqual(Customer.objects.get(phone="09121234567").birthday, date(1992, 1, 1))

    def test_the_till_writes_down_a_missing_birthday_but_never_overwrites_one(self):
        self.ticket(customer_phone="09150000000", customer_birthday="1995-03-03", customer_name="لیلا")
        self.assertEqual(Customer.objects.get(phone="09150000000").birthday, date(1995, 3, 3))
        self.ticket(customer_phone="09150000000", customer_birthday="2000-01-01")
        self.assertEqual(Customer.objects.get(phone="09150000000").birthday, date(1995, 3, 3))
