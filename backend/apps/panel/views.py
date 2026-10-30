import csv
from datetime import date, datetime, time, timedelta

from django.contrib.auth import get_user_model
from django.http import HttpResponse
from django.db import transaction
from django.db.models import Count, Max, ProtectedError, Q, Sum
from django.db.models.functions import Coalesce, TruncDate
from django.utils import timezone
from rest_framework import filters, permissions, status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.exceptions import ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from apps.accounts.roles import role_of, seller_group
from apps.catalog.models import Category, Color, Product, ProductImage, Review, SizeSystem, StockAlert, Variant
from apps.core.jalali import jalali_datetime
from apps.core.models import StoreSettings
from apps.inventory.models import StockMovement
from apps.inventory.services import InsufficientStock, move_stock
from apps.orders.models import DiscountCode, Order, ReturnRequest, ShippingMethod
from apps.orders.services import CheckoutError, change_return_status, change_status, expire_unpaid_soon, set_tracking_code
from apps.pos.models import Sale

from . import serializers as s
from .images import LOGO_SIZE, prepare_photo

# With four or five pieces of each model, one left is worth a warning.
LOW_STOCK = 1


class IsStaff(permissions.BasePermission):
    message = "فقط مدیر فروشگاه به این بخش دسترسی دارد."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_staff)


class StaffMixin:
    permission_classes = [IsStaff]

    def destroy(self, request, *args, **kwargs):
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            return Response({"detail": "این مورد در جای دیگری استفاده شده و قابل حذف نیست. می‌توانید غیرفعالش کنید."}, status=status.HTTP_409_CONFLICT)


class ColorViewSet(StaffMixin, viewsets.ModelViewSet):
    queryset = Color.objects.all()
    serializer_class = s.ColorSerializer
    pagination_class = None


class SizeSystemViewSet(StaffMixin, viewsets.ModelViewSet):
    queryset = SizeSystem.objects.prefetch_related("sizes")
    serializer_class = s.SizeSystemSerializer
    pagination_class = None


class CategoryViewSet(StaffMixin, viewsets.ModelViewSet):
    serializer_class = s.CategorySerializer
    pagination_class = None
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_queryset(self):
        return Category.objects.annotate(product_count=Count("products"))


class ProductViewSet(StaffMixin, viewsets.ModelViewSet):
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["name", "variants__sku"]
    ordering_fields = ["created_at", "price", "name", "total_stock"]
    ordering = ["-created_at"]

    def get_queryset(self):
        qs = Product.objects.select_related("category")
        if self.action == "list":
            qs = qs.annotate(
                total_stock=Coalesce(Sum("variants__stock", filter=Q(variants__is_active=True)), 0),
                variant_count=Count("variants", filter=Q(variants__is_active=True), distinct=True),
                out_count=Count("variants", filter=Q(variants__is_active=True, variants__stock=0), distinct=True),
                sale_count=Count("variants", filter=Q(variants__is_active=True, variants__sale_price__isnull=False), distinct=True),
            ).prefetch_related("images")
            p = self.request.query_params
            if p.get("category"):
                qs = qs.filter(category_id__in=Category.objects.get(pk=p["category"]).descendant_ids())
            if p.get("active") in ("true", "false"):
                qs = qs.filter(is_active=p["active"] == "true")
            if p.get("stock") == "out":
                qs = qs.filter(out_count__gt=0)
            return qs.distinct()
        return qs.prefetch_related("images", "variants__color", "variants__size")

    def get_serializer_class(self):
        return s.ProductListSerializer if self.action == "list" else s.ProductSerializer

    def _detail(self, product):
        product = self.get_queryset().get(pk=product.pk)
        return Response(s.ProductSerializer(product, context={"request": self.request}).data)

    def destroy(self, request, *args, **kwargs):
        product = self.get_object()
        if Variant.objects.filter(product=product, order_items__isnull=False).exists():
            return Response({"detail": "این محصول در سفارش‌ها استفاده شده و قابل حذف نیست. می‌توانید آن را از نمایش در سایت خارج کنید."}, status=status.HTTP_409_CONFLICT)
        with transaction.atomic():
            StockMovement.objects.filter(variant__product=product).delete()
            product.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"], parser_classes=[MultiPartParser, FormParser])
    def images(self, request, pk=None):
        product = self.get_object()
        files = request.FILES.getlist("files")
        if not files:
            raise ValidationError({"files": "حداقل یک عکس انتخاب کنید."})
        color = request.data.get("color") or None
        if color and not Color.objects.filter(pk=color).exists():
            raise ValidationError({"color": "رنگ انتخاب‌شده وجود ندارد."})
        start = product.images.count()
        prepared = [prepare_photo(f) for f in files]  # validate every file before saving any
        for i, content in enumerate(prepared):
            img = ProductImage(product=product, color_id=color, alt=product.name, sort=start + i)
            img.image.save(content.name, content, save=True)
        return self._detail(product)

    @action(detail=True, methods=["post"], url_path="images/reorder")
    def reorder_images(self, request, pk=None):
        product = self.get_object()
        ids = [int(x) for x in request.data.get("ids", [])]
        for i, image_id in enumerate(ids):
            product.images.filter(pk=image_id).update(sort=i)
        return self._detail(product)

    @action(detail=True, methods=["post"])
    def matrix(self, request, pk=None):
        """Set which colors × sizes are sold, with the stock and prices of each. Missing combinations are deactivated, never deleted."""
        product = self.get_object()
        m = s.MatrixSerializer(data=request.data)
        m.is_valid(raise_exception=True)
        colors, sizes, stock = m.validated_data["colors"], m.validated_data["sizes"], m.validated_data.get("stock", {})
        base = m.validated_data.get("stock_base", {})
        prices, sales = m.validated_data.get("prices"), m.validated_data.get("sale_prices")
        if prices is not None and sales is not None:
            for color in colors:
                for size in sizes:
                    k = f"{color.pk}-{size.pk}"
                    regular = prices.get(k) or product.price
                    if sales.get(k) is not None and sales[k] >= regular:
                        return Response(
                            {"sale_prices": f"قیمت حراج {color.name} سایز {size.label} باید کمتر از قیمت آن باشد."},
                            status=status.HTTP_400_BAD_REQUEST,
                        )
        with transaction.atomic():
            # The panel sends the stock it showed. If an order or an in-store sale changed it since,
            # saving would silently undo that sale, so stop and let the admin see the new numbers.
            current = {
                f"{v.color_id}-{v.size_id}": v
                for v in Variant.objects.select_for_update().select_related("color", "size").filter(product=product)
            }
            moved = [
                f"{current[k].color.name} سایز {current[k].size.label}"
                for k, shown in base.items() if k in current and k in stock and current[k].stock != shown
            ]
            if moved:
                return Response(
                    {"detail": f"موجودی {'، '.join(moved)} در این فاصله تغییر کرد (فروش یا لغو سفارش). صفحه را تازه کنید و دوباره ذخیره کنید.", "code": "stock_changed"},
                    status=status.HTTP_409_CONFLICT,
                )
            wanted = set()
            for color in colors:
                for size in sizes:
                    v, _ = Variant.objects.get_or_create(product=product, color=color, size=size)
                    wanted.add(v.pk)
                    changed = []
                    if not v.is_active:
                        v.is_active = True
                        changed.append("is_active")
                    k = f"{color.pk}-{size.pk}"
                    if prices is not None and prices.get(k) != v.price_override:
                        v.price_override = prices.get(k)
                        changed.append("price_override")
                    if sales is not None and sales.get(k) != v.sale_price:
                        v.sale_price = sales.get(k)
                        changed.append("sale_price")
                    if changed:
                        v.save(update_fields=changed)
                    target = stock.get(f"{color.pk}-{size.pk}")
                    if target is not None and target != v.stock:
                        move_stock(v, target - v.stock, StockMovement.Reason.ADJUST, note="جدول تنوع‌ها", user=request.user)
            product.variants.exclude(pk__in=wanted).update(is_active=False)
        return self._detail(product)


class ProductImageViewSet(StaffMixin, viewsets.mixins.UpdateModelMixin, viewsets.mixins.DestroyModelMixin, viewsets.GenericViewSet):
    queryset = ProductImage.objects.all()
    serializer_class = s.ImageSerializer

    def perform_destroy(self, instance):
        instance.image.delete(save=False)
        instance.delete()


class VariantViewSet(StaffMixin, viewsets.mixins.ListModelMixin, viewsets.mixins.UpdateModelMixin, viewsets.GenericViewSet):
    """Every color and size on sale, for the stock page where in-store sales and new stock are recorded."""

    filter_backends = [filters.SearchFilter]
    search_fields = ["product__name", "sku", "color__name", "size__label"]
    pagination_class = type("StockPages", (PageNumberPagination,), {"page_size": 80})

    def get_queryset(self):
        qs = Variant.objects.select_related("product", "color", "size").prefetch_related("product__images")
        if self.action == "list":
            qs = qs.filter(is_active=True).order_by("product__name", "product_id", "color__sort", "size__sort")
            if self.request.query_params.get("stock") == "low":
                qs = qs.filter(stock__lte=LOW_STOCK)
        return qs

    def get_serializer_class(self):
        return s.StockRowSerializer if self.action in ("list", "move") else s.VariantSerializer

    @action(detail=True, methods=["post"])
    def move(self, request, pk=None):
        """Record one stock change: an in-store sale, new stock arriving, a return, or a correction."""
        v = self.get_object()
        d = s.StockMoveSerializer(data=request.data)
        d.is_valid(raise_exception=True)
        kind, qty = d.validated_data["kind"], d.validated_data["qty"]
        reason, sign = s.StockMoveSerializer.KINDS[kind]
        try:
            move_stock(v, sign * qty, reason, note=d.validated_data.get("note", ""), user=request.user)
        except InsufficientStock as e:
            return Response({"detail": f"فقط {e.available} عدد موجود است."}, status=status.HTTP_409_CONFLICT)
        return Response(s.StockRowSerializer(self.get_queryset().get(pk=v.pk), context={"request": request}).data)

    @action(detail=True, methods=["post"])
    def stock(self, request, pk=None):
        v = self.get_object()
        d = s.StockSetSerializer(data=request.data)
        d.is_valid(raise_exception=True)
        delta = d.validated_data["stock"] - v.stock
        if delta:
            reason = StockMovement.Reason.RECEIVE if delta > 0 else StockMovement.Reason.ADJUST
            try:
                move_stock(v, delta, reason, note=d.validated_data.get("note", ""), user=request.user)
            except InsufficientStock:
                return Response({"detail": "موجودی تغییر کرد. دوباره امتحان کنید."}, status=status.HTTP_409_CONFLICT)
        return Response(s.VariantSerializer(Variant.objects.select_related("product", "color", "size").get(pk=v.pk)).data)


class ShippingMethodViewSet(StaffMixin, viewsets.ModelViewSet):
    queryset = ShippingMethod.objects.all()
    serializer_class = s.ShippingMethodSerializer
    pagination_class = None


class DiscountCodeViewSet(StaffMixin, viewsets.ModelViewSet):
    queryset = DiscountCode.objects.all()
    serializer_class = s.DiscountCodeSerializer
    pagination_class = None


class OrderViewSet(StaffMixin, viewsets.ReadOnlyModelViewSet):
    filter_backends = [filters.SearchFilter]
    search_fields = ["number", "phone", "receiver_name"]

    def get_queryset(self):
        qs = Order.objects.order_by("-created_at")
        if self.action in ("list", "export"):
            expire_unpaid_soon()
            qs = qs.annotate(item_count=Sum("items__qty"))
            p = self.request.query_params
            st = p.get("status")
            if st == "open":
                qs = qs.filter(status__in=Order.OPEN)
            elif st:
                qs = qs.filter(status=st)
            if p.get("user", "").isdigit():
                qs = qs.filter(user_id=p["user"])
            return filter_dates(qs, p)
        return qs.prefetch_related("items", "events", "payments", "returns__items__order_item")

    def get_serializer_class(self):
        return s.AdminOrderListSerializer if self.action == "list" else s.AdminOrderSerializer

    @action(detail=False)
    def export(self, request):
        """The listed orders (same filters and search) as a CSV file that Excel opens with Persian text intact."""
        orders = self.filter_queryset(self.get_queryset()).prefetch_related("items")[:5000]
        res = HttpResponse(content_type="text/csv; charset=utf-8")
        res["Content-Disposition"] = f'attachment; filename="orders-{timezone.localdate():%Y%m%d}.csv"'
        res.write("\ufeff")  # BOM: tells Excel the file is UTF-8
        w = csv.writer(res)
        w.writerow([
            "شماره سفارش", "تاریخ", "وضعیت", "تحویل‌گیرنده", "موبایل", "استان", "شهر", "آدرس", "کد پستی",
            "اقلام", "تعداد", "جمع کالاها", "هزینه ارسال", "کد تخفیف", "تخفیف", "مبلغ کل", "روش ارسال", "کد رهگیری",
        ])
        for o in orders:
            items = list(o.items.all())
            w.writerow([
                o.number, jalali_datetime(o.created_at), o.get_status_display(), o.receiver_name, o.phone, o.province, o.city,
                o.address, o.postal_code, " | ".join(f"{i.product_name} {i.color_name} {i.size_label} ×{i.qty}" for i in items),
                sum(i.qty for i in items), o.subtotal, o.shipping_fee, o.discount_code, o.discount_amount, o.total,
                o.shipping_name, o.tracking_code,
            ])
        return res

    @action(detail=True, methods=["post"])
    def update_status(self, request, pk=None):
        order = self.get_object()
        d = s.StatusChangeSerializer(data=request.data)
        d.is_valid(raise_exception=True)
        data = d.validated_data
        try:
            if data.get("status") and data["status"] != order.status:
                order = change_status(order, data["status"], by=request.user, note=data.get("note", ""), tracking_code=data.get("tracking_code"))
            elif "tracking_code" in data:
                order = set_tracking_code(order, data["tracking_code"])
        except CheckoutError as e:
            return Response({"detail": e.message}, status=status.HTTP_409_CONFLICT)
        if "admin_note" in data:
            Order.objects.filter(pk=order.pk).update(admin_note=data["admin_note"])
        return Response(s.AdminOrderSerializer(self.get_queryset().get(pk=order.pk)).data)


def filter_dates(qs, params, field="created_at"):
    """?from=YYYY-MM-DD&to=YYYY-MM-DD, both days included, in the store's time zone."""
    for key, lookup, shift in (("from", "gte", 0), ("to", "lt", 1)):
        try:
            day = date.fromisoformat(params.get(key, ""))
        except ValueError:
            continue
        edge = timezone.make_aware(datetime.combine(day + timedelta(days=shift), time.min))
        qs = qs.filter(**{f"{field}__{lookup}": edge})
    return qs


class ReviewViewSet(StaffMixin, viewsets.mixins.ListModelMixin, viewsets.mixins.UpdateModelMixin, viewsets.mixins.DestroyModelMixin, viewsets.GenericViewSet):
    """Buyers' reviews waiting for approval, and the published and rejected ones."""

    serializer_class = s.ReviewSerializer

    def get_queryset(self):
        qs = Review.objects.select_related("product", "user")
        st = self.request.query_params.get("status")
        return qs.filter(status=st) if st else qs


class ReturnViewSet(StaffMixin, viewsets.ReadOnlyModelViewSet):
    serializer_class = s.AdminReturnSerializer

    def get_queryset(self):
        qs = ReturnRequest.objects.select_related("order").prefetch_related("items__order_item")
        st = self.request.query_params.get("status")
        if st == "open":
            return qs.filter(status__in=["pending", "approved"])
        return qs.filter(status=st) if st else qs

    @action(detail=True, methods=["post"])
    def update_status(self, request, pk=None):
        req = self.get_object()
        try:
            change_return_status(req, request.data.get("status"), by=request.user, admin_note=request.data.get("admin_note"))
        except CheckoutError as e:
            return Response({"detail": e.message}, status=status.HTTP_409_CONFLICT)
        return Response(s.AdminReturnSerializer(self.get_queryset().get(pk=req.pk)).data)


class MovementViewSet(StaffMixin, viewsets.ReadOnlyModelViewSet):
    serializer_class = s.MovementSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ["variant__product__name", "variant__sku", "reference", "note"]

    def get_queryset(self):
        qs = StockMovement.objects.select_related("variant__product", "variant__color", "variant__size", "created_by")
        reason = self.request.query_params.get("reason")
        return qs.filter(reason=reason) if reason else qs


@api_view(["GET", "PATCH"])
@permission_classes([IsStaff])
def store_settings(request):
    store = StoreSettings.load()
    if request.method == "PATCH":
        data = request.data.copy() if hasattr(request.data, "copy") else dict(request.data)
        logo = request.FILES.get("logo")
        if logo:
            data.pop("logo", None)
        ser = s.StoreSettingsSerializer(store, data=data, partial=True, context={"request": request})
        ser.is_valid(raise_exception=True)
        store = ser.save()
        if logo:
            content = prepare_photo(logo, LOGO_SIZE)
            store.logo.save(content.name, content, save=True)
        elif request.data.get("logo") == "":
            store.logo.delete(save=True)
    return Response(s.StoreSettingsSerializer(store, context={"request": request}).data)


@api_view(["GET"])
@permission_classes([IsStaff])
def dashboard(request):
    expire_unpaid_soon()
    now = timezone.now()
    today = timezone.localtime(now).replace(hour=0, minute=0, second=0, microsecond=0)
    # Only paid orders are sales; an order waiting for payment may never be paid.
    live = Order.objects.filter(status__in=Order.SOLD)
    week_start = today - timedelta(days=6)
    by_day = dict(
        live.filter(created_at__gte=week_start).annotate(day=TruncDate("created_at")).values("day")
        .annotate(total=Sum("total")).values_list("day", "total")
    )
    days = [(week_start + timedelta(days=i)).date() for i in range(7)]
    low = (
        Variant.objects.filter(is_active=True, product__is_active=True, stock__lte=LOW_STOCK)
        .select_related("product", "color", "size").order_by("stock", "product__name")[:12]
    )
    store_sales = Sale.objects.filter(status=Sale.Status.COMPLETED, created_at__gte=today)
    return Response({
        "store_sales_today": store_sales.aggregate(t=Coalesce(Sum("total"), 0))["t"],
        "store_sales_count": store_sales.count(),
        "reviews_pending": Review.objects.filter(status=Review.Status.PENDING).count(),
        "returns_open": ReturnRequest.objects.filter(status__in=["pending", "approved"]).count(),
        "stock_alerts": StockAlert.objects.filter(notified_at__isnull=True).count(),
        "sales_today": live.filter(created_at__gte=today).aggregate(t=Coalesce(Sum("total"), 0))["t"],
        "orders_today": live.filter(created_at__gte=today).count(),
        "sales_week": [{"day": d.isoformat(), "total": by_day.get(d, 0)} for d in days],
        "orders_open": Order.objects.filter(status__in=Order.OPEN).count(),
        "orders_to_ship": Order.objects.filter(status__in=["paid", "processing"]).count(),
        "orders_unpaid": Order.objects.filter(status=Order.Status.AWAITING_PAYMENT).count(),
        "products_active": Product.objects.filter(is_active=True).count(),
        "variants_out": Variant.objects.filter(is_active=True, product__is_active=True, stock=0).count(),
        "low_stock": [
            {"variant": v.pk, "product_id": v.product_id, "product": v.product.name, "color": v.color.name, "color_hex": v.color.hex, "size": v.size.label, "stock": v.stock}
            for v in low
        ],
        "recent_orders": s.AdminOrderListSerializer(
            Order.objects.annotate(item_count=Sum("items__qty")).order_by("-created_at")[:6], many=True
        ).data,
        "status_labels": dict(Order.Status.choices),
    })


@api_view(["GET"])
@permission_classes([IsStaff])
def customers(request):
    """Customers who have ordered, with how much they have bought, most recent first."""
    qs = (
        get_user_model().objects.filter(is_staff=False, orders__isnull=False).exclude(groups__name="seller")
        .annotate(
            order_count=Count("orders", distinct=True),
            spent=Coalesce(Sum("orders__total", filter=Q(orders__status__in=Order.SOLD)), 0),
            last_order=Max("orders__created_at"),
        )
        .order_by("-last_order")
    )
    q = request.query_params.get("search", "").strip()
    if q:
        qs = qs.filter(Q(username__icontains=q) | Q(first_name__icontains=q) | Q(last_name__icontains=q) | Q(orders__receiver_name__icontains=q)).distinct()
    rows = []
    for u in qs[:300]:
        name = u.get_full_name() or u.orders.order_by("-created_at").values_list("receiver_name", flat=True).first() or ""
        rows.append({"id": u.pk, "phone": u.username, "name": name, "order_count": u.order_count, "spent": u.spent, "last_order": u.last_order})
    return Response(rows)


def member_row(u):
    return {
        "id": u.pk, "username": u.username, "first_name": u.first_name, "last_name": u.last_name,
        "role": "admin" if u.is_staff else "seller", "is_active": u.is_active,
        "last_login": u.last_login, "date_joined": u.date_joined,
    }


def _team():
    return get_user_model().objects.filter(Q(is_staff=True) | Q(groups__name="seller")).distinct().order_by("-is_staff", "username")


@api_view(["GET", "POST"])
@permission_classes([IsStaff])
def team(request):
    """The admins, and the sellers who may use only the till. Admins add and edit sellers here."""
    if request.method == "GET":
        return Response([member_row(u) for u in _team()])
    d = s.SellerSerializer(data=request.data)
    d.is_valid(raise_exception=True)
    v = d.validated_data
    if not v.get("password"):
        return Response({"password": ["رمز عبور را وارد کنید."]}, status=status.HTTP_400_BAD_REQUEST)
    if get_user_model().objects.filter(username__iexact=v["username"]).exists():
        return Response({"username": ["این نام کاربری قبلاً استفاده شده است."]}, status=status.HTTP_400_BAD_REQUEST)
    with transaction.atomic():
        user = get_user_model().objects.create_user(
            v["username"], password=v["password"], first_name=v.get("first_name", ""), last_name=v.get("last_name", ""),
        )
        user.groups.add(seller_group())
    return Response(member_row(user), status=status.HTTP_201_CREATED)


@api_view(["PATCH"])
@permission_classes([IsStaff])
def team_member(request, pk):
    user = _team().filter(pk=pk).first()
    if user is None:
        return Response({"detail": "کاربر پیدا نشد."}, status=status.HTTP_404_NOT_FOUND)
    if user.is_staff:
        return Response({"detail": "حساب مدیرها از این‌جا تغییر نمی‌کند."}, status=status.HTTP_403_FORBIDDEN)
    d = s.SellerSerializer(data=request.data, partial=True)
    d.is_valid(raise_exception=True)
    v = d.validated_data
    for field in ("first_name", "last_name", "is_active"):
        if field in v:
            setattr(user, field, v[field])
    if v.get("password"):
        user.set_password(v["password"])
    user.save()
    return Response(member_row(user))
