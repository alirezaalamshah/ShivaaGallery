from collections import OrderedDict

from django.db import IntegrityError, transaction
from django.db.models import F

from apps.accounts.sms import send_sms
from apps.catalog.models import Variant
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


def quote(lines, city, shipping_method_id, discount_code=""):
    priced = price_lines(lines)
    subtotal = sum(l["unit_price"] * l["qty"] for l in priced if l["ok"])
    method = ShippingMethod.objects.filter(pk=shipping_method_id).first() if shipping_method_id else None
    fee = method.fee if method and method.available_for(city) else 0
    discount = find_discount(discount_code)
    amount = 0
    if discount and not discount.problem(subtotal):
        amount = discount.amount_for(subtotal)
    return {"lines": priced, "subtotal": subtotal, "shipping_fee": fee, "discount": amount, "total": subtotal + fee - amount}


@transaction.atomic
def place_order(user, data):
    """
    Create an order from cart lines. Locks every variant, re-checks stock and
    prices on the server, reserves stock through the ledger, and records the
    discount use. Raises CheckoutError with a customer-facing message.
    """
    merged = merge_lines(data["lines"])
    if not merged:
        raise CheckoutError("سبد خرید خالی است.")

    method = ShippingMethod.objects.filter(pk=data["shipping_method"]).first()
    if method is None or not method.available_for(data["city"]):
        raise CheckoutError("این روش ارسال برای شهر انتخاب‌شده در دسترس نیست.", field="shipping_method")

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
        reason = discount.problem(subtotal) if discount else "این کد معتبر نیست یا تاریخش گذشته است."
        if reason:
            raise CheckoutError(reason, field="discount_code")
        discount_amount, discount_code = discount.amount_for(subtotal), discount.code
        DiscountCode.objects.filter(pk=discount.pk).update(used_count=F("used_count") + 1)

    for _ in range(5):
        try:
            with transaction.atomic():
                order = Order.objects.create(
                    user=user, phone=user.username,
                    receiver_name=data["receiver_name"], province=data.get("province", ""), city=data["city"], address=data["address"],
                    postal_code=data.get("postal_code", ""), note=data.get("note", ""),
                    shipping_method=method, shipping_name=method.name, shipping_fee=method.fee,
                    subtotal=subtotal, discount_code=discount_code, discount_amount=discount_amount,
                    total=subtotal + method.fee - discount_amount,
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
    transaction.on_commit(lambda: send_sms(order.phone, "order_placed", order.number, f"{order.total:,}"))
    return order


@transaction.atomic
def change_status(order, new_status, by=None, note="", tracking_code=None):
    """Move an order along its lifecycle. Cancelling returns its items to stock."""
    order = Order.objects.select_for_update().get(pk=order.pk)
    if new_status == order.status:
        return order
    if new_status not in Order.TRANSITIONS[order.status]:
        raise CheckoutError(f"تغییر وضعیت از «{order.get_status_display()}» به این وضعیت ممکن نیست.")
    if tracking_code is not None:
        order.tracking_code = tracking_code
    if new_status == Order.Status.CANCELLED:
        for item in order.items.select_related("variant"):
            if item.variant_id:
                move_stock(item.variant, item.qty, StockMovement.Reason.CANCEL, reference=order.number, user=by)
    order.status = new_status
    order.save(update_fields=["status", "tracking_code", "updated_at"])
    OrderEvent.objects.create(order=order, status=new_status, note=note, by=by)
    label = order.get_status_display()
    transaction.on_commit(lambda: send_sms(order.phone, "order_status", order.number, label, order.tracking_code))
    return order
