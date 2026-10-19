from collections import defaultdict

from django.db.models import Count, F, Prefetch
from django.db.models.functions import Coalesce
from rest_framework import viewsets
from rest_framework.response import Response

from .filters import ProductFilter
from .models import Category, Color, Product, SizeSystem, Variant
from .serializers import CategoryTreeSerializer, ColorSerializer, ProductDetailSerializer, ProductListSerializer


class ProductViewSet(viewsets.ReadOnlyModelViewSet):
    lookup_field = "slug"
    lookup_value_regex = "[^/]+"
    filterset_class = ProductFilter
    search_fields = ["name", "description", "category__name"]
    ordering_fields = ["current", "created_at"]
    ordering = ["-created_at"]

    def get_queryset(self):
        variants = Variant.objects.select_related("color", "size")
        return (
            Product.objects.published()
            .annotate(current=Coalesce(F("sale_price"), F("price")))
            .select_related("category__parent")
            .prefetch_related(Prefetch("variants", queryset=variants), "images")
        )

    def get_serializer_class(self):
        return ProductDetailSerializer if self.action == "retrieve" else ProductListSerializer


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

        roots = children[None]
        for root in roots:
            subtotal(root)
        context = {"request": request, "children": children, "counts": counts}
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
