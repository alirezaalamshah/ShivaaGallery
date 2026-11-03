"""
Everyone who has bought from the shop or made an account, keyed by mobile number. Site
customers sign in with their mobile, and the till may record a mobile, so the same person's
online orders and shop purchases come together in one profile.
"""

import csv
from collections import Counter

from django.contrib.auth import get_user_model
from django.db.models import Count, Max, Min, Sum
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.accounts.models import Address, CustomerNote
from apps.accounts.roles import needs
from apps.catalog.models import Favorite, Review, StockAlert
from apps.core.jalali import jalali_datetime
from apps.core.validators import iran_mobile
from apps.orders.models import Order, OrderItem, ReturnRequest
from apps.pos.models import Sale, SaleItem



def _customers_by_phone():
    """One row per mobile number, with online and in-shop totals."""
    rows = {}

    def row(phone):
        return rows.setdefault(phone, {
            "phone": phone, "name": "", "has_account": False, "joined": None, "city": "",
            "online_orders": 0, "online_spent": 0, "store_tickets": 0, "store_spent": 0, "first_purchase": None, "last_purchase": None,
        })

    def seen(r, first, last):
        if first and (r["first_purchase"] is None or first < r["first_purchase"]):
            r["first_purchase"] = first
        if last and (r["last_purchase"] is None or last > r["last_purchase"]):
            r["last_purchase"] = last

    customers = get_user_model().objects.filter(is_staff=False, is_superuser=False, staff_access__isnull=True)
    for u in customers:
        r = row(u.username)
        r.update(has_account=True, joined=u.date_joined, name=u.get_full_name())
    for o in Order.objects.filter(status__in=Order.SOLD).values("phone").annotate(n=Count("id"), spent=Sum("total"), first=Min("created_at"), last=Max("created_at")):
        r = row(o["phone"])
        r.update(online_orders=o["n"], online_spent=o["spent"])
        seen(r, o["first"], o["last"])
    for s in Sale.objects.filter(status=Sale.Status.COMPLETED).exclude(customer_phone="").values("customer_phone").annotate(
        n=Count("id"), spent=Sum("total"), first=Min("created_at"), last=Max("created_at")
    ):
        r = row(s["customer_phone"])
        r.update(store_tickets=s["n"], store_spent=s["spent"])
        seen(r, s["first"], s["last"])
    # Names and cities from the latest order or ticket, where the account has no name.
    for o in Order.objects.order_by("created_at").values("phone", "receiver_name", "city"):
        if o["phone"] in rows:
            rows[o["phone"]]["city"] = o["city"] or rows[o["phone"]]["city"]
            rows[o["phone"]]["_order_name"] = o["receiver_name"]
    for s in Sale.objects.exclude(customer_phone="").exclude(customer_name="").order_by("created_at").values("customer_phone", "customer_name"):
        if s["customer_phone"] in rows:
            rows[s["customer_phone"]]["_sale_name"] = s["customer_name"]
    notes = {n.phone: n for n in CustomerNote.objects.all()}
    for n in notes.values():
        row(n.phone)
    for r in rows.values():
        note = notes.get(r["phone"])
        r["name"] = (note.name if note else "") or r["name"] or r.pop("_order_name", "") or r.pop("_sale_name", "")
        r.pop("_order_name", None)
        r.pop("_sale_name", None)
        r["has_note"] = bool(note and note.note)
        r["total_spent"] = r["online_spent"] + r["store_spent"]
        r["purchases"] = r["online_orders"] + r["store_tickets"]
    return list(rows.values())


CUSTOMERS_PAGE = 50

ORDERINGS = {
    "recent": lambda r: (r["last_purchase"] or r["joined"] or timezone.now().replace(year=2000)),
    "spent": lambda r: r["total_spent"],
    "purchases": lambda r: r["purchases"],
}


def _listed(params):
    rows = _customers_by_phone()
    q = params.get("search", "").strip()
    if q:
        from apps.accounts.serializers import normalize_digits

        digits = normalize_digits(q)
        rows = [r for r in rows if (digits and digits in r["phone"]) or q in r["name"] or q in r["city"]]
    kind = params.get("kind")
    if kind == "online":
        rows = [r for r in rows if r["online_orders"]]
    elif kind == "store":
        rows = [r for r in rows if r["store_tickets"]]
    elif kind == "none":
        rows = [r for r in rows if not r["purchases"]]
    key = ORDERINGS.get(params.get("ordering", "recent"), ORDERINGS["recent"])
    return sorted(rows, key=key, reverse=True)


@api_view(["GET"])
@permission_classes([needs("customers.view")])
def customers(request):
    rows = _listed(request.query_params)
    page = request.query_params.get("page", "")
    page = int(page) if page.isdigit() and int(page) > 0 else 1
    start = (page - 1) * CUSTOMERS_PAGE
    return Response({"count": len(rows), "pages": max(1, -(-len(rows) // CUSTOMERS_PAGE)), "results": rows[start:start + CUSTOMERS_PAGE]})


@api_view(["GET"])
@permission_classes([needs("customers.export")])
def customers_export(request):
    """The listed customers (same search and filters) as a CSV file that Excel opens with Persian text intact."""
    res = HttpResponse(content_type="text/csv; charset=utf-8")
    res["Content-Disposition"] = f'attachment; filename="customers-{timezone.localdate():%Y%m%d}.csv"'
    res.write("﻿")
    w = csv.writer(res)
    w.writerow(["موبایل", "نام", "شهر", "حساب سایت", "سفارش اینترنتی", "خرید اینترنتی", "خرید حضوری (فاکتور)", "خرید حضوری", "جمع خرید", "اولین خرید", "آخرین خرید"])
    for r in _listed(request.query_params):
        w.writerow([
            r["phone"], r["name"], r["city"], "بله" if r["has_account"] else "خیر", r["online_orders"], r["online_spent"],
            r["store_tickets"], r["store_spent"], r["total_spent"],
            jalali_datetime(r["first_purchase"]) if r["first_purchase"] else "", jalali_datetime(r["last_purchase"]) if r["last_purchase"] else "",
        ])
    return res


class NoteSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=80, required=False, allow_blank=True)
    note = serializers.CharField(max_length=2000, required=False, allow_blank=True)


def _top(counter, n=3):
    return [{"label": k, "count": v} for k, v in counter.most_common(n)]


@api_view(["GET", "PATCH"])
@permission_classes([needs("customers.view", write="customers.edit")])
def customer_detail(request, phone):
    try:
        iran_mobile(phone)
    except Exception:
        return Response({"detail": "شماره موبایل درست نیست."}, status=status.HTTP_404_NOT_FOUND)
    if request.method == "PATCH":
        d = NoteSerializer(data=request.data)
        d.is_valid(raise_exception=True)
        note, _ = CustomerNote.objects.get_or_create(phone=phone)
        for k, v in d.validated_data.items():
            setattr(note, k, v.strip())
        note.save()

    user = get_user_model().objects.filter(username=phone, is_staff=False, staff_access__isnull=True).first()
    orders = list(Order.objects.filter(phone=phone).annotate(item_count=Sum("items__qty")).order_by("-created_at"))
    sales = list(Sale.objects.filter(customer_phone=phone).select_related("seller").prefetch_related("items", "returned").order_by("-created_at"))
    note = CustomerNote.objects.filter(phone=phone).first()
    if not (user or orders or sales or note):
        return Response({"detail": "مشتری‌ای با این شماره پیدا نشد."}, status=status.HTTP_404_NOT_FOUND)

    sold_orders = [o for o in orders if o.status in Order.SOLD]
    done_sales = [s for s in sales if s.status == Sale.Status.COMPLETED]
    online_spent = sum(o.total for o in sold_orders)
    store_spent = sum(s.total for s in done_sales)
    purchases = len(sold_orders) + len(done_sales)
    dates = [o.created_at for o in sold_orders] + [s.created_at for s in done_sales]

    # What they like to buy: sizes, colors and categories over everything bought.
    sizes, colors, cats = Counter(), Counter(), Counter()
    for i in OrderItem.objects.filter(order__in=sold_orders).select_related("variant__product__category"):
        sizes[i.size_label] += i.qty
        colors[i.color_name] += i.qty
        if i.variant:
            cats[i.variant.product.category.name] += i.qty
    for i in SaleItem.objects.filter(sale__in=done_sales).select_related("variant__product__category"):
        sizes[i.size_label] += i.qty
        colors[i.color_name] += i.qty
        if i.variant:
            cats[i.variant.product.category.name] += i.qty

    name = (note.name if note else "") or (user.get_full_name() if user else "") or next((o.receiver_name for o in orders), "") or next(
        (s.customer_name for s in sales if s.customer_name), ""
    )
    return Response({
        "phone": phone,
        "name": name,
        "note_name": note.name if note else "",
        "note": note.note if note else "",
        "account": {
            "joined": user.date_joined, "last_login": user.last_login, "first_name": user.first_name, "last_name": user.last_name,
        } if user else None,
        "stats": {
            "online_orders": len(sold_orders), "online_spent": online_spent, "store_tickets": len(done_sales), "store_spent": store_spent,
            "total_spent": online_spent + store_spent, "purchases": purchases,
            "average": round((online_spent + store_spent) / purchases) if purchases else 0,
            "first_purchase": min(dates, default=None), "last_purchase": max(dates, default=None),
            "top_sizes": _top(sizes), "top_colors": _top(colors), "top_categories": _top(cats),
        },
        "addresses": [
            {"id": a.id, "receiver_name": a.receiver_name, "receiver_phone": a.receiver_phone, "province": a.province, "city": a.city,
             "address": a.address, "postal_code": a.postal_code}
            for a in (Address.objects.filter(user=user) if user else [])
        ],
        # Addresses typed at checkout, in case the customer did not save them.
        "order_addresses": sorted({f"{o.province} {o.city}، {o.address}".strip() for o in orders if o.address}),
        "orders": [
            {"id": o.id, "number": o.number, "status": o.status, "status_label": o.get_status_display(), "total": o.total,
             "item_count": o.item_count or 0, "created_at": o.created_at, "city": o.city}
            for o in orders
        ],
        "store_sales": [
            {"id": s.id, "number": s.number, "status": s.status, "total": s.total, "created_at": s.created_at,
             "seller": s.seller.get_full_name() or s.seller.username, "item_count": sum(i.qty for i in s.items.all()),
             "returned_count": sum(r.qty for r in s.returned.all())}
            for s in sales
        ],
        "returns": [
            {"id": r.id, "order": r.order.number, "status_label": r.get_status_display(), "wants": r.get_wants_display(), "created_at": r.created_at}
            for r in ReturnRequest.objects.filter(order__phone=phone).select_related("order").order_by("-created_at")
        ],
        "reviews": [
            {"id": r.id, "product": r.product.name, "rating": r.rating, "text": r.text, "status": r.get_status_display(), "created_at": r.created_at}
            for r in (Review.objects.filter(user=user).select_related("product") if user else [])
        ],
        "favorites": [
            {"product_id": f.product_id, "name": f.product.name, "created_at": f.created_at}
            for f in (Favorite.objects.filter(user=user).select_related("product") if user else [])
        ],
        "stock_alerts": [
            {"product": a.variant.product.name, "color": a.variant.color.name, "size": a.variant.size.label, "created_at": a.created_at, "notified_at": a.notified_at}
            for a in StockAlert.objects.filter(phone=phone).select_related("variant__product", "variant__color", "variant__size")
        ],
    })
