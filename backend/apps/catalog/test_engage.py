from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.inventory.models import StockMovement
from apps.inventory.services import move_stock
from apps.orders.models import Order, OrderItem

from .models import Category, Color, Product, Review, Size, SizeSystem, StockAlert, Variant

User = get_user_model()


class EngageFixture(TestCase):
    def setUp(self):
        sizes = SizeSystem.objects.create(name="حروفی")
        cat = Category.objects.create(name="مانتو", size_system=sizes)
        self.coat = Product.objects.create(category=cat, name="مانتو", price=1_000_000)
        self.v = Variant.objects.create(product=self.coat, color=Color.objects.create(name="مشکی", hex="#111111"), size=Size.objects.create(system=sizes, label="M"))
        self.user = User.objects.create_user("09121234567")

    def deliver(self, user):
        order = Order.objects.create(user=user, phone=user.username, receiver_name="مریم", city="دزفول", address="خیابان یک",
                                     shipping_name="پیک", shipping_fee=0, subtotal=1_000_000, total=1_000_000, status="delivered")
        OrderItem.objects.create(order=order, variant=self.v, product_slug=self.coat.slug, product_name="مانتو", color_name="مشکی",
                                 size_label="M", sku=self.v.sku, unit_price=1_000_000, qty=1)
        return order


class FavoriteTests(EngageFixture):
    def test_add_list_and_remove(self):
        self.client.force_login(self.user)
        self.assertEqual(self.client.post("/api/favorites/", {"product": self.coat.pk}, content_type="application/json").status_code, 201)
        self.client.post("/api/favorites/", {"product": self.coat.pk}, content_type="application/json")
        self.assertEqual(self.client.get("/api/favorites/", {"ids": "1"}).json(), [self.coat.pk])
        self.assertEqual([p["slug"] for p in self.client.get("/api/favorites/").json()], [self.coat.slug])
        self.client.delete(f"/api/favorites/{self.coat.pk}/")
        self.assertEqual(self.client.get("/api/favorites/", {"ids": "1"}).json(), [])

    def test_guests_must_sign_in(self):
        self.assertEqual(self.client.get("/api/favorites/").status_code, 403)


class StockAlertTests(EngageFixture):
    def test_guest_asks_and_gets_one_sms_when_stock_arrives(self):
        res = self.client.post("/api/stock-alerts/", {"variant": self.v.pk, "phone": "۰۹۱۲۷۷۷۸۸۸۸"}, content_type="application/json")
        self.assertEqual(res.status_code, 201)
        with mock.patch("apps.catalog.alerts.send_sms") as sms, self.captureOnCommitCallbacks(execute=True):
            move_stock(self.v, 2, StockMovement.Reason.RECEIVE)
        sms.assert_called_once()
        self.assertEqual(sms.call_args.args[:2], ("09127778888", "back_in_stock"))
        self.assertIsNotNone(StockAlert.objects.get().notified_at)
        with mock.patch("apps.catalog.alerts.send_sms") as sms, self.captureOnCommitCallbacks(execute=True):
            move_stock(self.v, 1, StockMovement.Reason.RECEIVE)
        sms.assert_not_called()

    def test_signed_in_customer_uses_own_number(self):
        self.client.force_login(self.user)
        res = self.client.post("/api/stock-alerts/", {"variant": self.v.pk}, content_type="application/json")
        self.assertEqual(res.json()["phone"], "09121234567")

    def test_no_alert_for_something_in_stock(self):
        move_stock(self.v, 1, StockMovement.Reason.RECEIVE)
        res = self.client.post("/api/stock-alerts/", {"variant": self.v.pk, "phone": "09127778888"}, content_type="application/json")
        self.assertEqual(res.status_code, 409)


class ReviewTests(EngageFixture):
    def url(self):
        return f"/api/products/{self.coat.slug}/reviews/"

    def test_only_buyers_review_and_reviews_wait_for_approval(self):
        self.client.force_login(self.user)
        self.assertEqual(self.client.post(self.url(), {"rating": 5}, content_type="application/json").status_code, 403)
        self.deliver(self.user)
        res = self.client.post(self.url(), {"rating": 4, "text": "خوب بود"}, content_type="application/json")
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.json()["mine"]["status"], "pending")
        self.assertEqual(res.json()["count"], 0)
        Review.objects.update(status="approved")
        data = self.client.get(self.url()).json()
        self.assertEqual((data["count"], data["average"]), (1, 4.0))

    def test_admin_approves_and_replies(self):
        self.deliver(self.user)
        review = Review.objects.create(product=self.coat, user=self.user, rating=5)
        self.client.force_login(User.objects.create_user("admin", is_staff=True))
        res = self.client.patch(f"/api/admin/reviews/{review.pk}/", {"status": "approved", "reply": "ممنون"}, content_type="application/json")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(self.client.get(self.url()).json()["items"][0]["reply"], "ممنون")
