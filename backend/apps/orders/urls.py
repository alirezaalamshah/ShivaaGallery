from django.urls import path

from . import views

urlpatterns = [
    path("shipping-methods/", views.shipping_methods),
    path("cart/validate/", views.cart_validate),
    path("checkout/quote/", views.checkout_quote),
    path("orders/", views.orders),
    path("orders/track/", views.track),
    path("orders/<str:number>/", views.order_detail),
    path("orders/<str:number>/cancel/", views.order_cancel),
    path("orders/<str:number>/return/", views.order_return),
]
