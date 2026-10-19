from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("products", views.ProductViewSet, basename="admin-product")
router.register("product-images", views.ProductImageViewSet, basename="admin-product-image")
router.register("variants", views.VariantViewSet, basename="admin-variant")
router.register("categories", views.CategoryViewSet, basename="admin-category")
router.register("colors", views.ColorViewSet, basename="admin-color")
router.register("size-systems", views.SizeSystemViewSet, basename="admin-size-system")
router.register("shipping-methods", views.ShippingMethodViewSet, basename="admin-shipping")
router.register("discounts", views.DiscountCodeViewSet, basename="admin-discount")
router.register("orders", views.OrderViewSet, basename="admin-order")
router.register("stock-movements", views.MovementViewSet, basename="admin-movement")

urlpatterns = [
    path("store/", views.store_settings),
    path("dashboard/", views.dashboard),
] + router.urls
