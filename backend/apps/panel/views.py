from datetime import timedelta

from django.db import transaction
from django.db.models import Count, ProtectedError, Q, Sum
from django.db.models.functions import Coalesce, TruncDate
from django.utils import timezone
from rest_framework import filters, permissions, status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from apps.catalog.models import Category, Color, Product, ProductImage, SizeSystem, Variant
from apps.core.models import StoreSettings
from apps.inventory.models import StockMovement
from apps.inventory.services import InsufficientStock, move_stock
from apps.orders.models import DiscountCode, Order, ShippingMethod
from apps.orders.services import CheckoutError, change_status

from . import serializers as s
from .images import prepare_photo

LOW_STOCK = 2


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
        """Set which colors × sizes are sold and the stock of each. Missing combinations are deactivated, never deleted."""
        product = self.get_object()
        m = s.MatrixSerializer(data=request.data)
        m.is_valid(raise_exception=True)
        colors, sizes, stock = m.validated_data["colors"], m.validated_data["sizes"], m.validated_data.get("stock", {})
        with transaction.atomic():
            wanted = set()
            for color in colors:
                for size in sizes:
                    v, _ = Variant.objects.get_or_create(product=product, color=color, size=size)
                    wanted.add(v.pk)
                    if not v.is_active:
                        v.is_active = True
                        v.save(update_fields=["is_active"])
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


class VariantViewSet(StaffMixin, viewsets.mixins.UpdateModelMixin, viewsets.GenericViewSet):
    queryset = Variant.objects.select_related("product", "color", "size")
    serializer_class = s.VariantSerializer

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
        qs = Order.objects.all()
        if self.action == "list":
            qs = qs.annotate(item_count=Sum("items__qty"))
            st = self.request.query_params.get("status")
            if st == "open":
                qs = qs.filter(status__in=["awaiting_payment", "paid", "processing"])
            elif st:
                qs = qs.filter(status=st)
            return qs
        return qs.prefetch_related("items", "events")

    def get_serializer_class(self):
        return s.AdminOrderListSerializer if self.action == "list" else s.AdminOrderSerializer

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
                order.tracking_code = data["tracking_code"]
                order.save(update_fields=["tracking_code", "updated_at"])
        except CheckoutError as e:
            return Response({"detail": e.message}, status=status.HTTP_409_CONFLICT)
        if "admin_note" in data:
            Order.objects.filter(pk=order.pk).update(admin_note=data["admin_note"])
        return Response(s.AdminOrderSerializer(self.get_queryset().get(pk=order.pk)).data)


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
            content = prepare_photo(logo)
            store.logo.save(content.name, content, save=True)
        elif request.data.get("logo") == "":
            store.logo.delete(save=True)
    return Response(s.StoreSettingsSerializer(store, context={"request": request}).data)


@api_view(["GET"])
@permission_classes([IsStaff])
def dashboard(request):
    now = timezone.now()
    today = timezone.localtime(now).replace(hour=0, minute=0, second=0, microsecond=0)
    live = Order.objects.exclude(status=Order.Status.CANCELLED)
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
    return Response({
        "sales_today": live.filter(created_at__gte=today).aggregate(t=Coalesce(Sum("total"), 0))["t"],
        "orders_today": live.filter(created_at__gte=today).count(),
        "sales_week": [{"day": d.isoformat(), "total": by_day.get(d, 0)} for d in days],
        "orders_open": Order.objects.filter(status__in=["awaiting_payment", "paid", "processing"]).count(),
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
