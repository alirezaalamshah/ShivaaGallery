from django.urls import path
from rest_framework.routers import DefaultRouter

from . import customer_views, views

router = DefaultRouter()
router.register("products", views.ProductViewSet, basename="product")
router.register("categories", views.CategoryViewSet, basename="category")
router.register("facets", views.FacetViewSet, basename="facet")

urlpatterns = [
    path("home/", views.home),
    path("favorites/", customer_views.favorites),
    path("favorites/<int:product_id>/", customer_views.favorite_remove),
    path("stock-alerts/", customer_views.stock_alert),
    path("products/<str:slug>/reviews/", customer_views.reviews),
] + router.urls
