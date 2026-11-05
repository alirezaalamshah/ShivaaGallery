"""
The stock page: every product's pieces by color and size with what the stock is worth, a stock
count (stocktake) that corrects many sizes at once, pieces taken out with a reason (back to the
supplier, damaged, lost), and products that have stopped selling.

Purchase prices are only sent to someone allowed to see them (`cost.view`).
"""

from collections import defaultdict
from datetime import date

from django.db.models import Count
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.accounts.roles import can, needs
from apps.catalog.models import Category, Product, Variant
from apps.finance.reports import stale_stock
from apps.inventory.models import StockMovement
from apps.inventory.services import move_stock
from apps.pos.services import day_range

# Stock of 9999 is left over from an older panel and means "count unknown".
UNKNOWN_STOCK = 9999
# One or two pieces left: worth reordering.
LOW_STOCK = 2


def _thumb(request, product):
    img = next(iter(product.images.all()), None)
    return request.build_absolute_uri(img.image.url) if img else None


@api_view(["GET"])
@permission_classes([needs("stock.view")])
def overview(request):
    """Every product with its sizes in stock, and totals for the cards at the top. No paging: the page filters as you type."""
    show_cost = can(request.user, "cost.view")
    products = (
        Product.objects.select_related("category").prefetch_related("images", "variants__color", "variants__size")
        .order_by("category__sort", "category__name", "name")
    )
    totals = {"pieces": 0, "variants": 0, "out": 0, "low": 0, "unknown": 0, "sale_value": 0, "cost_value": 0, "without_cost": 0}
    rows = []
    for p in products:
        variants = sorted((v for v in p.variants.all() if v.is_active), key=lambda v: (v.color.sort, v.color_id, v.size.sort))
        if not variants:
            continue
        colors = {}
        stock = sale_value = 0
        unknown = False
        for v in variants:
            colors.setdefault(v.color_id, {"name": v.color.name, "hex": v.color.hex, "sizes": []})["sizes"].append(
                {"id": v.id, "size": v.size.label, "stock": v.stock, "price": v.price, "sku": v.sku}
            )
            totals["variants"] += 1
            if v.stock >= UNKNOWN_STOCK:
                unknown = True
                totals["unknown"] += 1
                continue
            stock += v.stock
            sale_value += v.stock * v.price
            if v.stock == 0:
                totals["out"] += 1
            elif v.stock <= LOW_STOCK:
                totals["low"] += 1
        cost_value = stock * p.cost_price if p.cost_price is not None else None
        totals["pieces"] += stock
        totals["sale_value"] += sale_value
        if cost_value is None:
            totals["without_cost"] += 1 if stock else 0
        else:
            totals["cost_value"] += cost_value
        rows.append({
            "id": p.id, "name": p.name, "category": p.category.name, "category_id": p.category_id, "active": p.is_active,
            "thumb": _thumb(request, p), "stock": stock, "unknown": unknown, "sale_value": sale_value,
            "cost_price": p.cost_price if show_cost else None, "cost_value": cost_value if show_cost else None,
            "colors": list(colors.values()),
        })
    if not show_cost:
        totals["cost_value"] = totals["without_cost"] = None
    return Response({"totals": totals, "products": rows, "low_stock": LOW_STOCK, "show_cost": show_cost})


class CountSerializer(serializers.Serializer):
    class Line(serializers.Serializer):
        variant = serializers.IntegerField()
        counted = serializers.IntegerField(min_value=0, max_value=UNKNOWN_STOCK - 1)
        # The stock the page showed when counting started. If a sale changed it since, the line is skipped.
        shown = serializers.IntegerField()

    lines = Line(many=True, allow_empty=False)
    note = serializers.CharField(max_length=200, required=False, allow_blank=True)


@api_view(["POST"])
@permission_classes([needs("stock.edit", write="stock.edit")])
def count(request):
    """Save a stock count: each size whose counted number differs is corrected, recorded as «انبارگردانی»."""
    d = CountSerializer(data=request.data)
    d.is_valid(raise_exception=True)
    note = d.validated_data.get("note", "").strip() or "انبارگردانی"
    variants = Variant.objects.in_bulk([line["variant"] for line in d.validated_data["lines"]])
    changed, skipped, plus, minus = 0, [], 0, 0
    for line in d.validated_data["lines"]:
        v = variants.get(line["variant"])
        if not v:
            continue
        if v.stock != line["shown"]:
            skipped.append(f"{v.product.name} {v.color.name} سایز {v.size.label}")
            continue
        delta = line["counted"] - v.stock
        if delta:
            move_stock(v, delta, StockMovement.Reason.STOCKTAKE, note=note, user=request.user)
            changed += 1
            plus += max(delta, 0)
            minus += max(-delta, 0)
    return Response({"changed": changed, "plus": plus, "minus": minus, "skipped": skipped})


def _period(params):
    today = timezone.localdate()
    try:
        last = min(date.fromisoformat(params.get("to", "")), today)
    except ValueError:
        last = today
    try:
        first = date.fromisoformat(params.get("from", ""))
    except ValueError:
        # No start: everything up to `last`.
        first = date(2000, 1, 1)
    return min(first, last), last


@api_view(["GET"])
@permission_classes([needs("stock.history")])
def deductions(request):
    """Pieces taken out without a sale in a period, by reason, with what they cost (at today's purchase price)."""
    first, last = _period(request.query_params)
    qs = (
        StockMovement.objects.filter(reason__in=StockMovement.DEDUCTIONS, delta__lt=0,
                                     created_at__gte=day_range(first)[0], created_at__lt=day_range(last)[1])
        .select_related("variant__product", "variant__color", "variant__size", "created_by")
    )
    show_cost = can(request.user, "cost.view")
    labels = dict(StockMovement.Reason.choices)
    by_reason = defaultdict(lambda: {"pieces": 0, "cost_value": 0, "count": 0})
    rows = []
    for m in qs:
        cost = m.variant.product.cost_price
        value = -m.delta * cost if cost is not None else None
        r = by_reason[m.reason]
        r["pieces"] += -m.delta
        r["count"] += 1
        r["cost_value"] += value or 0
        rows.append({
            "id": m.id, "created_at": m.created_at, "product_id": m.variant.product_id, "product": m.variant.product.name,
            "color": m.variant.color.name, "size": m.variant.size.label, "qty": -m.delta, "reason": m.reason,
            "reason_label": labels.get(m.reason, m.reason), "note": m.note,
            "by": (m.created_by.get_full_name() or m.created_by.username) if m.created_by else "",
            "cost_value": value if show_cost else None,
        })
    return Response({
        "from": first.isoformat(), "to": last.isoformat(),
        "reasons": [
            {"reason": k, "label": labels[k], **by_reason[k], "cost_value": by_reason[k]["cost_value"] if show_cost else None}
            for k in StockMovement.DEDUCTIONS if k in by_reason
        ],
        "pieces": sum(r["pieces"] for r in by_reason.values()),
        "cost_value": sum(r["cost_value"] for r in by_reason.values()) if show_cost else None,
        "rows": rows[:500],
        "more": max(len(rows) - 500, 0),
    })


@api_view(["GET"])
@permission_classes([needs("stock.view")])
def stale(request):
    """Products that have not sold for ?days= days (default 60), optionally in one ?category=."""
    try:
        days = max(1, min(int(request.query_params.get("days", 60)), 3650))
    except ValueError:
        days = 60
    category = request.query_params.get("category") or None
    data = stale_stock(days, int(category) if category and category.isdigit() else None)
    if not can(request.user, "cost.view"):
        data["cost_value"] = data["without_cost"] = None
        for r in data["rows"]:
            r["stock_value"] = r["cost_price"] = None
    data["categories"] = list(Category.objects.annotate(n=Count("products")).filter(n__gt=0).values("id", "name"))
    return Response(data)
