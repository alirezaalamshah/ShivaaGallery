from unittest import mock

from django.test import override_settings

from apps.orders.models import Order
from apps.orders.services import change_status, place_order
from apps.orders.tests import OrderFixture

from .models import Payment


@override_settings(PAYMENT_GATEWAY="fake", SITE_URL="http://shop.test")
class FakeGatewayTests(OrderFixture):
    def setUp(self):
        super().setUp()
        self.client.force_login(self.user)
        with mock.patch("apps.orders.services.send_sms") as sms:
            self.order = place_order(self.user, self.data())
        sms.assert_not_called()  # with online payment, nobody is told until it is paid

    def start(self):
        res = self.client.post("/api/payments/start/", {"number": self.order.number}, content_type="application/json")
        self.assertEqual(res.status_code, 200, res.content)
        return Payment.objects.latest("pk")

    def back(self, payment, status):
        return self.client.get(f"/api/payments/callback/{payment.pk}/", {"Authority": payment.authority, "Status": status})

    def test_successful_payment_marks_the_order_paid_and_notifies(self):
        payment = self.start()
        self.assertEqual(payment.amount, 17_000_000)  # 1.7M toman in rial
        with mock.patch("apps.orders.services.send_sms") as sms, self.captureOnCommitCallbacks(execute=True):
            res = self.back(payment, "OK")
        self.assertEqual(res["Location"], f"http://shop.test/account/orders/{self.order.number}?payment=ok")
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, "paid")
        self.assertIsNotNone(self.order.paid_at)
        sms.assert_called_once_with("09121234567", "order_placed", self.order.number, "1,700,000")
        # Coming back to the same callback again changes nothing.
        self.assertIn("payment=ok", self.back(payment, "OK")["Location"])

    def test_cancelled_payment_leaves_the_order_waiting(self):
        res = self.back(self.start(), "NOK")
        self.assertIn("payment=failed", res["Location"])
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, "awaiting_payment")

    def test_payment_for_an_expired_order_is_not_verified(self):
        payment = self.start()
        change_status(self.order, Order.Status.CANCELLED)
        with mock.patch("apps.payments.gateways.FakeGateway.verify") as verify:
            res = self.back(payment, "OK")
        verify.assert_not_called()  # unverified, so the bank returns the money
        self.assertIn("payment=late", res["Location"])

    def test_order_page_offers_payment(self):
        self.assertTrue(self.client.get(f"/api/orders/{self.order.number}/").json()["can_pay"])
