from django.conf import settings
from django.contrib import admin
from django.urls import include, path, re_path
from django.views.static import serve

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("apps.core.urls")),
    path("api/", include("apps.catalog.urls")),
    path("api/", include("apps.accounts.urls")),
    path("api/", include("apps.orders.urls")),
    path("api/", include("apps.payments.urls")),
    path("api/admin/", include("apps.pos.urls")),
    path("api/admin/", include("apps.finance.urls")),
    path("api/admin/", include("apps.panel.urls")),
]



def cached(seconds):
    """Django's file view, telling browsers and the site's image resizer how long they may keep the file."""

    def view(request, path, document_root):
        response = serve(request, path, document_root=document_root)
        if response.status_code == 200:
            response["Cache-Control"] = f"public, max-age={seconds}"
        return response

    return view


if settings.SERVE_FILES:
    urlpatterns += [
        # Uploads get a new name every time (apps/panel/images.py), so a file never changes in place.
        re_path(r"^media/(?P<path>.*)$", cached(60 * 60 * 24 * 30), {"document_root": settings.MEDIA_ROOT}),
        re_path(r"^static/(?P<path>.*)$", cached(60 * 60 * 24), {"document_root": settings.STATIC_ROOT}),
    ]
