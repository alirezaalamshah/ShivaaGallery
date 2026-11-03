from datetime import date

from django.contrib.auth import get_user_model
from django.db.models import Count, Max, Prefetch, Q, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.accounts.roles import ALL, can, needs
from apps.accounts.serializers import OptionalPhoneField
from apps.catalog.models import Product, Variant
from apps.catalog.search import spellings
from apps.core.models import StoreSettings

from .models import Sale, TillClose
from .services import SaleError, close_till, create_sale, day_range, drawer, return_problem, returnable_qty, void_sale


# Anyone allowed anything at the till may open it and see their own tickets.
TILL = tuple(sorted(c for c in ALL if c.startswith("pos.")))
SELLS = ("pos.sell", "pos.return")


class LineSerializer(serializers.Serializer):
    variant = serializers.IntegerField(min_value=1)
    qty = serializers.IntegerField(min_value=1, max_value=50)


class ReturnLineSerializer(serializers.Serializer):
    item = serializers.IntegerField(min_value=1)
    qty = serializers.IntegerField(min_value=1, max_value=50)


class SaleInSerializer(serializers.Serializer):
    lines = LineSerializer(many=True, required=False, default=list)
    returns = ReturnLineSerializer(many=True, required=False, default=list)
    discount = serializers.IntegerField(min_value=0, default=0)
    # Negative amounts are money handed back to the customer, when the returns are worth more.
    cash = serializers.IntegerField(default=0)
    card = serializers.IntegerField(default=0)
    transfer = serializers.IntegerField(default=0)
    customer_name = serializers.CharField(max_length=80, required=False, allow_blank=True)
    customer_phone = OptionalPhoneField(required=False, allow_blank=True)
    note = serializers.CharField(max_length=300, required=False, allow_blank=True)
    client_key = serializers.CharField(max_length=40, required=False, allow_blank=True)


def sale_row(sale, with_items=True):
    row = {
        "id": sale.id, "number": sale.number, "created_at": sale.created_at, "status": sale.status,
        "status_label": sale.get_status_display(), "seller": sale.seller.get_full_name() or sale.seller.username,
        "customer_name": sale.customer_name, "customer_phone": sale.customer_phone, "note": sale.note,
        "subtotal": sale.subtotal, "discount": sale.discount, "returned_total": sale.returned_total, "total": sale.total,
        "cash": sale.cash, "card": sale.card, "transfer": sale.transfer,
        "void_reason": sale.void_reason, "voided_at": sale.voided_at,
    }
    if with_items:
        row["items"] = [
            {"variant": i.variant_id, "product_name": i.product_name, "color_name": i.color_name, "size_label": i.size_label,
             "sku": i.sku, "unit_price": i.unit_price, "qty": i.qty, "line_total": i.line_total}
            for i in sale.items.all()
        ]
        row["returns"] = [
            {"from_sale": r.item.sale.number, "from_sale_id": r.item.sale_id, "product_name": r.item.product_name, "color_name": r.item.color_name,
             "size_label": r.item.size_label, "sku": r.item.sku, "unit_refund": r.unit_refund, "qty": r.qty, "line_total": r.line_total}
            for r in sale.returned.all()
        ]
    else:
        row["item_count"] = sum(i.qty for i in sale.items.all())
        row["returned_count"] = sum(r.qty for r in sale.returned.all())
    return row


def _visible_sales(request):
    """Each seller sees only their own sales, unless allowed to see everyone's."""
    qs = Sale.objects.select_related("seller").prefetch_related("items", "returned__item__sale")
    return qs if can(request.user, "pos.all_sales") else qs.filter(seller=request.user)


def _day(request):
    try:
        return date.fromisoformat(request.query_params.get("date", ""))
    except ValueError:
        return timezone.localdate()


def _image(request, product):
    first = next(iter(product.images.all()), None)
    return request.build_absolute_uri(first.image.url) if first else None


@api_view(["GET"])
@permission_classes([needs(SELLS)])
def lookup(request):
    """
    Products for the till, with every color and size and how many are left. A scanned or
    typed code (SKU) that matches one variant exactly comes back as `exact`, to add at once.
    """
    q = request.query_params.get("q", "").strip()
    variants = Variant.objects.filter(is_active=True).select_related("color", "size").order_by("color__sort", "size__sort")
    products = Product.objects.filter(variants__is_active=True).distinct().prefetch_related(Prefetch("variants", queryset=variants), "images")
    exact = Variant.objects.filter(is_active=True, sku__iexact=q).first() if q else None
    if exact:
        products = products.filter(pk=exact.product_id)
    elif q:
        match = Q()
        for term in spellings(q):
            match |= Q(name__icontains=term) | Q(variants__sku__icontains=term) | Q(category__name__icontains=term)
        products = products.filter(match)
    rows = []
    for p in products.order_by("-created_at")[:30]:
        rows.append({
            "id": p.id, "name": p.name, "image": _image(request, p), "active": p.is_active,
            "variants": [
                {"id": v.id, "sku": v.sku, "color": v.color.name, "color_hex": v.color.hex, "size": v.size.label,
                 "price": v.price, "regular_price": v.regular_price, "stock": v.stock}
                for v in p.variants.all()
            ],
        })
    # The till shows the seller how much discount they may give: none, up to the store's limit, or any.
    if can(request.user, "pos.discount_any"):
        max_discount = None
    else:
        max_discount = StoreSettings.load().seller_max_discount if can(request.user, "pos.discount") else 0
    return Response({"exact": exact.id if exact else None, "products": rows, "max_discount": max_discount})


@api_view(["GET", "POST"])
@permission_classes([needs(TILL, write=SELLS)])
def sales(request):
    if request.method == "POST":
        d = SaleInSerializer(data=request.data)
        d.is_valid(raise_exception=True)
        try:
            sale = create_sale(request.user, d.validated_data)
        except SaleError as e:
            return Response({"detail": e.message, "lines": e.lines}, status=status.HTTP_409_CONFLICT)
        return Response(sale_row(_visible_sales(request).get(pk=sale.pk)), status=status.HTTP_201_CREATED)

    start, end = day_range(_day(request))
    qs = _visible_sales(request).filter(created_at__gte=start, created_at__lt=end)
    if can(request.user, "pos.all_sales") and request.query_params.get("seller", "").isdigit():
        qs = qs.filter(seller_id=request.query_params["seller"])
    q = request.query_params.get("search", "").strip()
    if q:
        qs = qs.filter(Q(number__icontains=q) | Q(customer_phone__icontains=q) | Q(customer_name__icontains=q))
    done = qs.filter(status=Sale.Status.COMPLETED)
    totals = done.aggregate(
        count=Count("id"), total=Coalesce(Sum("total"), 0), cash=Coalesce(Sum("cash"), 0),
        card=Coalesce(Sum("card"), 0), transfer=Coalesce(Sum("transfer"), 0), discount=Coalesce(Sum("discount"), 0),
        returned=Coalesce(Sum("returned_total"), 0),
    )
    totals["pieces"] = done.aggregate(n=Coalesce(Sum("items__qty"), 0))["n"]
    totals["pieces_returned"] = done.aggregate(n=Coalesce(Sum("returned__qty"), 0))["n"]
    totals["voided"] = qs.filter(status=Sale.Status.VOIDED).count()
    return Response({"date": start.date().isoformat(), "totals": totals, "results": [sale_row(x, with_items=False) for x in qs]})


@api_view(["GET"])
@permission_classes([needs(TILL)])
def sale_detail(request, pk):
    sale = _visible_sales(request).filter(pk=pk).first()
    if sale is None:
        return Response({"detail": "فاکتور پیدا نشد."}, status=status.HTTP_404_NOT_FOUND)
    return Response(sale_row(sale))


@api_view(["POST"])
@permission_classes([needs(None, write="pos.void")])
def sale_void(request, pk):
    sale = _visible_sales(request).filter(pk=pk).first()
    if sale is None:
        return Response({"detail": "فاکتور پیدا نشد."}, status=status.HTTP_404_NOT_FOUND)
    try:
        void_sale(sale, request.user, str(request.data.get("reason", "")))
    except SaleError as e:
        return Response({"detail": e.message}, status=status.HTTP_409_CONFLICT)
    return Response(sale_row(_visible_sales(request).get(pk=pk)))


@api_view(["GET"])
@permission_classes([needs("pos.return")])
def returnable(request):
    """
    Earlier tickets the customer may bring pieces back from, found by ticket number or the
    customer's mobile, with how many of each line can still come back. Any seller may look,
    since a customer often comes back to a different seller.
    """
    q = normalize_text(request.query_params.get("q", ""))
    if len(q) < 4:
        return Response([])
    qs = Sale.objects.filter(status=Sale.Status.COMPLETED).filter(Q(number__iexact=q) | Q(number__iexact=f"S{q}") | Q(customer_phone=q))
    rows = []
    for sale in qs.select_related("seller").prefetch_related("items").order_by("-created_at")[:20]:
        rows.append({
            "id": sale.id, "number": sale.number, "created_at": sale.created_at, "seller": sale.seller.get_full_name() or sale.seller.username,
            "customer_name": sale.customer_name, "customer_phone": sale.customer_phone, "total": sale.total,
            "problem": return_problem(sale, request.user),
            "items": [
                {"id": i.id, "product_name": i.product_name, "color_name": i.color_name, "size_label": i.size_label, "sku": i.sku,
                 "qty": i.qty, "returnable": returnable_qty(i), "paid_unit": i.paid_unit}
                for i in sale.items.all()
            ],
        })
    return Response(rows)


def normalize_text(value):
    """Ticket numbers and phones may be typed with Persian digits."""
    from apps.accounts.serializers import PERSIAN_DIGITS

    return str(value).translate(PERSIAN_DIGITS).strip().upper()


@api_view(["GET"])
@permission_classes([needs(SELLS)])
def customer(request):
    """Who this mobile number is, so the till can fill in the name and greet a returning customer."""
    from apps.accounts.models import CustomerNote
    from apps.orders.models import Order

    phone = normalize_text(request.query_params.get("phone", ""))
    if len(phone) != 11 or not phone.isdigit():
        return Response({"found": False})
    sales = Sale.objects.filter(customer_phone=phone, status=Sale.Status.COMPLETED)
    orders = Order.objects.filter(phone=phone, status__in=Order.SOLD)
    note = CustomerNote.objects.filter(phone=phone).first()
    user = get_user_model().objects.filter(username=phone).first()
    name = (
        (note.name if note else "") or (user.get_full_name() if user else "")
        or sales.exclude(customer_name="").values_list("customer_name", flat=True).first()
        or orders.values_list("receiver_name", flat=True).first() or ""
    )
    count = sales.count() + orders.count()
    last = max(filter(None, [sales.aggregate(m=Max("created_at"))["m"], orders.aggregate(m=Max("created_at"))["m"]]), default=None)
    return Response({"found": bool(count or name), "name": name, "purchases": count, "last_purchase": last})


class CloseInSerializer(serializers.Serializer):
    day = serializers.DateField(required=False)
    counted_cash = serializers.IntegerField(min_value=0)
    counted_card = serializers.IntegerField(min_value=0, required=False, allow_null=True)
    left_in_drawer = serializers.IntegerField(min_value=0, default=0)
    note = serializers.CharField(max_length=300, required=False, allow_blank=True)


def close_row(c):
    return {
        "day": c.day.isoformat(), "opening_cash": c.opening_cash, "cash_sales": c.cash_sales, "cash_expenses": c.cash_expenses,
        "expected_cash": c.expected_cash, "counted_cash": c.counted_cash, "difference": c.difference,
        "card_total": c.card_total, "counted_card": c.counted_card, "transfer_total": c.transfer_total,
        "left_in_drawer": c.left_in_drawer, "note": c.note, "closed_by": c.closed_by.get_full_name() or c.closed_by.username,
        "closed_at": c.closed_at,
    }


@api_view(["GET", "POST"])
@permission_classes([needs("pos.close", write="pos.close")])
def till_close(request):
    """
    GET: the drawer numbers for a day (?date=), its close if it has one, and the recent closes.
    POST: record the count. Closing the same day again replaces the earlier count.
    """
    if request.method == "POST":
        d = CloseInSerializer(data=request.data)
        d.is_valid(raise_exception=True)
        v = d.validated_data
        day = v.get("day") or timezone.localdate()
        if day > timezone.localdate():
            return Response({"detail": "روزی که هنوز نیامده بسته نمی‌شود."}, status=status.HTTP_400_BAD_REQUEST)
        if day != timezone.localdate() and not can(request.user, "pos.close_past"):
            return Response({"detail": "فقط صندوق امروز را می‌توانید ببندید."}, status=status.HTTP_403_FORBIDDEN)
        try:
            c = close_till(day, request.user, v["counted_cash"], v["left_in_drawer"], v.get("counted_card"), v.get("note", ""))
        except SaleError as e:
            return Response({"detail": e.message}, status=status.HTTP_400_BAD_REQUEST)
        return Response(close_row(c), status=status.HTTP_201_CREATED)
    day = _day(request)
    if day != timezone.localdate() and not can(request.user, "pos.close_past"):
        return Response({"detail": "فقط صندوق امروز را می‌توانید ببینید."}, status=status.HTTP_403_FORBIDDEN)
    done = TillClose.objects.filter(day=day).select_related("closed_by").first()
    history = TillClose.objects.select_related("closed_by")[:31]
    return Response({"drawer": drawer(day), "closed": close_row(done) if done else None, "history": [close_row(c) for c in history]})
