from django.utils import timezone

from apps.accounts.sms import send_sms

from .models import StockAlert, Variant


def notify_back_in_stock(variant_id):
    """Text everyone waiting for this color and size, once, now that it can be bought again."""
    v = Variant.objects.select_related("product", "color", "size").filter(pk=variant_id).first()
    if v is None or not v.in_stock or not v.product.is_active:
        return 0
    waiting = list(StockAlert.objects.filter(variant=v, notified_at__isnull=True))
    # No link: Melipayamak allows links only for stores with a starred eNamad.
    what = f"{v.product.name} {v.color.name} سایز {v.size.label}"
    for alert in waiting:
        send_sms(alert.phone, "back_in_stock", what)
    StockAlert.objects.filter(pk__in=[a.pk for a in waiting]).update(notified_at=timezone.now())
    return len(waiting)
