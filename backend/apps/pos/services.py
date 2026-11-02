from datetime import datetime, time, timedelta

from django.db import IntegrityError, transaction
from django.db.models import Sum
from django.db.models.functions import Coalesce
from django.utils import timezone

from apps.catalog.models import Variant
from apps.core.models import StoreSettings
from apps.finance.models import Expense
from apps.inventory.models import StockMovement
from apps.inventory.services import InsufficientStock, move_stock

from .models import ReturnedItem, Sale, SaleItem, TillClose


class SaleError(Exception):
    def __init__(self, message, lines=None):
        super().__init__(message)
        self.message, self.lines = message, lines or []


def day_range(day):
    """The start and end of a day in the store's time zone."""
    start = timezone.make_aware(datetime.combine(day, time.min))
    return start, start + timedelta(days=1)


def returnable_qty(item):
    """Pieces of a ticket line that have not been brought back yet (returns on voided tickets do not count)."""
    taken = item.returns.exclude(sale__status=Sale.Status.VOIDED).aggregate(n=Coalesce(Sum("qty"), 0))["n"]
    return item.qty - taken


def return_problem(sale, user):
    """Why pieces of this ticket may not be brought back, or None. The admin may always take them back."""
    if sale.status != Sale.Status.COMPLETED:
        return "این فاکتور باطل شده است."
    if user.is_staff:
        return None
    store = StoreSettings.load()
    if not store.returns_enabled:
        return "طبق قوانین فروشگاه کالا پس گرفته نمی‌شود. فقط مدیر می‌تواند استثنا قائل شود."
    if timezone.now() - sale.created_at > timedelta(days=store.returns_days):
        return f"مهلت {store.returns_days} روزه‌ی مرجوعی این فاکتور تمام شده است. فقط مدیر می‌تواند آن را پس بگیرد."
    return None


def create_sale(seller, data):
    """
    Record a till ticket at today's prices. It sells new pieces (`lines`), and may also take back
    pieces of earlier tickets (`returns`), each at what the customer paid for it. The payments
    (cash, card reader, card transfer) must add up to the total; a negative total is money
    handed back. Sending the same client_key twice returns the first ticket instead of selling again.
    """
    key = data.get("client_key") or None
    if key:
        done = Sale.objects.filter(client_key=key, seller=seller).first()
        if done:
            return done
    merged = {}
    for line in data.get("lines", []):
        merged[line["variant"]] = merged.get(line["variant"], 0) + line["qty"]
    back = {}
    for line in data.get("returns", []):
        back[line["item"]] = back.get(line["item"], 0) + line["qty"]
    if not merged and not back:
        raise SaleError("کالایی در فاکتور نیست.")

    variants = Variant.objects.select_related("product", "color", "size").in_bulk(list(merged))
    missing = [vid for vid in merged if vid not in variants or not variants[vid].is_active]
    if missing:
        raise SaleError("بعضی کالاها دیگر فروخته نمی‌شوند. آن‌ها را از فاکتور حذف کنید.", lines=missing)

    subtotal = sum(variants[vid].price * qty for vid, qty in merged.items())
    discount = data.get("discount", 0)
    if discount > subtotal:
        raise SaleError("تخفیف از جمع فاکتور بیشتر است.")
    store = StoreSettings.load()
    if not seller.is_staff:
        limit = store.seller_max_discount
        if discount * 100 > subtotal * limit:
            raise SaleError(f"فروشنده حداکثر {limit}٪ تخفیف می‌تواند بدهد.")

    try:
        with transaction.atomic():
            items = SaleItem.objects.select_for_update().select_related("sale", "variant").in_bulk(list(back))
            returned = []
            for item_id, qty in back.items():
                item = items.get(item_id)
                if item is None:
                    raise SaleError("کالای مرجوعی در فاکتورهای قبلی پیدا نشد.")
                problem = return_problem(item.sale, seller)
                if problem:
                    raise SaleError(f"فاکتور {item.sale.number}: {problem}")
                left = returnable_qty(item)
                if qty > left:
                    raise SaleError(f"از {item.product_name} {item.color_name} سایز {item.size_label} فقط {left} عدد قابل پس گرفتن است.")
                returned.append((item, qty, item.paid_unit))
            returned_total = sum(unit * qty for _, qty, unit in returned)

            total = subtotal - discount - returned_total
            pays = {k: data.get(k, 0) for k in ("cash", "card", "transfer")}
            if any(v < 0 for v in pays.values()) if total >= 0 else any(v > 0 for v in pays.values()):
                raise SaleError("روش‌های پرداخت را درست وارد کنید.")
            paid = sum(pays.values())
            if paid != total:
                raise SaleError(f"جمع پرداخت‌ها ({paid:,}) با مبلغ فاکتور ({total:,}) برابر نیست.")
            if total < 0 and store.returns_type == StoreSettings.ReturnType.EXCHANGE and not seller.is_staff:
                raise SaleError("طبق قوانین فروشگاه فقط تعویض انجام می‌شود و پول برگردانده نمی‌شود. فقط مدیر می‌تواند استثنا قائل شود.")

            sale = Sale.objects.create(
                seller=seller, client_key=key, subtotal=subtotal, discount=discount, returned_total=returned_total, total=total,
                customer_name=data.get("customer_name", "").strip(), customer_phone=data.get("customer_phone", ""),
                note=data.get("note", "").strip(), **pays,
            )
            for item, qty, unit in returned:
                ReturnedItem.objects.create(sale=sale, item=item, qty=qty, unit_refund=unit)
                if item.variant_id:
                    move_stock(item.variant, qty, StockMovement.Reason.RETURN, reference=sale.number, note=f"مرجوعی حضوری از فاکتور {item.sale.number}", user=seller)
            short = []
            for vid, qty in merged.items():
                v = variants[vid]
                try:
                    move_stock(v, -qty, StockMovement.Reason.STORE_SALE, reference=sale.number, user=seller)
                except InsufficientStock as e:
                    short.append({"variant": vid, "available": e.available})
                    continue
                SaleItem.objects.create(
                    sale=sale, variant=v, product_name=v.product.name, color_name=v.color.name, size_label=v.size.label,
                    sku=v.sku, unit_price=v.price, unit_cost=v.product.cost_price, qty=qty,
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
    """
    Cancel a till ticket (a mistake, or the customer brought everything back). Its pieces return
    to stock, and pieces it took back from earlier tickets leave stock again.
    """
    sale = Sale.objects.select_for_update().get(pk=sale.pk)
    if sale.status == Sale.Status.VOIDED:
        raise SaleError("این فروش قبلاً باطل شده است.")
    later = ReturnedItem.objects.filter(item__sale=sale).exclude(sale__status=Sale.Status.VOIDED).values_list("sale__number", flat=True).first()
    if later:
        raise SaleError(f"بخشی از این فاکتور در فاکتور {later} پس گرفته شده است. اول آن فاکتور را باطل کنید.")
    for item in sale.items.select_related("variant"):
        if item.variant_id:
            move_stock(item.variant, item.qty, StockMovement.Reason.RETURN, reference=sale.number, note="ابطال فروش حضوری", user=by)
    for r in sale.returned.select_related("item__variant"):
        if r.item.variant_id:
            try:
                move_stock(r.item.variant, -r.qty, StockMovement.Reason.ADJUST, reference=sale.number, note="ابطال مرجوعی حضوری", user=by)
            except InsufficientStock:
                raise SaleError(f"کالای پس‌گرفته‌ی {r.item.product_name} دوباره فروخته شده و ابطال این فاکتور ممکن نیست.")
    sale.status = Sale.Status.VOIDED
    sale.voided_by, sale.voided_at, sale.void_reason = by, timezone.now(), reason.strip()[:200]
    sale.save(update_fields=["status", "voided_by", "voided_at", "void_reason"])
    return sale


def drawer(day):
    """The cash drawer's numbers for one day, as the till close shows and records them."""
    start, end = day_range(day)
    done = Sale.objects.filter(status=Sale.Status.COMPLETED, created_at__gte=start, created_at__lt=end)
    sums = done.aggregate(cash=Coalesce(Sum("cash"), 0), card=Coalesce(Sum("card"), 0), transfer=Coalesce(Sum("transfer"), 0))
    before = TillClose.objects.filter(day__lt=day).order_by("-day").first()
    opening = before.left_in_drawer if before else 0
    expenses = Expense.objects.filter(day=day, from_till=True).aggregate(n=Coalesce(Sum("amount"), 0))["n"]
    return {
        "day": day.isoformat(), "opening_cash": opening, "cash_sales": sums["cash"], "cash_expenses": expenses,
        "expected_cash": opening + sums["cash"] - expenses, "card_total": sums["card"], "transfer_total": sums["transfer"],
        "sale_count": done.count(),
    }


def close_till(day, user, counted_cash, left_in_drawer, counted_card=None, note=""):
    """Record (or record again, if more sales came in) the drawer count for a day."""
    if left_in_drawer < 0 or left_in_drawer > max(counted_cash, 0):
        raise SaleError("پول باقی‌مانده در صندوق نمی‌تواند از نقد شمرده‌شده بیشتر باشد.")
    d = drawer(day)
    close, _ = TillClose.objects.update_or_create(day=day, defaults={
        "opening_cash": d["opening_cash"], "cash_sales": d["cash_sales"], "cash_expenses": d["cash_expenses"],
        "expected_cash": d["expected_cash"], "counted_cash": counted_cash, "card_total": d["card_total"],
        "counted_card": counted_card, "transfer_total": d["transfer_total"], "left_in_drawer": left_in_drawer,
        "note": note.strip()[:300], "closed_by": user,
    })
    return close
