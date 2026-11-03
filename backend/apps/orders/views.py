from django.db.models import Count, OuterRef, Subquery
from rest_framework import permissions, status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle

from apps.accounts.models import Address
from apps.accounts.roles import is_panel_user

from .models import Order, OrderItem, ShippingMethod
from .serializers import (
    CartSerializer, CheckoutSerializer, OrderSerializer, OrderSummarySerializer, QuoteSerializer,
    ReturnInSerializer, ShippingMethodSerializer, TrackSerializer,
)
from .services import (
    CheckoutError, cancel_by_customer, expire_unpaid_soon, find_discount, place_order, price_lines, quote, request_return,
)


class TrackThrottle(AnonRateThrottle):
    scope = "track"


def _order_qs():
    return Order.objects.prefetch_related("items", "events")


@api_view(["GET"])
def shipping_methods(request):
    methods = ShippingMethod.objects.filter(is_active=True)
    return Response(ShippingMethodSerializer(methods, many=True).data)


@api_view(["POST"])
def cart_validate(request):
    expire_unpaid_soon()
    s = CartSerializer(data=request.data)
    s.is_valid(raise_exception=True)
    return Response({"lines": price_lines(s.validated_data["lines"])})


@api_view(["POST"])
def checkout_quote(request):
    s = QuoteSerializer(data=request.data)
    s.is_valid(raise_exception=True)
    d = s.validated_data
    result = quote(d["lines"], d.get("city", ""), d.get("shipping_method"), d.get("discount_code", ""), request.user)
    code = d.get("discount_code", "").strip()
    if code:
        discount = find_discount(code)
        result["discount_error"] = (discount.problem(result["subtotal"], request.user) if discount else "این کد معتبر نیست یا تاریخش گذشته است.")
    return Response(result)


@api_view(["GET", "POST"])
@permission_classes([permissions.IsAuthenticated])
def orders(request):
    if request.method == "GET":
        first_image = OrderItem.objects.filter(order=OuterRef("pk")).values("image")[:1]
        qs = (
            Order.objects.filter(user=request.user)
            .annotate(item_count=Count("items"), first_image=Subquery(first_image))
        )
        return Response(OrderSummarySerializer(qs, many=True).data)

    if is_panel_user(request.user):
        return Response({"detail": "با حساب مدیر یا کاربر پنل نمی‌شود سفارش ثبت کرد."}, status=status.HTTP_403_FORBIDDEN)
    s = CheckoutSerializer(data=request.data)
    s.is_valid(raise_exception=True)
    d = s.validated_data
    expire_unpaid_soon()
    try:
        order = place_order(request.user, d)
    except CheckoutError as e:
        return Response({"detail": e.message, "field": e.field, "lines": e.lines}, status=status.HTTP_409_CONFLICT)
    if d["save_address"]:
        Address.objects.update_or_create(
            user=request.user, receiver_name=d["receiver_name"], address=d["address"],
            defaults={
                "province": d.get("province", ""), "city": d["city"], "postal_code": d.get("postal_code", ""),
                "receiver_phone": d.get("receiver_phone", ""),
            },
        )
    return Response(OrderSerializer(_order_qs().get(pk=order.pk)).data, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def order_detail(request, number):
    order = _order_qs().filter(user=request.user, number=number).first()
    if order is None:
        return Response({"detail": "سفارش پیدا نشد."}, status=status.HTTP_404_NOT_FOUND)
    return Response(OrderSerializer(order).data)


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def order_cancel(request, number):
    order = Order.objects.filter(user=request.user, number=number).first()
    if order is None:
        return Response({"detail": "سفارش پیدا نشد."}, status=status.HTTP_404_NOT_FOUND)
    try:
        cancel_by_customer(order, request.user)
    except CheckoutError as e:
        return Response({"detail": e.message}, status=status.HTTP_409_CONFLICT)
    return Response(OrderSerializer(_order_qs().get(pk=order.pk)).data)


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def order_return(request, number):
    order = Order.objects.filter(user=request.user, number=number).first()
    if order is None:
        return Response({"detail": "سفارش پیدا نشد."}, status=status.HTTP_404_NOT_FOUND)
    s = ReturnInSerializer(data=request.data)
    s.is_valid(raise_exception=True)
    try:
        request_return(order, s.validated_data)
    except CheckoutError as e:
        return Response({"detail": e.message}, status=status.HTTP_409_CONFLICT)
    return Response(OrderSerializer(_order_qs().get(pk=order.pk)).data, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@throttle_classes([TrackThrottle])
def track(request):
    """Public order tracking by order number + the phone used for it."""
    s = TrackSerializer(data=request.data)
    s.is_valid(raise_exception=True)
    order = _order_qs().filter(number=s.validated_data["number"], phone=s.validated_data["phone"]).first()
    if order is None:
        return Response({"detail": "سفارشی با این شماره و موبایل پیدا نشد."}, status=status.HTTP_404_NOT_FOUND)
    data = OrderSerializer(order).data
    # Strangers may know a number and phone; keep the street address private.
    for private in ("address", "postal_code", "note", "receiver_phone", "returns", "return_window"):
        data.pop(private)
    return Response(data)
