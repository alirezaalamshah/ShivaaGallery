from django import forms
from django.contrib import admin, messages

from apps.inventory.models import StockMovement
from apps.inventory.services import InsufficientStock, move_stock

from .models import Category, Color, Product, ProductImage, Size, SizeSystem, Variant


@admin.register(Color)
class ColorAdmin(admin.ModelAdmin):
    list_display = ["name", "hex", "sort"]
    list_editable = ["sort"]
    search_fields = ["name"]


class SizeInline(admin.TabularInline):
    model = Size
    extra = 0


@admin.register(SizeSystem)
class SizeSystemAdmin(admin.ModelAdmin):
    inlines = [SizeInline]


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ["__str__", "size_system", "sort", "is_active"]
    list_editable = ["sort", "is_active"]
    list_filter = ["is_active", "parent"]
    search_fields = ["name"]
    fields =["parent", "name", "slug", "description", "image", "size_system", "size_guide", "sort", "is_active"]


class ProductImageInline(admin.TabularInline):
    model = ProductImage
    extra = 1


class VariantForm(forms.ModelForm):
    new_stock = forms.IntegerField(label="موجودی جدید", required=False, min_value=0,
                                   help_text="خالی بگذارید تا تغییر نکند")

    class Meta:
        model = Variant
        fields = ["color", "size", "sku", "price_override", "is_active"]


class VariantInline(admin.TabularInline):
    model = Variant
    form = VariantForm
    extra = 0
    fields = ["color", "size", "sku", "price_override", "is_active", "stock", "new_stock"]
    readonly_fields = ["stock"]


class ProductAdminForm(forms.ModelForm):
    gen_colors = forms.ModelMultipleChoiceField(
        Color.objects.all(), required=False, label="ساخت تنوع: رنگ‌ها",
        widget=forms.CheckboxSelectMultiple)
    gen_sizes = forms.ModelMultipleChoiceField(
        Size.objects.select_related("system"), required=False, label="ساخت تنوع: سایزها",
        widget=forms.CheckboxSelectMultiple,
        help_text="برای هر ترکیب رنگ × سایز که هنوز نیست، یک تنوع ساخته می‌شود.")

    class Meta:
        model = Product
        fields = "__all__"


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    form = ProductAdminForm
    list_display = ["name", "category", "price", "sale_price", "total_stock", "is_active", "is_featured"]
    list_editable = ["is_active", "is_featured"]
    list_filter = ["is_active", "is_featured", "category"]
    search_fields = ["name", "variants__sku"]
    inlines = [ProductImageInline, VariantInline]
    fieldsets = [
        (None, {"fields": ["category", "name", "slug", "description", "details"]}),
        ("قیمت", {"fields": ["price", "sale_price"]}),
        ("نمایش", {"fields": ["is_active", "is_featured"]}),
        ("ساخت سریع تنوع‌ها", {"fields": ["gen_colors", "gen_sizes"], "classes": ["collapse"]}),
    ]

    def get_queryset(self, request):
        return super().get_queryset(request).select_related("category").prefetch_related("variants")

    @admin.display(description="موجودی کل")
    def total_stock(self, obj):
        return sum(v.stock for v in obj.variants.all())

    def save_related(self, request, form, formsets, change):
        super().save_related(request, form, formsets, change)
        product = form.instance
        colors, sizes = form.cleaned_data.get("gen_colors"), form.cleaned_data.get("gen_sizes")
        created = 0
        if colors and sizes:
            for color in colors:
                for size in sizes:
                    _, was_created = Variant.objects.get_or_create(product=product, color=color, size=size)
                    created += was_created
        if created:
            self.message_user(request, f"{created} تنوع جدید ساخته شد.", messages.SUCCESS)

    def save_formset(self, request, form, formset, change):
        super().save_formset(request, form, formset, change)
        if formset.model is not Variant:
            return
        for f in formset.forms:
            target = f.cleaned_data.get("new_stock") if hasattr(f, "cleaned_data") else None
            variant = f.instance
            if target is None or not variant.pk or f.cleaned_data.get("DELETE"):
                continue
            delta = target - variant.stock
            if not delta:
                continue
            reason = StockMovement.Reason.RECEIVE if delta > 0 and variant.stock == 0 else StockMovement.Reason.ADJUST
            try:
                move_stock(variant, delta, reason, note="از پنل مدیریت", user=request.user)
            except InsufficientStock:
                self.message_user(request, f"موجودی {variant} تغییر نکرد.", messages.ERROR)
