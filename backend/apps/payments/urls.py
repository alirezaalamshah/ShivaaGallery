from django.urls import path

from . import views

urlpatterns = [
    path("payments/start/", views.start),
    path("payments/callback/<int:pk>/", views.callback),
    path("payments/fake/<str:authority>/", views.fake_gateway),
]
