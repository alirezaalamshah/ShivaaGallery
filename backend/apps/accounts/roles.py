"""
Three kinds of people sign in: customers (with an SMS code), sellers and admins (with a password).

- Admin: `is_staff`. Runs the whole panel.
- Seller: a member of the "seller" group. Uses only the shop till (/panel/pos) to record in-store sales.
- Customer: everyone else.
"""

from django.contrib.auth.models import Group

SELLER_GROUP = "seller"


def seller_group():
    group, _ = Group.objects.get_or_create(name=SELLER_GROUP)
    return group


def is_seller(user):
    return bool(
        user and user.is_authenticated and user.is_active and not user.is_staff
        and user.groups.filter(name=SELLER_GROUP).exists()
    )


def role_of(user):
    if not user or not user.is_authenticated:
        return None
    if user.is_staff:
        return "admin"
    return "seller" if is_seller(user) else "customer"
