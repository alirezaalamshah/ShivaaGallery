from django.db import migrations, models


def move_sales_to_variants(apps, schema_editor):
    """A product's sale applied to every variant without its own price; keep it that way."""
    Product = apps.get_model("catalog", "Product")
    Variant = apps.get_model("catalog", "Variant")
    for product in Product.objects.filter(sale_price__isnull=False):
        Variant.objects.filter(product=product, price_override__isnull=True).update(sale_price=product.sale_price)


def move_sales_back(apps, schema_editor):
    Product = apps.get_model("catalog", "Product")
    Variant = apps.get_model("catalog", "Variant")
    for product in Product.objects.all():
        sale = Variant.objects.filter(product=product, price_override__isnull=True, sale_price__isnull=False).values_list("sale_price", flat=True).first()
        if sale is not None and sale < product.price:
            Product.objects.filter(pk=product.pk).update(sale_price=sale)


class Migration(migrations.Migration):

    dependencies = [
        ('catalog', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='variant',
            name='sale_price',
            field=models.PositiveBigIntegerField(blank=True, null=True, verbose_name='قیمت حراج این تنوع'),
        ),
        migrations.RunPython(move_sales_to_variants, move_sales_back),
        migrations.RemoveField(
            model_name='product',
            name='sale_price',
        ),
        migrations.AlterField(
            model_name='product',
            name='price',
            field=models.PositiveBigIntegerField(help_text='قیمت رنگ‌ها و سایزهایی که قیمت جدا ندارند', verbose_name='قیمت'),
        ),
        migrations.AlterField(
            model_name='variant',
            name='price_override',
            field=models.PositiveBigIntegerField(blank=True, help_text='خالی یعنی قیمت محصول', null=True, verbose_name='قیمت این تنوع'),
        ),
    ]
