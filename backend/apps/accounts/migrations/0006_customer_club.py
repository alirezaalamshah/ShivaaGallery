import django.utils.timezone
from django.db import migrations, models


class Migration(migrations.Migration):
    """The customer note becomes the club member: same rows, plus birthday and an on/off switch."""

    dependencies = [
        ('accounts', '0005_staff_access'),
    ]

    operations = [
        migrations.RenameModel('CustomerNote', 'Customer'),
        migrations.AlterModelOptions(
            name='customer',
            options={'verbose_name': 'مشتری', 'verbose_name_plural': 'مشتری‌ها'},
        ),
        migrations.AddField(
            model_name='customer',
            name='birthday',
            field=models.DateField(blank=True, help_text='مشتری فقط یک بار وارد می‌کند؛ بعد فقط فروشگاه تغییرش می‌دهد', null=True, verbose_name='تاریخ تولد'),
        ),
        migrations.AddField(
            model_name='customer',
            name='is_active',
            field=models.BooleanField(default=True, help_text='مشتری غیرفعال نه در سایت و نه در مغازه خرید نمی‌تواند بکند', verbose_name='فعال'),
        ),
        migrations.AddField(
            model_name='customer',
            name='created_at',
            field=models.DateTimeField(default=django.utils.timezone.now, verbose_name='ثبت'),
        ),
        migrations.CreateModel(
            name='BirthdayUse',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('phone', models.CharField(max_length=11, verbose_name='موبایل')),
                ('cycle', models.PositiveSmallIntegerField(help_text='سالی که این تولد در آن است', verbose_name='سال تولد (شمسی)')),
                ('reference', models.CharField(db_index=True, max_length=20, verbose_name='شماره سفارش یا فاکتور')),
                ('amount', models.PositiveBigIntegerField(verbose_name='مبلغ تخفیف')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'verbose_name': 'تخفیف تولد',
                'verbose_name_plural': 'تخفیف‌های تولد',
                'ordering': ['-created_at'],
                'constraints': [models.UniqueConstraint(fields=('phone', 'cycle'), name='one_birthday_discount_a_year')],
            },
        ),
    ]
