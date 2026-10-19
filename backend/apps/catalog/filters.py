import django_filters
from django.db.models import Exists, OuterRef
from django.db.models.functions import Coalesce

from .models import Category, Product, Variant


def _ids(value):
    return [int(x) for x in str(value).split(",") if x.strip().isdigit()]


class ProductFilter(django_filters.FilterSet):
    category = django_filters.CharFilter(method="filter_category", label="دسته (نامک، شامل زیردسته‌ها)")
    color = django_filters.CharFilter(method="filter_color", label="رنگ‌ها (شناسه‌ها با کاما)")
    size = django_filters.CharFilter(method="filter_size", label="سایزها (شناسه‌ها با کاما)")
    min_price = django_filters.NumberFilter(field_name="current", lookup_expr="gte")
    max_price = django_filters.NumberFilter(field_name="current", lookup_expr="lte")
    in_stock = django_filters.BooleanFilter(method="filter_in_stock")
    on_sale = django_filters.BooleanFilter(method="filter_on_sale")
    featured = django_filters.BooleanFilter(field_name="is_featured")

    class Meta:
        model = Product
        fields = []

    def filter_category(self, qs, name, value):
        category = Category.objects.filter(slug=value, is_active=True).first()
        if category is None:
            return qs.none()
        return qs.filter(category_id__in=category.descendant_ids())

    def _with_variant(self, qs, **lookup):
        sellable = Variant.objects.filter(product=OuterRef("pk"), is_active=True, stock__gt=0, **lookup)
        return qs.filter(Exists(sellable))

    def filter_color(self, qs, name, value):
        ids = _ids(value)
        return self._with_variant(qs, color_id__in=ids) if ids else qs

    def filter_size(self, qs, name, value):
        ids = _ids(value)
        return self._with_variant(qs, size_id__in=ids) if ids else qs

    def filter_on_sale(self, qs, name, value):
        regular = Coalesce("price_override", "product__price")
        on_sale = Variant.objects.filter(product=OuterRef("pk"), is_active=True, sale_price__lt=regular)
        return qs.filter(Exists(on_sale)) if value else qs.exclude(Exists(on_sale))

    def filter_in_stock(self, qs, name, value):
        sellable = Variant.objects.filter(product=OuterRef("pk"), is_active=True, stock__gt=0)
        return qs.filter(Exists(sellable)) if value else qs.exclude(Exists(sellable))
