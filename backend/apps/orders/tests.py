from datetime import timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase

from apps.catalog.models import Category, Color, Product, Size, SizeSystem, Variant
from apps.inventory.models import StockMovement
from apps.inventory.services import move_stock

from .models import DiscountCode, Order, ShippingMethod
from .services import CheckoutError, change_status, expire_unpaid, place_order

User = get_user_model()


class OrderFixture(TestCase):
    def setUp(self):
        cache.clear()
        sizes = SizeSystem.objects.create(name="حروفی")
        cat = Category.objects.create(name="مانتو", size_system=sizes)
        self.coat = Product.objects.create(category=cat, name="مانتو", price=1_000_000)
        self.v = Variant.objects.create(product=self.coat, color=Color.objects.create(name="مشکی", hex="#111111"), size=Size.objects.create(system=sizes, label="M"), sale_price=800_000)
        move_stock(self.v, 3, StockMovement.Reason.RECEIVE)
        self.post = ShippingMethod.objects.create(name="پست", fee=100_000)
        self.peyk = ShippingMethod.objects.create(name="پیک", fee=50_000, only_city="دزفول")
        self.user = User.objects.create_user("09121234567")

    def data(self, **kw):
        return {"lines": [{"variant": self.v.pk, "qty": 2}], "receiver_name": "مریم", "city": "اهواز",
                "address": "خیابان یک، پلاک ده", "shipping_method": self.post.pk, **kw}


class PlaceOrderTests(OrderFixture):
    def test_prices_are_computed_on_the_server_and_stock_is_reserved(self):
        with mock.patch("apps.orders.services.send_sms"):
            order = place_order(self.user, self.data())
        self.assertEqual((order.subtotal, order.shipping_fee, order.total), (1_600_000, 100_000, 1_700_000))
        self.v.refresh_from_db()
        self.assertEqual(self.v.stock, 1)
        self.assertEqual(StockMovement.objects.filter(reference=order.number).get().delta, -2)
        self.assertEqual(order.items.get().product_name, "مانتو")
        self.assertEqual(order.events.get().status, "awaiting_payment")

    def test_every_staff_number_hears_of_a_new_order(self):
        from apps.core.models import StoreSettings

        store = StoreSettings.load()
        store.order_notify_phone = "09166446200, 09355958047"
        store.save()
        with mock.patch("apps.orders.services.send_sms") as sms, self.captureOnCommitCallbacks(execute=True):
            order = place_order(self.user, self.data())
        staff = [c.args[0] for c in sms.call_args_list if c.args[1] == "admin_order"]
        self.assertEqual(staff, ["09166446200", "09355958047"])
        sms.assert_any_call("09121234567", "order_placed", order.number, "1,700,000")

    def test_insufficient_stock_rolls_everything_back(self):
        with self.assertRaises(CheckoutError) as ctx:
            place_order(self.user, self.data(lines=[{"variant": self.v.pk, "qty": 5}]))
        self.assertEqual(ctx.exception.lines, [{"variant": self.v.pk, "available": 3}])
        self.assertFalse(Order.objects.exists())
        self.v.refresh_from_db()
        self.assertEqual(self.v.stock, 3)

    def test_city_only_shipping_method(self):
        with self.assertRaises(CheckoutError):
            place_order(self.user, self.data(shipping_method=self.peyk.pk))
        order = place_order(self.user, self.data(shipping_method=self.peyk.pk, city="دزفول"))
        self.assertEqual(order.shipping_fee, 50_000)

    def test_discount_code_is_applied_and_counted(self):
        DiscountCode.objects.create(code="OFF10", value=10, max_amount=100_000)
        order = place_order(self.user, self.data(discount_code="off10"))
        self.assertEqual(order.discount_amount, 100_000)  # 10% of 1.6M capped at 100k
        self.assertEqual(DiscountCode.objects.get().used_count, 1)

    def test_used_up_discount_is_rejected(self):
        DiscountCode.objects.create(code="ONCE", value=10, max_uses=1)
        place_order(self.user, self.data(discount_code="ONCE", lines=[{"variant": self.v.pk, "qty": 1}]))
        with self.assertRaisesMessage(CheckoutError, "ظرفیت"):
            place_order(self.user, self.data(discount_code="ONCE", lines=[{"variant": self.v.pk, "qty": 1}]))

    def test_cancelling_returns_stock_and_rejects_bad_transitions(self):
        order = place_order(self.user, self.data())
        with self.assertRaises(CheckoutError):
            change_status(order, "delivered")
        change_status(order, "cancelled")
        self.v.refresh_from_db()
        self.assertEqual(self.v.stock, 3)
        self.assertEqual(list(order.events.values_list("status", flat=True)), ["awaiting_payment", "cancelled"])


class OrderApiTests(OrderFixture):
    def test_checkout_requires_login(self):
        res = self.client.post("/api/orders/", self.data(), content_type="application/json")
        self.assertEqual(res.status_code, 403)

    def test_checkout_saves_address_and_lists_my_orders(self):
        self.client.force_login(self.user)
        res = self.client.post("/api/orders/", self.data(postal_code="۱۲۳۴۵۶۷۸۹۰"), content_type="application/json")
        self.assertEqual(res.status_code, 201, res.content)
        number = res.json()["number"]
        self.assertEqual(self.user.addresses.get().postal_code, "1234567890")
        mine = self.client.get("/api/orders/").json()
        self.assertEqual([o["number"] for o in mine], [number])
        self.assertEqual(mine[0]["item_count"], 1)
        self.assertEqual(self.client.get(f"/api/orders/{number}/").json()["total"], 1_700_000)

    def test_stock_conflict_returns_409_with_lines(self):
        self.client.force_login(self.user)
        res = self.client.post("/api/orders/", self.data(lines=[{"variant": self.v.pk, "qty": 9}]), content_type="application/json")
        self.assertEqual(res.status_code, 409)
        self.assertEqual(res.json()["lines"][0]["available"], 3)

    def test_other_customers_orders_are_hidden(self):
        order = place_order(self.user, self.data())
        self.client.force_login(User.objects.create_user("09120000000"))
        self.assertEqual(self.client.get(f"/api/orders/{order.number}/").status_code, 404)

    def test_public_tracking_hides_street_address(self):
        order = place_order(self.user, self.data())
        res = self.client.post("/api/orders/track/", {"number": order.number, "phone": "09121234567"}, content_type="application/json")
        self.assertEqual(res.json()["status_label"], "در انتظار پرداخت")
        self.assertNotIn("address", res.json())
        wrong = self.client.post("/api/orders/track/", {"number": order.number, "phone": "09120000000"}, content_type="application/json")
        self.assertEqual(wrong.status_code, 404)

    def test_quote_and_cart_validate(self):
        q = self.client.post("/api/checkout/quote/", {"lines": [{"variant": self.v.pk, "qty": 1}], "city": "دزفول", "shipping_method": self.peyk.pk, "discount_code": "NOPE"}, content_type="application/json").json()
        self.assertEqual((q["subtotal"], q["shipping_fee"], q["total"]), (800_000, 50_000, 850_000))
        self.assertTrue(q["discount_error"])
        lines = self.client.post("/api/cart/validate/", {"lines": [{"variant": self.v.pk, "qty": 4}]}, content_type="application/json").json()["lines"]
        self.assertEqual((lines[0]["available"], lines[0]["ok"], lines[0]["unit_price"]), (3, False, 800_000))


class OrderLifecycleTests(OrderFixture):
    def test_cancelling_gives_the_discount_code_its_use_back(self):
        DiscountCode.objects.create(code="ONCE", value=10, max_uses=1)
        order = place_order(self.user, self.data(discount_code="ONCE", lines=[{"variant": self.v.pk, "qty": 1}]))
        change_status(order, "cancelled")
        self.assertEqual(DiscountCode.objects.get().used_count, 0)

    def test_code_is_once_per_customer(self):
        DiscountCode.objects.create(code="HELLO", value=10)
        place_order(self.user, self.data(discount_code="HELLO", lines=[{"variant": self.v.pk, "qty": 1}]))
        with self.assertRaisesMessage(CheckoutError, "قبلاً"):
            place_order(self.user, self.data(discount_code="HELLO", lines=[{"variant": self.v.pk, "qty": 1}]))
        other = User.objects.create_user("09120000000")
        self.assertEqual(place_order(other, self.data(discount_code="HELLO", lines=[{"variant": self.v.pk, "qty": 1}])).discount_code, "HELLO")

    def test_same_client_key_returns_the_first_order(self):
        first = place_order(self.user, self.data(client_key="abc"))
        again = place_order(self.user, self.data(client_key="abc"))
        self.assertEqual(first.pk, again.pk)
        self.v.refresh_from_db()
        self.assertEqual(self.v.stock, 1)

    def test_unpaid_orders_expire_and_free_their_stock(self):
        order = place_order(self.user, self.data())
        self.assertIsNotNone(order.payment_deadline)  # 24 hours by default
        self.assertEqual(expire_unpaid(), 0)
        self.assertEqual(expire_unpaid(now=order.payment_deadline + timedelta(minutes=1)), 1)
        order.refresh_from_db()
        self.v.refresh_from_db()
        self.assertEqual((order.status, self.v.stock), ("cancelled", 3))

    def test_paid_orders_never_expire(self):
        order = place_order(self.user, self.data())
        change_status(order, "paid")
        self.assertEqual(expire_unpaid(now=order.payment_deadline + timedelta(days=1)), 0)

    def test_postal_code_required_when_the_method_needs_it(self):
        self.post.needs_postal_code = True
        self.post.save()
        with self.assertRaises(CheckoutError) as ctx:
            place_order(self.user, self.data())
        self.assertEqual(ctx.exception.field, "postal_code")
        self.assertTrue(place_order(self.user, self.data(postal_code="1234567890")).number)

    def test_shipped_sms_carries_the_tracking_code(self):
        order = place_order(self.user, self.data())
        change_status(order, "paid")
        with mock.patch("apps.orders.services.send_sms") as sms, self.captureOnCommitCallbacks(execute=True):
            change_status(order, "shipped", tracking_code="TP123")
        sms.assert_called_once_with("09121234567", "order_shipped", order.number, "پست", "TP123")

    def test_customer_can_cancel_only_unpaid_orders(self):
        order = place_order(self.user, self.data())
        self.client.force_login(self.user)
        res = self.client.post(f"/api/orders/{order.number}/cancel/", content_type="application/json")
        self.assertEqual(res.json()["status"], "cancelled")
        paid = place_order(self.user, self.data(lines=[{"variant": self.v.pk, "qty": 1}]))
        change_status(paid, "paid")
        self.assertEqual(self.client.post(f"/api/orders/{paid.number}/cancel/", content_type="application/json").status_code, 409)
