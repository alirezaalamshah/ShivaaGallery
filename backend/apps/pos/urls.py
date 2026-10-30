from django.urls import path

from . import views

urlpatterns = [
    path("pos/lookup/", views.lookup),
    path("pos/sales/", views.sales),
    path("pos/sales/<int:pk>/", views.sale_detail),
    path("pos/sales/<int:pk>/void/", views.sale_void),
]
