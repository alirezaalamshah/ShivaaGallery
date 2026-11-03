"""
Three kinds of people sign in: customers (with an SMS code), panel staff and admins (with a password).

- Admin: `is_staff`. Runs the whole panel and is the only one who manages users and their access.
- Staff: has a `StaffAccess` row. Sees only the parts of the panel, and does only the things, ticked for them.
- Customer: everyone else.
"""

from rest_framework import permissions

# Each part of the panel with the things that can be allowed in it. The first code of a part
# that ends in ".view" is implied by every other code of that part.
CATALOG = [
    ("pos", "صندوق فروش حضوری", [
        ("pos.sell", "ثبت فروش"),
        ("pos.discount", "تخفیف تا سقف تنظیمات"),
        ("pos.discount_any", "تخفیف بدون سقف"),
        ("pos.return", "مرجوعی و تعویض حضوری"),
        ("pos.return_any", "استثنا در مرجوعی: بعد از مهلت، یا پس دادن پول وقتی فروشگاه «فقط تعویض» است"),
        ("pos.all_sales", "دیدن فروش همه‌ی فروشنده‌ها (بدون این، فقط فروش خودش)"),
        ("pos.void", "باطل کردن فاکتور"),
        ("pos.close", "بستن صندوق امروز"),
        ("pos.close_past", "بستن و دیدن صندوق روزهای قبل"),
    ]),
    ("orders", "سفارش‌های اینترنتی", [
        ("orders.view", "دیدن"),
        ("orders.manage", "تغییر وضعیت و کد رهگیری"),
        ("orders.export", "خروجی اکسل"),
    ]),
    ("returns", "مرجوعی‌های اینترنتی", [
        ("returns.view", "دیدن"),
        ("returns.manage", "تأیید، رد و «انجام شد»"),
    ]),
    ("stock", "موجودی انبار", [
        ("stock.view", "دیدن"),
        ("stock.edit", "تغییر موجودی"),
        ("stock.history", "دیدن تاریخچه‌ی موجودی"),
    ]),
    ("customers", "مشتری‌ها", [
        ("customers.view", "دیدن فهرست و پرونده"),
        ("customers.edit", "یادداشت و ویرایش"),
        ("customers.export", "خروجی اکسل"),
    ]),
    ("reviews", "نظرات خریداران", [
        ("reviews.view", "دیدن"),
        ("reviews.manage", "تأیید، پاسخ و حذف"),
    ]),
    ("products", "محصولات", [
        ("products.view", "دیدن"),
        ("products.edit", "افزودن و ویرایش"),
        ("products.delete", "حذف"),
    ]),
    ("cost", "قیمت خرید", [("cost.view", "دیدن و وارد کردن قیمت خرید")]),
    ("dashboard", "داشبورد", [("dashboard.view", "دیدن آمار فروش")]),
    ("reports", "سود و زیان و گزارش‌ها", [("reports.view", "دیدن")]),
    ("expenses", "هزینه‌ها", [
        ("expenses.view", "دیدن"),
        ("expenses.edit", "ثبت و ویرایش"),
        ("expenses.delete", "حذف"),
    ]),
    ("categories", "دسته‌ها", [("categories.manage", "مدیریت")]),
    ("attributes", "رنگ و سایز", [("attributes.manage", "مدیریت")]),
    ("home", "صفحه‌ی اصلی و بنرها", [("home.manage", "مدیریت")]),
    ("shipping", "روش‌های ارسال", [("shipping.manage", "مدیریت")]),
    ("discounts", "کدهای تخفیف", [("discounts.manage", "مدیریت")]),
    ("settings", "تنظیمات فروشگاه", [("settings.manage", "مدیریت")]),
]

ALL = frozenset(code for _, _, perms in CATALOG for code, _ in perms)

# A stronger permission brings the weaker one it builds on.
IMPLIES = {"pos.discount_any": "pos.discount", "pos.return_any": "pos.return", "pos.close_past": "pos.close"}

# Ready-made sets the admin starts from; they are copied onto the user, not linked.
TEMPLATES = [
    ("seller", "فروشنده", ["pos.sell", "pos.discount", "pos.return", "pos.close"]),
    ("stock", "انباردار", ["stock.view", "stock.edit", "stock.history", "products.view", "products.edit"]),
]


def normalize(codes):
    """Known codes only, with what each implies: anything in a part brings its ".view"."""
    out = {c for c in codes if c in ALL}
    for code in list(out):
        if code in IMPLIES:
            out.add(IMPLIES[code])
        view = code.split(".")[0] + ".view"
        if view in ALL:
            out.add(view)
    return sorted(out)


def is_panel_user(user):
    """An admin or a staff member: someone who signs in with a password and never shops with this account."""
    if not user or not user.is_authenticated:
        return False
    return user.is_staff or user.is_superuser or hasattr(user, "staff_access")


def perms_of(user):
    if not user or not user.is_authenticated or not user.is_active:
        return frozenset()
    if user.is_staff:
        return ALL
    cached = getattr(user, "_panel_perms", None)
    if cached is None:
        access = getattr(user, "staff_access", None)
        cached = user._panel_perms = frozenset(access.perms if access else ())
    return cached


def can(user, *codes):
    """Whether the user holds any of the codes."""
    held = perms_of(user)
    return any(c in held for c in codes)


def role_of(user):
    if not user or not user.is_authenticated:
        return None
    if user.is_staff:
        return "admin"
    return "staff" if hasattr(user, "staff_access") else "customer"


class IsAdmin(permissions.BasePermission):
    message = "فقط مدیر فروشگاه به این بخش دسترسی دارد."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_staff)


class PanelAccess(permissions.BasePermission):
    """
    Lets through whoever holds the permission the view asks for. The rules map a view action
    (list, destroy, update_status …) or "read" / "write" to a code, or a tuple of codes of which any will do.
    A view sets them as `access`; function views use `needs()`.
    """

    message = "به این بخش دسترسی ندارید. از مدیر فروشگاه بخواهید دسترسی بدهد."
    access = None

    def has_permission(self, request, view):
        rules = self.access or getattr(view, "access", {})
        code = rules.get(getattr(view, "action", None)) or rules.get("read" if request.method in permissions.SAFE_METHODS else "write")
        if not code:
            return False
        return can(request.user, *(code if isinstance(code, tuple) else (code,)))


def needs(read, write=None):
    return type("Needs", (PanelAccess,), {"access": {"read": read, "write": write}})
