from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.catalog.models import Variant
from apps.core.models import StoreSettings
from apps.inventory.models import StockMovement
from apps.inventory.services import InsufficientStock, move_stock

from .models import Sale, SaleItem


class SaleError(Exception):
    def __init__(self, message, lines=None):
        super().__init__(message)
        self.message, self.lines = message, lines or []


def create_sale(seller, data):
    """
    Record a till checkout: take the pieces out of stock, at today's prices. The payments
    (cash, card reader, card transfer) must add up to the total. Sending the same
    client_key twice returns the first sale instead of selling again.
    """
    key = data.get("client_key") or None
    if key:
        done = Sale.objects.filter(client_key=key, seller=seller).first()
        if done:
            return done
    merged = {}
    for line in data["lines"]:
        merged[line["variant"]] = merged.get(line["variant"], 0) + line["qty"]
    variants = Variant.objects.select_related("product", "color", "size").in_bulk(list(merged))
    missing = [vid for vid in merged if vid not in variants or not variants[vid].is_active]
    if missing:
        raise SaleError("بعضی کالاها دیگر فروخته نمی‌شوند. آن‌ها را از فاکتور حذف کنید.", lines=missing)

    subtotal = sum(variants[vid].price * qty for vid, qty in merged.items())
    discount = data.get("discount", 0)
    if discount > subtotal:
        raise SaleError("تخفیف از جمع فاکتور بیشتر است.")
    if not seller.is_staff:
        limit = StoreSettings.load().seller_max_discount
        if discount * 100 > subtotal * limit:
            raise SaleError(f"فروشنده حداکثر {limit}٪ تخفیف می‌تواند بدهد.")
    total = subtotal - discount
    paid = data.get("cash", 0) + data.get("card", 0) + data.get("transfer", 0)
    if paid != total:
        raise SaleError(f"جمع پرداخت‌ها ({paid:,}) با مبلغ فاکتور ({total:,}) برابر نیست.")

    try:
        with transaction.atomic():
            sale = Sale.objects.create(
                seller=seller, client_key=key, subtotal=subtotal, discount=discount, total=total,
                cash=data.get("cash", 0), card=data.get("card", 0), transfer=data.get("transfer", 0),
                customer_name=data.get("customer_name", "").strip(), customer_phone=data.get("customer_phone", ""),
                note=data.get("note", "").strip(),
            )
            short = []
            for vid, qty in merged.items():
                v = variants[vid]
                try:
                    move_stock(v, -qty, StockMovement.Reason.STORE_SALE, reference=sale.number, user=seller)
                except InsufficientStock as e:
                    short.append({"variant": vid, "available": e.available})
                    continue
                SaleItem.objects.create(
                    sale=sale, variant=v, product_name=v.product.name, color_name=v.color.name,
                    size_label=v.size.label, sku=v.sku, unit_price=v.price, qty=qty,
                )
            if short:
                raise SaleError("موجودی بعضی کالاها کافی نیست.", lines=short)
    except IntegrityError:
        # The same checkout arrived twice at once; the other request recorded it.
        done = Sale.objects.filter(client_key=key, seller=seller).first() if key else None
        if done:
            return done
        raise
    return sale


@transaction.atomic
def void_sale(sale, by, reason=""):
    """Cancel a till sale (a mistake, or the customer brought everything back). The pieces return to stock."""
    sale = Sale.objects.select_for_update().get(pk=sale.pk)
    if sale.status == Sale.Status.VOIDED:
        raise SaleError("این فروش قبلاً باطل شده است.")
    for item in sale.items.select_related("variant"):
        if item.variant_id:
            move_stock(item.variant, item.qty, StockMovement.Reason.RETURN, reference=sale.number, note="ابطال فروش حضوری", user=by)
    sale.status = Sale.Status.VOIDED
    sale.voided_by, sale.voided_at, sale.void_reason = by, timezone.now(), reason.strip()[:200]
    sale.save(update_fields=["status", "voided_by", "voided_at", "void_reason"])
    return sale
