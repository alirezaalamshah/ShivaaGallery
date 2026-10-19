from django.test import TestCase

from apps.catalog.models import Category, Color, Product, Size, SizeSystem, Variant

from .models import StockMovement
from .services import InsufficientStock, move_stock


class MoveStockTests(TestCase):
    def setUp(self):
        cat = Category.objects.create(name="مانتو")
        system = SizeSystem.objects.create(name="حروفی")
        self.variant = Variant.objects.create(
            product=Product.objects.create(category=cat, name="مانتو کتان", price=1_000_000),
            color=Color.objects.create(name="بژ", hex="#CDB89A"),
            size=Size.objects.create(system=system, label="M"),
        )

    def test_receive_then_sell_keeps_running_balance(self):
        move_stock(self.variant, 5, StockMovement.Reason.RECEIVE)
        m = move_stock(self.variant, -2, StockMovement.Reason.SALE, reference="SG-100")
        self.variant.refresh_from_db()
        self.assertEqual(self.variant.stock, 3)
        self.assertEqual(m.balance, 3)
        self.assertEqual(list(self.variant.movements.order_by("id").values_list("delta", flat=True)), [5, -2])

    def test_overselling_raises_and_records_nothing(self):
        move_stock(self.variant, 1, StockMovement.Reason.RECEIVE)
        with self.assertRaises(InsufficientStock) as ctx:
            move_stock(self.variant, -2, StockMovement.Reason.SALE)
        self.assertEqual(ctx.exception.available, 1)
        self.variant.refresh_from_db()
        self.assertEqual(self.variant.stock, 1)
        self.assertEqual(StockMovement.objects.count(), 1)

    def test_zero_delta_is_rejected(self):
        with self.assertRaises(ValueError):
            move_stock(self.variant, 0, StockMovement.Reason.ADJUST)

    def test_updates_the_passed_instance(self):
        move_stock(self.variant, 4, StockMovement.Reason.RECEIVE)
        self.assertEqual(self.variant.stock, 4)
