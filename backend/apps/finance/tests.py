from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.catalog.models import Category, Color, Product, Size, SizeSystem, Variant
from apps.inventory.models import StockMovement
from apps.inventory.services import move_stock
from apps.orders.models import Order, ShippingMethod
from apps.orders.services import change_status, place_order
from apps.pos.services import create_sale

from .models import Expense

User = get_user_model()


class ReportTests(TestCase):
    def setUp(self):
        sizes = SizeSystem.objects.create(name="حروفی")
        cat = Category.objects.create(name="مانتو", size_system=sizes)
        black = Color.objects.create(name="مشکی", hex="#111111")
        size = Size.objects.create(system=sizes, label="M")
        self.coat = Product.objects.create(category=cat, name="مانتو کتان", price=1_000_000, cost_price=600_000)
        self.v = Variant.objects.create(product=self.coat, color=black, size=size)
        move_stock(self.v, 10, StockMovement.Reason.RECEIVE)
        self.idle = Product.objects.create(category=cat, name="عبا", price=2_000_000, cost_price=1_200_000)
        move_stock(Variant.objects.create(product=self.idle, color=black, size=size), 3, StockMovement.Reason.RECEIVE)
        self.admin = User.objects.create_user("admin", is_staff=True)
        self.client.force_login(self.admin)

    def test_profit_and_loss_from_site_till_returns_and_expenses(self):
        ship = ShippingMethod.objects.create(name="پست", fee=100_000)
        order = place_order(User.objects.create_user("09121234567"), {
            "lines": [{"variant": self.v.pk, "qty": 2}], "receiver_name": "مریم", "city": "اهواز", "address": "خیابان یک پلاک ده", "shipping_method": ship.pk,
        })
        change_status(order, Order.Status.PAID)
        sale = create_sale(self.admin, {"lines": [{"variant": self.v.pk, "qty": 1}], "discount": 100_000, "cash": 900_000})
        # The customer brings the till piece back: 900,000 back, its 600,000 cost back on the shelf.
        create_sale(self.admin, {"returns": [{"item": sale.items.get().pk, "qty": 1}], "cash": -900_000})
        Expense.objects.create(category="rent", amount=500_000)

        pnl = self.client.get("/api/admin/reports/").json()["pnl"]
        self.assertEqual(pnl["net_sales"], 2_000_000 + 100_000 + 900_000 - 900_000)
        self.assertEqual(pnl["cogs"], 3 * 600_000 - 600_000)
        self.assertEqual(pnl["gross_profit"], 2_100_000 - 1_200_000)
        self.assertEqual(pnl["net_profit"], 900_000 - 500_000)
        self.assertEqual(pnl["expenses"][0]["label"], "اجاره")
        self.assertEqual(pnl["missing_cost"]["pieces"], 0)

    def test_best_sellers_slow_movers_and_missing_cost(self):
        Product.objects.filter(pk=self.coat.pk).update(cost_price=None)
        create_sale(self.admin, {"lines": [{"variant": self.v.pk, "qty": 2}], "cash": 2_000_000})
        r = self.client.get("/api/admin/reports/").json()
        self.assertEqual((r["best_sellers"][0]["name"], r["best_sellers"][0]["qty"], r["best_sellers"][0]["profit"]), ("مانتو کتان", 2, None))
        self.assertEqual(r["pnl"]["missing_cost"], {"pieces": 2, "sales": 2_000_000})
        self.assertEqual([x["name"] for x in r["slow_movers"]], ["عبا"])
        self.assertEqual(r["slow_movers"][0]["stock_value"], 3 * 1_200_000)
        self.assertEqual(r["products_without_cost"], 1)

    def test_expenses_list_filters_by_day_and_totals(self):
        res = self.client.post("/api/admin/expenses/", {"day": "2026-01-10", "category": "bills", "amount": 250_000, "note": "برق"}, content_type="application/json")
        self.assertEqual(res.status_code, 201, res.content)
        Expense.objects.create(day="2026-02-01", category="ads", amount=1_000_000)
        data = self.client.get("/api/admin/expenses/?from=2026-01-01&to=2026-01-31").json()
        self.assertEqual((data["total"], len(data["results"]), data["results"][0]["category_label"]), (250_000, 1, "قبوض و شارژ"))

    def test_only_the_admin_sees_money(self):
        seller = User.objects.create_user("sara")
        self.client.force_login(seller)
        self.assertEqual(self.client.get("/api/admin/reports/").status_code, 403)
        self.assertEqual(self.client.get("/api/admin/expenses/").status_code, 403)
