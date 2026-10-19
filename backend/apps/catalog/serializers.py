from rest_framework import serializers

from .models import Category, Color, Product, ProductImage, Variant

LOW_STOCK = 2


class ColorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Color
        fields = ["id", "name", "hex"]


class CategoryBriefSerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name", "slug"]


class ProductImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductImage
        fields = ["image", "color", "alt"]


class VariantSerializer(serializers.ModelSerializer):
    size = serializers.CharField(source="size.label")
    size_id = serializers.IntegerField()
    in_stock = serializers.BooleanField()
    low_stock = serializers.SerializerMethodField()
    price = serializers.IntegerField()

    class Meta:
        model = Variant
        fields = ["id", "sku", "color", "size_id", "size", "price", "in_stock", "low_stock"]

    def get_low_stock(self, obj):
        return obj.in_stock and obj.stock <= LOW_STOCK


def _active_variants(product):
    return [v for v in product.variants.all() if v.is_active]


def _colors(product):
    seen, out = set(), []
    for v in _active_variants(product):
        if v.color_id not in seen:
            seen.add(v.color_id)
            out.append(v.color)
    return out


class ProductListSerializer(serializers.ModelSerializer):
    category = CategoryBriefSerializer()
    current_price = serializers.IntegerField()
    discount_percent = serializers.IntegerField()
    image = serializers.SerializerMethodField()
    colors = serializers.SerializerMethodField()
    in_stock = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            "id", "slug", "name", "category", "price", "sale_price", "current_price",
            "discount_percent", "image", "colors", "in_stock", "is_featured", "created_at",
        ]

    def get_image(self, obj):
        images = list(obj.images.all())
        if not images:
            return None
        request = self.context.get("request")
        url = images[0].image.url
        return request.build_absolute_uri(url) if request else url

    def get_colors(self, obj):
        return ColorSerializer(_colors(obj), many=True).data

    def get_in_stock(self, obj):
        return any(v.in_stock for v in _active_variants(obj))


class ProductDetailSerializer(ProductListSerializer):
    images = ProductImageSerializer(many=True)
    variants = serializers.SerializerMethodField()
    sizes = serializers.SerializerMethodField()
    size_guide = serializers.SerializerMethodField()
    breadcrumbs = serializers.SerializerMethodField()

    class Meta(ProductListSerializer.Meta):
        fields = ProductListSerializer.Meta.fields + [
            "description", "details", "images", "variants", "sizes", "size_guide", "breadcrumbs",
        ]

    def get_variants(self, obj):
        return VariantSerializer(_active_variants(obj), many=True).data

    def get_sizes(self, obj):
        seen, sizes = set(), []
        for v in sorted(_active_variants(obj), key=lambda v: (v.size.sort, v.size_id)):
            if v.size_id not in seen:
                seen.add(v.size_id)
                sizes.append({"id": v.size_id, "label": v.size.label})
        return sizes

    def get_size_guide(self, obj):
        return obj.category.effective_size_guide()

    def get_breadcrumbs(self, obj):
        chain, node = [], obj.category
        while node is not None:
            chain.append(node)
            node = node.parent
        return CategoryBriefSerializer(reversed(chain), many=True).data


class CategoryTreeSerializer(serializers.ModelSerializer):
    children = serializers.SerializerMethodField()
    product_count = serializers.SerializerMethodField()
    cover = serializers.SerializerMethodField()

    class Meta:
        model = Category
        fields = ["id", "name", "slug", "description", "image", "cover", "product_count", "children"]

    def get_cover(self, obj):
        url = self.context.get("covers", {}).get(obj.pk)
        request = self.context.get("request")
        return request.build_absolute_uri(url) if url and request else url

    def get_children(self, obj):
        kids = self.context["children"].get(obj.pk, [])
        return CategoryTreeSerializer(kids, many=True, context=self.context).data

    def get_product_count(self, obj):
        return self.context["counts"].get(obj.pk, 0)
