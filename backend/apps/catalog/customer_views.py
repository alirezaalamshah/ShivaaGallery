"""What signed-in customers do around products: favorites, reviews, and back-in-stock alerts."""

from django.db.models import Avg, Count
from rest_framework import permissions, serializers, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.accounts.roles import role_of
from apps.accounts.serializers import PhoneField
from apps.orders.models import Order, OrderItem

from .models import Favorite, Product, Review, StockAlert, Variant
from .serializers import ProductListSerializer
from .views import ProductViewSet


def _is_customer(user):
    return role_of(user) == "customer"


def _published():
    return ProductViewSet().get_queryset_for_lists()


@api_view(["GET", "POST"])
@permission_classes([permissions.IsAuthenticated])
def favorites(request):
    if request.method == "POST":
        product = Product.objects.published().filter(pk=request.data.get("product")).first()
        if product is None:
            return Response({"detail": "محصول پیدا نشد."}, status=status.HTTP_404_NOT_FOUND)
        Favorite.objects.get_or_create(user=request.user, product=product)
        return Response({"ok": True}, status=status.HTTP_201_CREATED)
    ids = list(Favorite.objects.filter(user=request.user).values_list("product_id", flat=True))
    if request.query_params.get("ids") == "1":
        return Response(ids)
    order = {pid: i for i, pid in enumerate(ids)}
    products = sorted(_published().filter(pk__in=ids), key=lambda p: order[p.pk])
    return Response(ProductListSerializer(products, many=True, context={"request": request}).data)


@api_view(["DELETE"])
@permission_classes([permissions.IsAuthenticated])
def favorite_remove(request, product_id):
    Favorite.objects.filter(user=request.user, product_id=product_id).delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


class StockAlertSerializer(serializers.Serializer):
    variant = serializers.IntegerField()
    phone = PhoneField(required=False)


@api_view(["POST"])
def stock_alert(request):
    d = StockAlertSerializer(data=request.data)
    d.is_valid(raise_exception=True)
    variant = Variant.objects.filter(pk=d.validated_data["variant"], is_active=True, product__is_active=True).first()
    if variant is None:
        return Response({"detail": "این رنگ و سایز پیدا نشد."}, status=status.HTTP_404_NOT_FOUND)
    phone = request.user.username if _is_customer(request.user) else d.validated_data.get("phone")
    if not phone:
        return Response({"phone": ["شماره موبایل را وارد کنید."]}, status=status.HTTP_400_BAD_REQUEST)
    if variant.stock > 0:
        return Response({"detail": "این رنگ و سایز همین حالا موجود است."}, status=status.HTTP_409_CONFLICT)
    StockAlert.objects.get_or_create(variant=variant, phone=phone, notified_at=None)
    return Response({"ok": True, "phone": phone}, status=status.HTTP_201_CREATED)


def bought(user, product):
    """Reviews come only from customers who received this product."""
    return OrderItem.objects.filter(
        order__user=user, order__status__in=[Order.Status.SHIPPED, Order.Status.DELIVERED], variant__product=product,
    ).exists()


class ReviewInSerializer(serializers.Serializer):
    rating = serializers.IntegerField(min_value=1, max_value=5)
    text = serializers.CharField(max_length=1000, required=False, allow_blank=True)


def review_row(r):
    return {"id": r.id, "rating": r.rating, "text": r.text, "author": r.author_name(), "reply": r.reply, "created_at": r.created_at}


@api_view(["GET", "POST"])
def reviews(request, slug):
    product = Product.objects.published().filter(slug=slug).first()
    if product is None:
        return Response({"detail": "محصول پیدا نشد."}, status=status.HTTP_404_NOT_FOUND)
    user = request.user
    mine = Review.objects.filter(product=product, user=user).first() if _is_customer(user) else None

    if request.method == "POST":
        if not _is_customer(user):
            return Response({"detail": "برای ثبت نظر وارد حساب شوید."}, status=status.HTTP_403_FORBIDDEN)
        if not bought(user, product):
            return Response({"detail": "فقط خریداران این محصول می‌توانند نظر بدهند."}, status=status.HTTP_403_FORBIDDEN)
        d = ReviewInSerializer(data=request.data)
        d.is_valid(raise_exception=True)
        # Editing a review sends it back for approval.
        Review.objects.update_or_create(
            product=product, user=user,
            defaults={"rating": d.validated_data["rating"], "text": d.validated_data.get("text", "").strip(), "status": Review.Status.PENDING},
        )
        mine = Review.objects.get(product=product, user=user)

    shown = Review.objects.filter(product=product, status=Review.Status.APPROVED).select_related("user")
    stats = shown.aggregate(avg=Avg("rating"), count=Count("id"))
    return Response({
        "average": round(stats["avg"], 1) if stats["avg"] else None,
        "count": stats["count"],
        "items": [review_row(r) for r in shown[:50]],
        "can_review": _is_customer(user) and bought(user, product),
        "mine": {**review_row(mine), "status": mine.status, "status_label": mine.get_status_display()} if mine else None,
    }, status=status.HTTP_201_CREATED if request.method == "POST" else status.HTTP_200_OK)
