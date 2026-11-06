from datetime import timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.utils import timezone

from apps.core.models import StoreSettings

from .models import Order, OrderEvent, ReturnRequest
from .services import change_return_status, change_status, place_order
from .tests import OrderFixture

User = get_user_model()


class ReturnTests(OrderFixture):
    def setUp(self):
        super().setUp()
        StoreSettings.objects.update_or_create(pk=1, defaults={"name": "شیوا", "returns_days": 7})
        with mock.patch("apps.orders.services.send_sms"):
            self.order = place_order(self.user, self.data())
            for st in ("paid", "shipped", "delivered"):
                change_status(self.order, st)
        self.item = self.order.items.get()
        self.client.force_login(self.user)

    def ask(self, **kw):
        body = {"items": [{"item": self.item.pk, "qty": 1}], "reason": "size", "wants": "exchange", **kw}
        return self.client.post(f"/api/orders/{self.order.number}/return/", body, content_type="application/json")

    def test_customer_asks_within_the_window(self):
        self.assertTrue(self.client.get(f"/api/orders/{self.order.number}/").json()["return_window"]["can"])
        res = self.ask()
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(res.json()["returns"][0]["status"], "pending")
        self.assertEqual(self.ask().status_code, 409)  # one open request per order

    def test_each_status_sends_a_word_that_fits_the_pattern(self):
        with mock.patch.object(StoreSettings, "notify_phones", return_value=["09355958047"]):
            with mock.patch("apps.orders.services.send_sms") as sms, self.captureOnCommitCallbacks(execute=True):
                self.ask()
        sms.assert_called_once_with("09355958047", "return_status", self.order.number, "در انتظار بررسی")
        req = ReturnRequest.objects.get(order=self.order)
        with mock.patch("apps.orders.services.send_sms") as sms, self.captureOnCommitCallbacks(execute=True):
            change_return_status(req, "rejected")
        sms.assert_called_once_with(self.order.phone, "return_status", self.order.number, "ردشده")

    def test_window_closes_after_the_return_days(self):
        OrderEvent.objects.filter(order=self.order, status="delivered").update(created_at=timezone.now() - timedelta(days=8))
        self.assertEqual(self.ask().status_code, 409)

    def test_not_before_the_order_arrives(self):
        with mock.patch("apps.orders.services.send_sms"):
            fresh = place_order(self.user, self.data(lines=[{"variant": self.v.pk, "qty": 1}]))
        res = self.client.post(f"/api/orders/{fresh.number}/return/", {"items": [{"item": fresh.items.get().pk, "qty": 1}], "reason": "size", "wants": "refund"}, content_type="application/json")
        self.assertEqual(res.status_code, 409)

    def test_cannot_return_more_than_bought(self):
        self.assertEqual(self.ask(items=[{"item": self.item.pk, "qty": 3}]).status_code, 409)

    def test_completing_puts_pieces_back_in_stock(self):
        self.ask()
        req = ReturnRequest.objects.get()
        self.client.force_login(User.objects.create_user("admin", is_staff=True))
        url = f"/api/admin/returns/{req.pk}/update_status/"
        self.assertEqual(self.client.post(url, {"status": "completed"}, content_type="application/json").status_code, 409)
        with mock.patch("apps.orders.services.send_sms"):
            self.client.post(url, {"status": "approved", "admin_note": "با پست بفرستید"}, content_type="application/json")
            res = self.client.post(url, {"status": "completed"}, content_type="application/json")
        self.assertEqual(res.json()["status"], "completed")
        self.v.refresh_from_db()
        self.assertEqual(self.v.stock, 2)


class OrderExportTests(OrderFixture):
    def test_date_filter_and_csv_export(self):
        with mock.patch("apps.orders.services.send_sms"):
            old = place_order(self.user, self.data(lines=[{"variant": self.v.pk, "qty": 1}]))
            new = place_order(self.user, self.data(lines=[{"variant": self.v.pk, "qty": 1}]))
        Order.objects.filter(pk=old.pk).update(created_at=timezone.now() - timedelta(days=10))
        self.client.force_login(User.objects.create_user("admin", is_staff=True))
        since = (timezone.localdate() - timedelta(days=2)).isoformat()
        listed = self.client.get("/api/admin/orders/", {"from": since}).json()["results"]
        self.assertEqual([o["number"] for o in listed], [new.number])
        res = self.client.get("/api/admin/orders/export/", {"from": since})
        self.assertEqual(res["Content-Type"], "text/csv; charset=utf-8")
        text = res.content.decode("utf-8")
        self.assertTrue(text.startswith("﻿"))
        self.assertIn(new.number, text)
        self.assertNotIn(old.number, text)
