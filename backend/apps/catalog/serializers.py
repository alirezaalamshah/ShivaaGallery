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
    left = serializers.SerializerMethodField()
    price = serializers.IntegerField()
    regular_price = serializers.IntegerField()

    class Meta:
        model = Variant
        fields = ["id", "sku", "color", "size_id", "size", "price", "regular_price", "in_stock", "low_stock", "left"]

    def get_low_stock(self, obj):
        return obj.in_stock and obj.stock <= LOW_STOCK

    def get_left(self, obj):
        """How many are left, shown only when it is a few, so the customer can't add more than exist."""
        return obj.stock if obj.in_stock and obj.stock <= LOW_STOCK else None


def _active_variants(product):
    return [v for v in product.variants.all() if v.is_active]


def _colors(product):
    seen, out = set(), []
    for v in _active_variants(product):
        if v.color_id not in seen:
            seen.add(v.color_id)
            out.append(v.color)
    return out


def _cheapest(product):
    return min(_active_variants(product), key=lambda v: (v.price, v.regular_price), default=None)


class ProductListSerializer(serializers.ModelSerializer):
    """`price` and `sale_price` belong to the cheapest variant, so a card shows the lowest price the product sells at."""

    category = CategoryBriefSerializer()
    price = serializers.SerializerMethodField()
    sale_price = serializers.SerializerMethodField()
    current_price = serializers.SerializerMethodField()
    discount_percent = serializers.SerializerMethodField()
    image = serializers.SerializerMethodField()
    color_images = serializers.SerializerMethodField()
    colors = serializers.SerializerMethodField()
    in_stock = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            "id", "slug", "name", "category", "price", "sale_price", "current_price",
            "discount_percent", "image", "color_images", "colors", "in_stock", "is_featured", "created_at",
        ]

    def get_price(self, obj):
        v = _cheapest(obj)
        return v.regular_price if v else obj.price

    def get_sale_price(self, obj):
        v = _cheapest(obj)
        return v.price if v and v.price < v.regular_price else None

    def get_current_price(self, obj):
        v = _cheapest(obj)
        return v.price if v else obj.price

    def get_discount_percent(self, obj):
        v = _cheapest(obj)
        return v.discount_percent if v else 0

    def _url(self, image):
        request = self.context.get("request")
        url = image.image.url
        return request.build_absolute_uri(url) if request else url

    def get_image(self, obj):
        first = next(iter(obj.images.all()), None)
        return self._url(first) if first else None

    def get_color_images(self, obj):
        """The first photo the admin marked for each color, so a card can switch photos with its swatches."""
        out = {}
        for im in obj.images.all():
            if im.color_id is not None and str(im.color_id) not in out:
                out[str(im.color_id)] = self._url(im)
        return out

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
