from datetime import date, datetime, time, timedelta

from django.db.models import Count, Prefetch, Q, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework import permissions, serializers, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.accounts.roles import is_seller
from apps.accounts.serializers import OptionalPhoneField
from apps.catalog.models import Product, Variant
from apps.catalog.search import spellings
from apps.core.models import StoreSettings

from .models import Sale
from .services import SaleError, create_sale, void_sale


class IsSellerOrAdmin(permissions.BasePermission):
    message = "فقط فروشنده یا مدیر فروشگاه به صندوق دسترسی دارد."

    def has_permission(self, request, view):
        u = request.user
        return bool(u and u.is_authenticated and (u.is_staff or is_seller(u)))


class LineSerializer(serializers.Serializer):
    variant = serializers.IntegerField(min_value=1)
    qty = serializers.IntegerField(min_value=1, max_value=50)


class SaleInSerializer(serializers.Serializer):
    lines = LineSerializer(many=True, allow_empty=False)
    discount = serializers.IntegerField(min_value=0, default=0)
    cash = serializers.IntegerField(min_value=0, default=0)
    card = serializers.IntegerField(min_value=0, default=0)
    transfer = serializers.IntegerField(min_value=0, default=0)
    customer_name = serializers.CharField(max_length=80, required=False, allow_blank=True)
    customer_phone = OptionalPhoneField(required=False, allow_blank=True)
    note = serializers.CharField(max_length=300, required=False, allow_blank=True)
    client_key = serializers.CharField(max_length=40, required=False, allow_blank=True)


def sale_row(sale, with_items=True):
    row = {
        "id": sale.id, "number": sale.number, "created_at": sale.created_at, "status": sale.status,
        "status_label": sale.get_status_display(), "seller": sale.seller.get_full_name() or sale.seller.username,
        "customer_name": sale.customer_name, "customer_phone": sale.customer_phone, "note": sale.note,
        "subtotal": sale.subtotal, "discount": sale.discount, "total": sale.total,
        "cash": sale.cash, "card": sale.card, "transfer": sale.transfer,
        "void_reason": sale.void_reason, "voided_at": sale.voided_at,
    }
    if with_items:
        row["items"] = [
            {"variant": i.variant_id, "product_name": i.product_name, "color_name": i.color_name, "size_label": i.size_label,
             "sku": i.sku, "unit_price": i.unit_price, "qty": i.qty, "line_total": i.line_total}
            for i in sale.items.all()
        ]
    else:
        row["item_count"] = sum(i.qty for i in sale.items.all())
    return row


def _visible_sales(request):
    """A seller sees only their own sales; the admin sees everyone's."""
    qs = Sale.objects.select_related("seller").prefetch_related("items")
    return qs if request.user.is_staff else qs.filter(seller=request.user)


def _day(request):
    try:
        return date.fromisoformat(request.query_params.get("date", ""))
    except ValueError:
        return timezone.localdate()


def _day_range(day):
    start = timezone.make_aware(datetime.combine(day, time.min))
    return start, start + timedelta(days=1)


def _image(request, product):
    first = next(iter(product.images.all()), None)
    return request.build_absolute_uri(first.image.url) if first else None


@api_view(["GET"])
@permission_classes([IsSellerOrAdmin])
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
    # The till shows the seller how much discount they may give; the admin has no limit.
    max_discount = None if request.user.is_staff else StoreSettings.load().seller_max_discount
    return Response({"exact": exact.id if exact else None, "products": rows, "max_discount": max_discount})


@api_view(["GET", "POST"])
@permission_classes([IsSellerOrAdmin])
def sales(request):
    if request.method == "POST":
        d = SaleInSerializer(data=request.data)
        d.is_valid(raise_exception=True)
        try:
            sale = create_sale(request.user, d.validated_data)
        except SaleError as e:
            return Response({"detail": e.message, "lines": e.lines}, status=status.HTTP_409_CONFLICT)
        return Response(sale_row(_visible_sales(request).get(pk=sale.pk)), status=status.HTTP_201_CREATED)

    start, end = _day_range(_day(request))
    qs = _visible_sales(request).filter(created_at__gte=start, created_at__lt=end)
    if request.user.is_staff and request.query_params.get("seller", "").isdigit():
        qs = qs.filter(seller_id=request.query_params["seller"])
    q = request.query_params.get("search", "").strip()
    if q:
        qs = qs.filter(Q(number__icontains=q) | Q(customer_phone__icontains=q) | Q(customer_name__icontains=q))
    done = qs.filter(status=Sale.Status.COMPLETED)
    totals = done.aggregate(
        count=Count("id"), total=Coalesce(Sum("total"), 0), cash=Coalesce(Sum("cash"), 0),
        card=Coalesce(Sum("card"), 0), transfer=Coalesce(Sum("transfer"), 0), discount=Coalesce(Sum("discount"), 0),
    )
    totals["pieces"] = done.aggregate(n=Coalesce(Sum("items__qty"), 0))["n"]
    totals["voided"] = qs.filter(status=Sale.Status.VOIDED).count()
    return Response({"date": start.date().isoformat(), "totals": totals, "results": [sale_row(x, with_items=False) for x in qs]})


@api_view(["GET"])
@permission_classes([IsSellerOrAdmin])
def sale_detail(request, pk):
    sale = _visible_sales(request).filter(pk=pk).first()
    if sale is None:
        return Response({"detail": "فاکتور پیدا نشد."}, status=status.HTTP_404_NOT_FOUND)
    return Response(sale_row(sale))


@api_view(["POST"])
@permission_classes([IsSellerOrAdmin])
def sale_void(request, pk):
    if not request.user.is_staff:
        return Response({"detail": "فقط مدیر می‌تواند فروش را باطل کند."}, status=status.HTTP_403_FORBIDDEN)
    sale = _visible_sales(request).filter(pk=pk).first()
    if sale is None:
        return Response({"detail": "فاکتور پیدا نشد."}, status=status.HTTP_404_NOT_FOUND)
    try:
        void_sale(sale, request.user, str(request.data.get("reason", "")))
    except SaleError as e:
        return Response({"detail": e.message}, status=status.HTTP_409_CONFLICT)
    return Response(sale_row(_visible_sales(request).get(pk=pk)))
