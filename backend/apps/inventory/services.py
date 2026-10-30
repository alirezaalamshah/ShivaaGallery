from django.db import transaction

from apps.catalog.models import Variant

from .models import StockMovement


class InsufficientStock(Exception):
    def __init__(self, variant, available, requested):
        self.variant, self.available, self.requested = variant, available, requested
        super().__init__(f"{variant}: {available} available, {requested} requested")


@transaction.atomic
def move_stock(variant, delta, reason, *, note="", reference="", user=None):
    """
    Change a variant's stock and record why. Locks the variant row so two
    checkouts cannot sell the last item twice. Raises InsufficientStock if
    the result would go below zero.
    """
    if delta == 0:
        raise ValueError("delta must not be zero")
    locked = Variant.objects.select_for_update().get(pk=variant.pk)
    new_balance = locked.stock + delta
    if new_balance < 0:
        raise InsufficientStock(locked, locked.stock, -delta)
    back_in_stock = locked.stock == 0 and new_balance > 0
    locked.stock = new_balance
    locked.save(update_fields=["stock"])
    variant.stock = new_balance
    if back_in_stock:
        from apps.catalog.alerts import notify_back_in_stock

        transaction.on_commit(lambda: notify_back_in_stock(locked.pk))
    return StockMovement.objects.create(
        variant=locked, delta=delta, reason=reason, balance=new_balance,
        note=note, reference=reference, created_by=user,
    )
