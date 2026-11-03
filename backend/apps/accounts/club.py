"""
The customer club: birthday discounts and customers the shop no longer sells to.

A customer with a birthday on file gets the store's birthday discount once a year, on one order
or till ticket, from WINDOW days before to WINDOW days after their birthday in the Persian calendar.
"""

from datetime import date

from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.core.jalali import is_jalali_leap, to_gregorian, to_jalali
from apps.core.models import StoreSettings

from .models import BirthdayUse, Customer

WINDOW = 3

BLOCKED = "امکان خرید با این شماره نیست. لطفاً با فروشگاه تماس بگیرید."


def is_blocked(phone):
    return bool(phone) and Customer.objects.filter(phone=phone, is_active=False).exists()


def birthday_near(birthday, today):
    """(the birthday's day, its Persian year) when today is within WINDOW days of it, else None."""
    _, month, day = to_jalali(birthday.year, birthday.month, birthday.day)
    this_year = to_jalali(today.year, today.month, today.day)[0]
    for year in (this_year - 1, this_year, this_year + 1):
        # Born on Esfand 30: in a year without one, the birthday is Esfand 29.
        d = 29 if month == 12 and day == 30 and not is_jalali_leap(year) else day
        when = to_gregorian(year, month, d)
        if abs((when - today).days) <= WINDOW:
            return when, year
    return None


def birthday_offer(phone, subtotal, today=None):
    """
    The birthday discount this customer may take now, or None:
    {"amount", "percent", "day", "cycle", "used"}. `used` means already taken for this birthday.
    """
    store = StoreSettings.load()
    if not (store.birthday_discount_enabled and store.birthday_discount_percent and phone):
        return None
    customer = Customer.objects.filter(phone=phone, is_active=True, birthday__isnull=False).first()
    if customer is None:
        return None
    near = birthday_near(customer.birthday, today or timezone.localdate())
    if near is None:
        return None
    day, cycle = near
    amount = subtotal * store.birthday_discount_percent // 100
    if store.birthday_discount_max:
        amount = min(amount, store.birthday_discount_max)
    return {
        "amount": amount, "percent": store.birthday_discount_percent, "max": store.birthday_discount_max,
        "day": day, "cycle": cycle, "used": BirthdayUse.objects.filter(phone=phone, cycle=cycle).exists(),
    }


class AlreadyUsed(Exception):
    pass


def claim_birthday(phone, offer, reference):
    """Record the discount as taken. Raises AlreadyUsed when this birthday's discount was taken meanwhile."""
    try:
        with transaction.atomic():
            BirthdayUse.objects.create(phone=phone, cycle=offer["cycle"], reference=reference, amount=offer["amount"])
    except IntegrityError:
        raise AlreadyUsed


def release_birthday(reference):
    """A cancelled order or voided ticket gives the birthday discount back."""
    BirthdayUse.objects.filter(reference=reference).delete()


def valid_birthday(value):
    """Why this birthday cannot be right, or None."""
    today = timezone.localdate()
    if value > today:
        return "تاریخ تولد نمی‌تواند در آینده باشد."
    if value < date(today.year - 110, 1, 1):
        return "تاریخ تولد درست نیست."
    return None
