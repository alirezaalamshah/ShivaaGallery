import logging
from datetime import timedelta
from html import escape

from django.conf import settings
from django.db import transaction
from django.http import Http404, HttpResponse, HttpResponseRedirect
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.orders.models import Order
from apps.orders.services import change_status, expire_unpaid_soon, notify_new_order

from .gateways import GatewayError, get_gateway
from .models import Payment

log = logging.getLogger("payments")


def callback_url(payment):
    return f"{settings.SITE_URL}/api/payments/callback/{payment.pk}"


def order_page(order, result):
    return HttpResponseRedirect(f"{settings.SITE_URL}/account/orders/{order.number}?payment={result}")


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def start(request):
    """Send the customer to the gateway to pay one of their unpaid orders."""
    expire_unpaid_soon()
    order = Order.objects.filter(user=request.user, number=str(request.data.get("number", ""))).first()
    if order is None:
        return Response({"detail": "سفارش پیدا نشد."}, status=status.HTTP_404_NOT_FOUND)
    if order.status != Order.Status.AWAITING_PAYMENT:
        return Response({"detail": "این سفارش دیگر منتظر پرداخت نیست."}, status=status.HTTP_409_CONFLICT)
    if order.payment_deadline and order.payment_deadline < timezone.now():
        return Response({"detail": "مهلت پرداخت این سفارش تمام شده است. دوباره سفارش بده."}, status=status.HTTP_409_CONFLICT)
    # Keep the items for the customer while they are on the bank's page.
    hold_until = timezone.now() + timedelta(minutes=settings.PAYMENT_TIMEOUT_MINUTES)
    if order.payment_deadline and order.payment_deadline < hold_until:
        Order.objects.filter(pk=order.pk).update(payment_deadline=hold_until)
    try:
        gateway = get_gateway()
        payment = Payment.objects.create(order=order, gateway=settings.PAYMENT_GATEWAY, amount=order.total * settings.PAYMENT_RIAL_PER_UNIT)
        redirect = gateway.start(payment, callback_url(payment))
        payment.save(update_fields=["authority"])
    except GatewayError:
        log.exception("Could not start payment for %s", order.number)
        return Response({"detail": "اتصال به درگاه پرداخت ممکن نشد. چند دقیقه‌ی دیگر دوباره امتحان کن."}, status=status.HTTP_502_BAD_GATEWAY)
    return Response({"redirect": redirect})


def callback(request, pk):
    """The gateway sends the customer back here. Verify, mark the order paid, and show the order page."""
    with transaction.atomic():
        payment = Payment.objects.select_for_update().select_related("order").filter(pk=pk).first()
        if payment is None:
            raise Http404
        order = Order.objects.select_for_update().get(pk=payment.order_id)
        if payment.status == Payment.Status.PAID:
            return order_page(order, "ok")
        if payment.status == Payment.Status.FAILED:
            return order_page(order, "failed")
        if order.status != Order.Status.AWAITING_PAYMENT:
            # Too late: the order expired and its items went back on sale. Leaving the
            # payment unverified makes the gateway return the money to the customer.
            payment.status, payment.message = Payment.Status.FAILED, "سفارش قبل از پرداخت لغو شده بود."
            payment.save(update_fields=["status", "message"])
            return order_page(order, "late")
        try:
            ok = get_gateway().verify(payment, request.GET)
        except GatewayError:
            log.exception("Could not verify payment %s", payment.pk)
            ok = False
        payment.verified_at = timezone.now()
        if not ok:
            payment.status = Payment.Status.FAILED
            payment.save(update_fields=["status", "verified_at"])
            return order_page(order, "failed")
        payment.status = Payment.Status.PAID
        payment.save(update_fields=["status", "ref_id", "card", "verified_at"])
        change_status(order, Order.Status.PAID, note=f"پرداخت آنلاین · کد پیگیری {payment.ref_id}", notify=False)
        transaction.on_commit(lambda: notify_new_order(order))
    return order_page(order, "ok")


def fake_gateway(request, authority):
    """Stand-in for a bank page, so the whole payment flow can be tried locally."""
    if settings.PAYMENT_GATEWAY != "fake":
        raise Http404
    payment = Payment.objects.select_related("order").filter(authority=authority).first()
    if payment is None:
        raise Http404
    back = escape(f"{callback_url(payment)}?Authority={authority}")
    amount = f"{payment.amount:,}"
    html = f"""<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>درگاه آزمایشی</title>
<body style="font-family:Tahoma,sans-serif;max-width:420px;margin:60px auto;padding:0 16px;text-align:center">
<h1 style="font-size:20px">درگاه پرداخت آزمایشی</h1>
<p>سفارش {escape(payment.order.number)} · مبلغ {amount} ریال</p>
<p style="color:#a00">این صفحه فقط برای آزمایش است و پولی جابه‌جا نمی‌شود.</p>
<p><a href="{back}&Status=OK" style="display:block;padding:14px;background:#14110E;color:#fff;border-radius:12px;text-decoration:none">پرداخت موفق</a></p>
<p><a href="{back}&Status=NOK" style="display:block;padding:14px;border:1px solid #999;border-radius:12px;text-decoration:none;color:#333">انصراف از پرداخت</a></p>
</body></html>"""
    return HttpResponse(html)
