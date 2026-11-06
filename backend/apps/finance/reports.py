"""
Profit and loss, best sellers and slow movers, from the site's orders and the shop till together.

Sales count on the day they were made: online orders once paid (or moved past payment by the
admin), till tickets when rung up. Money handed back counts on the day it was handed back: a
completed online refund, or pieces taken back at the till. The cost of goods is the purchase
price saved on each sold line; lines sold before a purchase price was entered are reported
separately, since they make the profit look higher than it is.
"""

from collections import defaultdict
from datetime import timedelta

from django.db.models import Count, Max, Sum
from django.db.models.functions import Coalesce, TruncDate
from django.utils import timezone

from apps.catalog.models import Product
from apps.inventory.models import StockMovement
from apps.orders.models import Order, OrderItem, ReturnItem, ReturnRequest
from apps.pos.models import ReturnedItem, Sale, SaleItem

from .models import Expense

# Stock of 9999 is left over from an older panel and means "count unknown".
UNKNOWN_STOCK = 9999
# Pieces taken out of stock that are a loss to the shop.
WRITE_OFFS = (StockMovement.Reason.DAMAGED, StockMovement.Reason.LOST)
# A detail window lists at most this many rows; the rest are counted.
DETAIL_ROWS = 1000


def _paid_unit(unit_price, subtotal, discount):
    """One piece's share of what the customer paid, after the order or ticket discount."""
    return round(unit_price * (subtotal - discount) / subtotal) if subtotal else unit_price


def _cost(lines):
    """(known cost, pieces without a purchase price, their sales) for (unit_price, unit_cost, qty) lines."""
    known = missing = missing_sales = 0
    for price, cost, qty in lines:
        if cost is None:
            missing += qty
            missing_sales += price * qty
        else:
            known += cost * qty
    return known, missing, missing_sales


def sold_orders(start, end):
    return Order.objects.filter(status__in=Order.SOLD, created_at__gte=start, created_at__lt=end)


def till_sales(start, end):
    return Sale.objects.filter(status=Sale.Status.COMPLETED, created_at__gte=start, created_at__lt=end)


def online_refunds(start, end):
    """Pieces of completed online refunds, with the order they came from."""
    return ReturnItem.objects.filter(
        request__status=ReturnRequest.Status.COMPLETED, request__wants="refund",
        request__updated_at__gte=start, request__updated_at__lt=end,
    ).select_related("order_item__order", "order_item__variant")


def profit_and_loss(start, end, first_day, last_day):
    orders = sold_orders(start, end)
    o = orders.aggregate(goods=Coalesce(Sum("subtotal"), 0), discount=Coalesce(Sum("discount_amount"), 0),
                         shipping=Coalesce(Sum("shipping_fee"), 0), count=Count("id"))
    online_lines = OrderItem.objects.filter(order__in=orders).values_list("unit_price", "unit_cost", "qty")

    sales = till_sales(start, end)
    t = sales.aggregate(goods=Coalesce(Sum("subtotal"), 0), discount=Coalesce(Sum("discount"), 0),
                        returned=Coalesce(Sum("returned_total"), 0), count=Count("id"))
    till_lines = SaleItem.objects.filter(sale__in=sales).values_list("unit_price", "unit_cost", "qty")

    refunds = list(online_refunds(start, end))
    online_refund = sum(_paid_unit(r.order_item.unit_price, r.order_item.order.subtotal, r.order_item.order.discount_amount) * r.qty for r in refunds)
    till_back = ReturnedItem.objects.filter(sale__in=sales).select_related("item")
    cost_back = sum(r.order_item.unit_cost * r.qty for r in refunds if r.order_item.unit_cost is not None)
    cost_back += sum(r.item.unit_cost * r.qty for r in till_back if r.item.unit_cost is not None)

    sold_cost, missing, missing_sales = _cost(list(online_lines) + list(till_lines))
    online_sales = o["goods"] - o["discount"]
    store_sales = t["goods"] - t["discount"]
    net_sales = online_sales + o["shipping"] + store_sales - online_refund - t["returned"]
    cogs = sold_cost - cost_back
    gross = net_sales - cogs

    by_cat = (
        Expense.objects.filter(day__gte=first_day, day__lte=last_day).values("category")
        .annotate(total=Sum("amount"), count=Count("id")).order_by("-total")
    )
    labels = dict(Expense.Category.choices)
    expenses = [{"category": e["category"], "label": labels.get(e["category"], e["category"]), "total": e["total"], "count": e["count"]} for e in by_cat]
    expense_total = sum(e["total"] for e in expenses)
    lost = write_offs(start, end)
    return {
        "online": {"orders": o["count"], "goods": o["goods"], "discount": o["discount"], "sales": online_sales, "shipping": o["shipping"], "refunds": online_refund},
        "store": {"tickets": t["count"], "goods": t["goods"], "discount": t["discount"], "sales": store_sales, "returns": t["returned"]},
        "net_sales": net_sales,
        "cogs": cogs,
        "gross_profit": gross,
        "gross_margin": round(gross * 100 / net_sales, 1) if net_sales else None,
        "expenses": expenses,
        "expense_total": expense_total,
        "write_offs": {"pieces": lost["pieces"], "total": lost["total"], "missing_cost": lost["missing_cost"]},
        "net_profit": gross - expense_total - lost["total"],
        "missing_cost": {"pieces": missing, "sales": missing_sales},
    }


def write_offs(start, end):
    """
    Pieces thrown away as damaged or lost in the period, at the product's purchase price: money the
    shop paid for goods it will never sell. Pieces sent back to the supplier are not counted, since
    their money comes back.
    """
    rows, total, missing = [], 0, 0
    labels = dict(StockMovement.Reason.choices)
    qs = (
        StockMovement.objects.filter(reason__in=WRITE_OFFS, delta__lt=0, created_at__gte=start, created_at__lt=end)
        .select_related("variant__product", "variant__color", "variant__size", "created_by")
    )
    for m in qs:
        cost = m.variant.product.cost_price
        qty = -m.delta
        if cost is None:
            missing += qty
        else:
            total += cost * qty
        rows.append({
            "date": m.created_at, "product_id": m.variant.product_id, "product": m.variant.product.name,
            "variant": f"{m.variant.color.name}، سایز {m.variant.size.label}", "qty": qty,
            "reason": labels[m.reason], "note": m.note, "amount": cost * qty if cost is not None else None,
        })
    return {"pieces": sum(r["qty"] for r in rows), "total": total, "missing_cost": missing, "rows": rows}


def daily(start, end):
    """Net sales per day, online and at the till, for the chart."""
    online = dict(
        sold_orders(start, end).annotate(d=TruncDate("created_at")).values("d")
        .annotate(n=Sum("total")).values_list("d", "n")
    )
    store = dict(till_sales(start, end).annotate(d=TruncDate("created_at")).values("d").annotate(n=Sum("total")).values_list("d", "n"))
    days, d = [], timezone.localtime(start).date()
    last = timezone.localtime(end - timedelta(seconds=1)).date()
    while d <= last:
        days.append({"day": d.isoformat(), "online": online.get(d, 0), "store": store.get(d, 0)})
        d += timedelta(days=1)
    return days


def product_sales(start, end):
    """Pieces sold, sales and profit per product in the period, returns taken off."""
    rows = defaultdict(lambda: {"product_id": None, "name": "", "category": "", "qty": 0, "sales": 0, "cost": 0, "missing_cost": 0})

    def add(product, name, price, cost, qty, sign=1):
        key = product.id if product else f"name:{name}"
        r = rows[key]
        r["product_id"] = product.id if product else None
        r["name"] = product.name if product else name
        r["category"] = product.category.name if product else "حذف‌شده"
        r["qty"] += sign * qty
        r["sales"] += sign * price * qty
        if cost is None:
            r["missing_cost"] += sign * qty
        else:
            r["cost"] += sign * cost * qty

    for i in OrderItem.objects.filter(order__in=sold_orders(start, end)).select_related("order", "variant__product__category"):
        add(i.variant.product if i.variant else None, i.product_name, _paid_unit(i.unit_price, i.order.subtotal, i.order.discount_amount), i.unit_cost, i.qty)
    for i in SaleItem.objects.filter(sale__in=till_sales(start, end)).select_related("sale", "variant__product__category"):
        add(i.variant.product if i.variant else None, i.product_name, i.paid_unit, i.unit_cost, i.qty)
    for r in online_refunds(start, end).select_related("order_item__variant__product__category"):
        i = r.order_item
        add(i.variant.product if i.variant else None, i.product_name, _paid_unit(i.unit_price, i.order.subtotal, i.order.discount_amount), i.unit_cost, r.qty, -1)
    for r in ReturnedItem.objects.filter(sale__in=till_sales(start, end)).select_related("item__variant__product__category"):
        i = r.item
        add(i.variant.product if i.variant else None, i.product_name, r.unit_refund, i.unit_cost, r.qty, -1)

    out = []
    for r in rows.values():
        r["profit"] = r["sales"] - r["cost"] if not r["missing_cost"] else None
        out.append(r)
    return out


def by_category(products):
    cats = defaultdict(lambda: {"qty": 0, "sales": 0})
    for r in products:
        cats[r["category"]]["qty"] += r["qty"]
        cats[r["category"]]["sales"] += r["sales"]
    return sorted(({"category": k, **v} for k, v in cats.items()), key=lambda x: -x["sales"])


def by_seller(start, end):
    return [
        {"seller": r["seller__first_name"] and f'{r["seller__first_name"]} {r["seller__last_name"]}'.strip() or r["seller__username"],
         "tickets": r["n"], "total": r["total"]}
        for r in till_sales(start, end).values("seller__username", "seller__first_name", "seller__last_name")
        .annotate(n=Count("id"), total=Sum("total")).order_by("-total")
    ]


def _last_sold():
    """When each product last sold, online or at the till."""
    last_online = dict(
        OrderItem.objects.filter(order__status__in=Order.SOLD, variant__isnull=False)
        .values("variant__product").annotate(m=Max("order__created_at")).values_list("variant__product", "m")
    )
    last_store = dict(
        SaleItem.objects.filter(sale__status=Sale.Status.COMPLETED, variant__isnull=False)
        .values("variant__product").annotate(m=Max("sale__created_at")).values_list("variant__product", "m")
    )
    return {pid: max(filter(None, [last_online.get(pid), last_store.get(pid)])) for pid in last_online.keys() | last_store.keys()}


def _idle_rows(products, last_sold):
    """Products with pieces in stock, with what they are worth and how long since they last sold."""
    now = timezone.now()
    rows = []
    for p in products.prefetch_related("variants").select_related("category"):
        variants = [v for v in p.variants.all() if v.is_active]
        known = [v for v in variants if v.stock < UNKNOWN_STOCK]
        stock = sum(v.stock for v in known)
        if not stock and len(known) == len(variants):
            continue
        last = last_sold.get(p.id)
        rows.append({
            "product_id": p.id, "name": p.name, "category": p.category.name, "price": p.price, "cost_price": p.cost_price,
            "stock": stock, "stock_unknown": len(known) < len(variants),
            "stock_value": stock * p.cost_price if p.cost_price is not None else None,
            "sale_value": sum(v.stock * v.price for v in known),
            "last_sold": last, "idle_days": (now - (last or p.created_at)).days, "never_sold": last is None,
        })
    rows.sort(key=lambda r: -r["idle_days"])
    return rows


def slow_movers(start, end, sold_ids, limit=10):
    """Products on sale with pieces in stock that sold nothing in the period, longest idle first."""
    return _idle_rows(Product.objects.filter(is_active=True).exclude(pk__in=sold_ids), _last_sold())[:limit]


def stale_stock(days, category=None):
    """
    Products with pieces in stock that have not sold for at least `days` days, counted from their
    last sale (or from when they were added, if they never sold). Products hidden from the site are
    included: their pieces still sit on the shelf.
    """
    products = Product.objects.all()
    if category:
        products = products.filter(category_id=category)
    rows = [r for r in _idle_rows(products, _last_sold()) if r["idle_days"] >= days]
    return {
        "days": days,
        "rows": rows,
        "products": len(rows),
        "pieces": sum(r["stock"] for r in rows),
        "cost_value": sum(r["stock_value"] or 0 for r in rows),
        "without_cost": sum(1 for r in rows if r["stock_value"] is None),
        "sale_value": sum(r["sale_value"] for r in rows),
    }


def _col(key, label, kind="text"):
    return {"key": key, "label": label, "kind": kind}


def _person(user):
    return (user.get_full_name() or user.username) if user else ""


def line_detail(line, start, end, first_day, last_day):
    """
    The rows behind one line of the profit and loss statement, for its detail window. Each answer
    names its columns (text, num, money or date) so one table can show them all; rows may carry an
    `href` to open the order, ticket or product.
    """
    if line in ("online", "shipping"):
        orders = sold_orders(start, end).order_by("-created_at")
        if line == "shipping":
            orders = orders.filter(shipping_fee__gt=0)
            cols = [_col("number", "سفارش"), _col("date", "تاریخ", "date"), _col("customer", "مشتری"), _col("amount", "هزینه‌ی ارسال", "money")]
        else:
            cols = [_col("number", "سفارش"), _col("date", "تاریخ", "date"), _col("customer", "مشتری"), _col("goods", "مبلغ کالاها", "money"),
                    _col("discount", "تخفیف", "money"), _col("amount", "فروش", "money")]
        rows = [{
            "number": f"#{o.number}", "date": o.created_at, "customer": o.receiver_name, "goods": o.subtotal,
            "discount": o.discount_amount, "amount": o.shipping_fee if line == "shipping" else o.subtotal - o.discount_amount,
            "href": f"/panel/orders/{o.id}",
        } for o in orders]
    elif line == "store":
        cols = [_col("number", "فاکتور"), _col("date", "تاریخ", "date"), _col("seller", "فروشنده"), _col("customer", "مشتری"),
                _col("goods", "مبلغ کالاها", "money"), _col("discount", "تخفیف", "money"), _col("amount", "فروش", "money")]
        rows = [{
            "number": f"#{t.number}", "date": t.created_at, "seller": _person(t.seller), "customer": t.customer_name or t.customer_phone,
            "goods": t.subtotal, "discount": t.discount, "amount": t.subtotal - t.discount,
        } for t in till_sales(start, end).select_related("seller").order_by("-created_at")]
    elif line == "returns":
        cols = [_col("where", "کجا"), _col("number", "سفارش یا فاکتور"), _col("date", "تاریخ", "date"), _col("product", "کالا"),
                _col("qty", "تعداد", "num"), _col("amount", "مبلغ پس‌داده", "money")]
        rows = [{
            "where": "اینترنتی", "number": f"#{r.order_item.order.number}", "date": r.request.updated_at, "product": r.order_item.product_name,
            "qty": r.qty, "amount": _paid_unit(r.order_item.unit_price, r.order_item.order.subtotal, r.order_item.order.discount_amount) * r.qty,
            "href": f"/panel/orders/{r.order_item.order_id}",
        } for r in online_refunds(start, end).select_related("request")]
        rows += [{
            "where": "حضوری", "number": f"#{r.sale.number} (از #{r.item.sale.number})", "date": r.sale.created_at, "product": r.item.product_name,
            "qty": r.qty, "amount": r.unit_refund * r.qty,
        } for r in ReturnedItem.objects.filter(sale__in=till_sales(start, end)).select_related("sale", "item__sale")]
        rows.sort(key=lambda r: r["date"], reverse=True)
    elif line in ("cogs", "gross"):
        products = sorted(product_sales(start, end), key=lambda r: -r["sales"])
        cols = [_col("product", "محصول"), _col("category", "دسته"), _col("qty", "تعداد فروش", "num")]
        if line == "cogs":
            cols += [_col("amount", "قیمت خرید", "money"), _col("missing", "بدون قیمت خرید", "num")]
        else:
            cols += [_col("sales", "فروش", "money"), _col("cost", "قیمت خرید", "money"), _col("amount", "سود", "money")]
        rows = [{
            "product": r["name"], "category": r["category"], "qty": r["qty"], "sales": r["sales"], "cost": r["cost"],
            "missing": r["missing_cost"] or None, "amount": r["cost"] if line == "cogs" else r["sales"] - r["cost"],
            "href": f"/panel/products/{r['product_id']}" if r["product_id"] else None,
        } for r in products if r["qty"] or r["sales"]]
    elif line == "expenses":
        cols = [_col("date", "تاریخ", "date"), _col("category", "دسته"), _col("note", "شرح"), _col("amount", "مبلغ", "money")]
        rows = [{
            "date": e.day.isoformat(), "category": e.get_category_display(), "note": e.note + (" (از صندوق)" if e.from_till else ""), "amount": e.amount,
        } for e in Expense.objects.filter(day__gte=first_day, day__lte=last_day).order_by("-day", "-id")]
    elif line == "write_offs":
        cols = [_col("date", "تاریخ", "date"), _col("product", "محصول"), _col("variant", "رنگ و سایز"), _col("qty", "تعداد", "num"),
                _col("reason", "دلیل"), _col("note", "توضیح"), _col("amount", "قیمت خرید", "money")]
        rows = [{**r, "href": f"/panel/products/{r['product_id']}"} for r in write_offs(start, end)["rows"]]
    else:
        return None
    return {
        "line": line, "columns": cols, "count": len(rows), "rows": rows[:DETAIL_ROWS], "more": max(len(rows) - DETAIL_ROWS, 0),
        "total": sum(r["amount"] or 0 for r in rows),
    }


def full_report(start, end, first_day, last_day):
    products = product_sales(start, end)
    best = sorted((r for r in products if r["qty"] > 0), key=lambda r: (-r["qty"], -r["sales"]))[:20]
    sold_ids = [r["product_id"] for r in products if r["product_id"] and r["qty"] > 0]
    return {
        "from": first_day.isoformat(), "to": last_day.isoformat(),
        "pnl": profit_and_loss(start, end, first_day, last_day),
        "daily": daily(start, end),
        "best_sellers": best,
        "by_category": by_category(products),
        "by_seller": by_seller(start, end),
        "slow_movers": slow_movers(start, end, sold_ids),
        "products_without_cost": Product.objects.filter(is_active=True, cost_price__isnull=True).count(),
    }
