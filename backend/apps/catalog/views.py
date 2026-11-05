from collections import defaultdict

from django.db.models import Count, Exists, OuterRef, Prefetch
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import viewsets
from rest_framework.decorators import action, api_view
from rest_framework.filters import OrderingFilter
from rest_framework.response import Response

from apps.core.models import Banner, StoreSettings
from apps.core.serializers import BannerSerializer

from .filters import ProductFilter
from .models import Category, Color, Product, ProductImage, SizeSystem, Variant
from .search import PersianSearchFilter
from .serializers import CategoryTreeSerializer, ColorSerializer, ProductDetailSerializer, ProductListSerializer


class ProductViewSet(viewsets.ReadOnlyModelViewSet):
    lookup_field = "slug"
    lookup_value_regex = "[^/]+"
    filterset_class = ProductFilter
    filter_backends = [DjangoFilterBackend, PersianSearchFilter, OrderingFilter]
    search_fields = ["name", "description", "category__name"]
    ordering_fields = ["current", "created_at"]
    ordering = ["-created_at"]

    def get_queryset(self):
        return self.get_queryset_for_lists()

    def get_queryset_for_lists(self):
        variants = Variant.objects.select_related("color", "size")
        return (
            Product.objects.published()
            .with_prices()
            .select_related("category__parent")
            .prefetch_related(Prefetch("variants", queryset=variants), "images")
        )

    def get_serializer_class(self):
        return ProductDetailSerializer if self.action == "retrieve" else ProductListSerializer

    @action(detail=True)
    def related(self, request, slug=None):
        """Other models from the same category that can still be bought, newest first."""
        product = self.get_object()
        sellable = Variant.objects.filter(product=OuterRef("pk"), is_active=True, stock__gt=0)
        qs = (
            self.get_queryset().filter(category_id__in=product.category.descendant_ids()).exclude(pk=product.pk)
            .filter(Exists(sellable)).order_by("-created_at")[:8]
        )
        return Response(ProductListSerializer(qs, many=True, context={"request": request}).data)


class CategoryViewSet(viewsets.ViewSet):
    """The active category tree, each node with the number of products in its whole subtree."""

    def list(self, request):
        categories = list(Category.objects.filter(is_active=True))
        children = defaultdict(list)
        for c in categories:
            children[c.parent_id].append(c)

        direct = dict(
            Product.objects.published().order_by().values_list("category_id").annotate(n=Count("id"))
        )
        counts = {}

        def subtotal(node):
            counts[node.pk] = direct.get(node.pk, 0) + sum(subtotal(k) for k in children[node.pk])
            return counts[node.pk]

        # Cover photo: the category's own image, else the newest product photo in its subtree.
        own_photo = {}
        for img in ProductImage.objects.filter(product__in=Product.objects.published()).select_related("product").order_by("-product__created_at", "sort"):
            own_photo.setdefault(img.product.category_id, img.image.url)
        covers = {}

        def cover(node):
            found = node.image.url if node.image else own_photo.get(node.pk)
            for kid in children[node.pk]:
                kid_cover = cover(kid)
                found = found or kid_cover
            covers[node.pk] = found
            return found

        roots = children[None]
        for root in roots:
            subtotal(root)
            cover(root)
        context = {"request": request, "children": children, "counts": counts, "covers": covers}
        return Response(CategoryTreeSerializer(roots, many=True, context=context).data)


class FacetViewSet(viewsets.ViewSet):
    """Colors and sizes to offer as filters."""

    def list(self, request):
        systems = SizeSystem.objects.prefetch_related("sizes")
        return Response({
            "colors": ColorSerializer(Color.objects.all(), many=True).data,
            "size_systems": [
                {"id": s.id, "name": s.name, "sizes": [{"id": z.id, "label": z.label} for z in s.sizes.all()]}
                for s in systems
            ],
        })


@api_view(["GET"])
def home(request):
    """
    What the home page shows besides the usual lists: the products the admin picked for the
    turning ring (empty means "featured and newest", chosen by the site), and the live banners.
    """
    store = StoreSettings.load()
    ctx = {"request": request}

    def picked(ids):
        ids = [i for i in ids if isinstance(i, int)]
        by_id = {p.id: p for p in ProductViewSet().get_queryset_for_lists().filter(pk__in=ids)} if ids else {}
        return ProductListSerializer([by_id[i] for i in ids if i in by_id], many=True, context=ctx).data

    return Response({
        "hero": picked(store.hero_products),
        "story": picked(store.story_products),
        "banners": BannerSerializer(Banner.objects.live().filter(placement=Banner.Placement.HOME), many=True, context=ctx).data,
    })
