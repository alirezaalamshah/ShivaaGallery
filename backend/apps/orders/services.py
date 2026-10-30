from collections import OrderedDict
from datetime import timedelta

from django.conf import settings
from django.core.cache import cache
from django.db import IntegrityError, transaction
from django.db.models import F
from django.db.models.functions import Greatest
from django.utils import timezone

from apps.accounts.sms import send_sms
from apps.catalog.models import Variant
from apps.core.models import StoreSettings
from apps.inventory.models import StockMovement
from apps.inventory.services import InsufficientStock, move_stock

from .models import DiscountCode, Order, OrderEvent, OrderItem, ShippingMethod

MAX_QTY_PER_LINE = 10


class CheckoutError(Exception):
    def __init__(self, message, field=None, lines=None):
        super().__init__(message)
        self.message, self.field, self.lines = message, field, lines or []


def merge_lines(lines):
    """[{variant, qty}, ...] → {variant_id: qty}, merging duplicates and capping quantity."""
    merged = OrderedDict()
    for line in lines:
        vid, qty = int(line["variant"]), int(line["qty"])
        if qty > 0:
            merged[vid] = min(MAX_QTY_PER_LINE, merged.get(vid, 0) + qty)
    return merged


def price_lines(lines):
    """Current server-side price and availability for cart lines. Used by the cart page and by checkout."""
    merged = merge_lines(lines)
    variants = Variant.objects.select_related("product", "color", "size").in_bulk(list(merged))
    out = []
    for vid, qty in merged.items():
        v = variants.get(vid)
        sellable = bool(v and v.is_active and v.product.is_active)
        out.append({
            "variant": vid,
            "qty": qty,
            "available": v.stock if sellable else 0,
            "unit_price": v.price if v else 0,
            "ok": sellable and v.stock >= qty,
        })
    return out


def find_discount(code):
    code = (code or "").strip().upper()
    return DiscountCode.objects.filter(code=code).first() if code else None


def quote(lines, city, shipping_method_id, discount_code="", user=None):
    priced = price_lines(lines)
    subtotal = sum(l["unit_price"] * l["qty"] for l in priced if l["ok"])
    method = ShippingMethod.objects.filter(pk=shipping_method_id).first() if shipping_method_id else None
    fee = method.fee if method and method.available_for(city) else 0
    discount = find_discount(discount_code)
    amount = 0
    if discount and not discount.problem(subtotal, user):
        amount = discount.amount_for(subtotal)
    return {"lines": priced, "subtotal": subtotal, "shipping_fee": fee, "discount": amount, "total": subtotal + fee - amount}


def online_payment():
    return settings.PAYMENT_GATEWAY != "none"


def payment_deadline(now=None):
    """Until when a new unpaid order keeps its items out of stock."""
    now = now or timezone.now()
    if online_payment():
        return now + timedelta(minutes=settings.PAYMENT_TIMEOUT_MINUTES)
    hours = StoreSettings.load().unpaid_hold_hours
    return now + timedelta(hours=hours) if hours else None


def notify_new_order(order):
    """Tell the customer the order is in, and the store that it has a new order."""
    total = f"{order.total:,}"
    send_sms(order.phone, "order_placed", order.number, total)
    store_phone = StoreSettings.load().order_notify_phone
    if store_phone:
        send_sms(store_phone, "admin_order", order.number, total)




@transaction.atomic
def place_order(user, data):
    """
    Create an order from cart lines. Locks every variant, re-checks stock and
    prices on the server, reserves stock through the ledger, and records the
    discount use. Raises CheckoutError with a customer-facing message.

    Sending the same client_key twice returns the first order instead of making
    a second one, so a retry after a network error never orders twice.
    """
    key = data.get("client_key") or None
    if key:
        existing = Order.objects.filter(user=user, client_key=key).first()
        if existing:
            return existing

    merged = merge_lines(data["lines"])
    if not merged:
        raise CheckoutError("سبد خرید خالی است.")

    method = ShippingMethod.objects.filter(pk=data["shipping_method"]).first()
    if method is None or not method.available_for(data["city"]):
        raise CheckoutError("این روش ارسال برای شهر انتخاب‌شده در دسترس نیست.", field="shipping_method")
    if method.needs_postal_code and not data.get("postal_code"):
        raise CheckoutError(f"برای ارسال با {method.name} کد پستی لازم است.", field="postal_code")

    variants = (
        Variant.objects.select_for_update()
        .select_related("product", "color", "size")
        .filter(pk__in=list(merged))
        .order_by("pk")
    )
    by_id = {v.pk: v for v in variants}
    problems = []
    for vid, qty in merged.items():
        v = by_id.get(vid)
        if v is None or not v.is_active or not v.product.is_active:
            problems.append({"variant": vid, "available": 0})
        elif v.stock < qty:
            problems.append({"variant": vid, "available": v.stock})
    if problems:
        raise CheckoutError("موجودی بعضی از کالاها تغییر کرده است. سبد را بررسی کن.", field="lines", lines=problems)

    subtotal = sum(by_id[vid].price * qty for vid, qty in merged.items())
    discount_amount, discount_code = 0, ""
    if data.get("discount_code"):
        discount = DiscountCode.objects.select_for_update().filter(code=data["discount_code"].strip().upper()).first()
        reason = discount.problem(subtotal, user) if discount else "این کد معتبر نیست یا تاریخش گذشته است."
        if reason:
            raise CheckoutError(reason, field="discount_code")
        discount_amount, discount_code = discount.amount_for(subtotal), discount.code
        DiscountCode.objects.filter(pk=discount.pk).update(used_count=F("used_count") + 1)

    for _ in range(5):
        try:
            with transaction.atomic():
                order = Order.objects.create(
                    user=user, phone=user.username, client_key=key,
                    receiver_name=data["receiver_name"], receiver_phone=data.get("receiver_phone", ""),
                    province=data.get("province", ""), city=data["city"], address=data["address"],
                    postal_code=data.get("postal_code", ""), note=data.get("note", ""),
                    shipping_method=method, shipping_name=method.name, shipping_fee=method.fee,
                    subtotal=subtotal, discount_code=discount_code, discount_amount=discount_amount,
                    total=subtotal + method.fee - discount_amount, payment_deadline=payment_deadline(),
                )
            break
        except IntegrityError:  # order number collision; try another
            continue
    else:
        raise CheckoutError("ثبت سفارش ممکن نشد. دوباره تلاش کن.")

    for vid, qty in merged.items():
        v = by_id[vid]
        first_image = v.product.images.filter(color=v.color).first() or v.product.images.first()
        OrderItem.objects.create(
            order=order, variant=v, product_slug=v.product.slug, product_name=v.product.name,
            color_name=v.color.name, size_label=v.size.label, sku=v.sku,
            image=first_image.image.url if first_image else "", unit_price=v.price, qty=qty,
        )
        try:
            move_stock(v, -qty, StockMovement.Reason.SALE, reference=order.number, user=user)
        except InsufficientStock:  # cannot happen under the row lock, but never oversell
            raise CheckoutError("موجودی بعضی از کالاها تغییر کرده است. سبد را بررسی کن.", field="lines")

    OrderEvent.objects.create(order=order, status=order.status, by=user)
    if not online_payment():
        # With online payment, the customer and the store hear about the order once it is paid.
        transaction.on_commit(lambda: notify_new_order(order))
    return order


@transaction.atomic
def change_status(order, new_status, by=None, note="", tracking_code=None, notify=True, only_from=None):
    """
    Move an order along its lifecycle. Cancelling returns its items to stock and
    gives the discount code its use back. With `only_from`, nothing happens if the
    order has meanwhile left that status (for example, it was paid while expiring).
    """
    order = Order.objects.select_for_update().get(pk=order.pk)
    if new_status == order.status or (only_from and order.status != only_from):
        return order
    if new_status not in Order.TRANSITIONS[order.status]:
        raise CheckoutError(f"تغییر وضعیت از «{order.get_status_display()}» به این وضعیت ممکن نیست.")
    if tracking_code is not None:
        order.tracking_code = tracking_code.strip()
    if new_status == Order.Status.CANCELLED:
        for item in order.items.select_related("variant"):
            if item.variant_id:
                move_stock(item.variant, item.qty, StockMovement.Reason.CANCEL, reference=order.number, user=by)
        if order.discount_code:
            DiscountCode.objects.filter(code=order.discount_code).update(used_count=Greatest(F("used_count") - 1, 0))
    if new_status == Order.Status.PAID and not order.paid_at:
        order.paid_at = timezone.now()
    order.status = new_status
    order.save(update_fields=["status", "tracking_code", "paid_at", "updated_at"])
    OrderEvent.objects.create(order=order, status=new_status, note=note, by=by)
    if notify:
        transaction.on_commit(lambda: notify_status(order))
    return order


def notify_status(order):
    if order.status == Order.Status.SHIPPED:
        send_sms(order.phone, "order_shipped", order.number, order.shipping_name, order.tracking_code)
    else:
        send_sms(order.phone, "order_status", order.number, order.get_status_display())


@transaction.atomic
def set_tracking_code(order, code):
    """Save the parcel's tracking code. The customer of a shipped order is told the new code."""
    order = Order.objects.select_for_update().get(pk=order.pk)
    code = code.strip()
    if code == order.tracking_code:
        return order
    order.tracking_code = code
    order.save(update_fields=["tracking_code", "updated_at"])
    if code and order.status == Order.Status.SHIPPED:
        transaction.on_commit(lambda: notify_status(order))
    return order


def cancel_by_customer(order, user):
    if order.status != Order.Status.AWAITING_PAYMENT:
        raise CheckoutError("این سفارش پرداخت شده است. برای لغو با فروشگاه تماس بگیر.")
    return change_status(order, Order.Status.CANCELLED, by=user, note="لغو توسط مشتری", only_from=Order.Status.AWAITING_PAYMENT)


def expire_unpaid(now=None):
    """Cancel unpaid orders whose payment deadline has passed, so their items go back on sale."""
    now = now or timezone.now()
    due = Order.objects.filter(status=Order.Status.AWAITING_PAYMENT, payment_deadline__lt=now)
    for order in due:
        change_status(order, Order.Status.CANCELLED, note="لغو خودکار: مهلت پرداخت تمام شد", only_from=Order.Status.AWAITING_PAYMENT)
    return len(due)


def expire_unpaid_soon():
    """expire_unpaid at most once a minute. Busy views call it, so stock frees up even without a cron job."""
    if cache.add("orders:expire-unpaid", 1, timeout=60):
        expire_unpaid()


def return_window(order, store=None):
    """(deadline, problem): until when this order can be returned, or why it can't."""
    store = store or StoreSettings.load()
    if not store.returns_enabled:
        return None, "این فروشگاه مرجوعی ندارد."
    if order.status not in (Order.Status.SHIPPED, Order.Status.DELIVERED):
        return None, "بعد از دریافت سفارش می‌توانید درخواست مرجوعی بدهید."
    received = order.events.filter(status=order.status).order_by("-created_at").values_list("created_at", flat=True).first()
    deadline = (received or order.updated_at) + timedelta(days=store.returns_days)
    if timezone.now() > deadline:
        return deadline, f"مهلت {store.returns_days} روزه‌ی مرجوعی این سفارش تمام شده است."
    if order.returns.exclude(status="rejected").exists():
        return deadline, "برای این سفارش درخواست مرجوعی ثبت شده است."
    return deadline, None


@transaction.atomic
def request_return(order, data):
    from .models import ReturnItem, ReturnRequest

    _, problem = return_window(order)
    if problem:
        raise CheckoutError(problem)
    items = {i.pk: i for i in order.items.all()}
    chosen = [(items.get(int(x["item"])), int(x["qty"])) for x in data["items"]]
    if not chosen or any(item is None or not 1 <= qty <= item.qty for item, qty in chosen):
        raise CheckoutError("کالاها و تعدادشان را درست انتخاب کنید.", field="items")
    req = ReturnRequest.objects.create(order=order, reason=data["reason"], wants=data["wants"], text=data.get("text", "").strip())
    ReturnItem.objects.bulk_create([ReturnItem(request=req, order_item=item, qty=qty) for item, qty in chosen])
    store_phone = StoreSettings.load().order_notify_phone
    if store_phone:
        transaction.on_commit(lambda: send_sms(store_phone, "return_status", order.number, "درخواست مرجوعی جدید"))
    return req


@transaction.atomic
def change_return_status(req, new_status, by=None, admin_note=None):
    """Move a return request along. Completing it puts the returned pieces back on sale."""
    from .models import ReturnRequest

    req = ReturnRequest.objects.select_for_update().select_related("order").get(pk=req.pk)
    if admin_note is not None:
        req.admin_note = admin_note.strip()
    if new_status and new_status != req.status:
        if new_status not in ReturnRequest.TRANSITIONS[req.status]:
            raise CheckoutError(f"تغییر وضعیت از «{req.get_status_display()}» به این وضعیت ممکن نیست.")
        if new_status == ReturnRequest.Status.COMPLETED:
            for ri in req.items.select_related("order_item__variant"):
                if ri.order_item.variant_id:
                    move_stock(ri.order_item.variant, ri.qty, StockMovement.Reason.RETURN, reference=req.order.number, user=by)
        req.status = new_status
        transaction.on_commit(lambda: send_sms(req.order.phone, "return_status", req.order.number, req.get_status_display()))
    req.save()
    return req
