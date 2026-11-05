from django.urls import path
from rest_framework.routers import DefaultRouter

from . import customers, stock, views

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
router.register("reviews", views.ReviewViewSet, basename="admin-review")
router.register("returns", views.ReturnViewSet, basename="admin-return")
router.register("banners", views.BannerViewSet, basename="admin-banner")

urlpatterns = [
    path("store/", views.store_settings),
    path("dashboard/", views.dashboard),
    path("badges/", views.badges),
    path("stock/", stock.overview),
    path("stock/count/", stock.count),
    path("stock/deductions/", stock.deductions),
    path("stock/stale/", stock.stale),
    path("customers/", customers.customers),
    path("customers/export/", customers.customers_export),
    path("customers/<str:phone>/", customers.customer_detail),
    path("team/", views.team),
    path("team/<int:pk>/", views.team_member),
] + router.urls
