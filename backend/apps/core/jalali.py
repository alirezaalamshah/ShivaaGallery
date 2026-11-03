"""Gregorian ⇄ Persian (Jalali) dates, for exports read by people and for birthdays. No extra dependency."""

from datetime import date

from django.utils import timezone


def to_jalali(gy, gm, gd):
    g_days = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
    gy2 = gy + 1 if gm > 2 else gy
    days = 355666 + 365 * gy + (gy2 + 3) // 4 - (gy2 + 99) // 100 + (gy2 + 399) // 400 + gd + g_days[gm - 1]
    jy = -1595 + 33 * (days // 12053)
    days %= 12053
    jy += 4 * (days // 1461)
    days %= 1461
    if days > 365:
        jy += (days - 1) // 365
        days = (days - 1) % 365
    jm = 1 + days // 31 if days < 186 else 7 + (days - 186) // 30
    jd = 1 + (days % 31 if days < 186 else (days - 186) % 30)
    return jy, jm, jd



def to_gregorian(jy, jm, jd):
    """The Gregorian date of a Persian date."""
    jy += 1595
    days = -355668 + 365 * jy + (jy // 33) * 8 + ((jy % 33) + 3) // 4 + jd + ((jm - 1) * 31 if jm < 7 else (jm - 7) * 30 + 186)
    gy = 400 * (days // 146097)
    days %= 146097
    if days > 36524:
        days -= 1
        gy += 100 * (days // 36524)
        days %= 36524
        if days >= 365:
            days += 1
    gy += 4 * (days // 1461)
    days %= 1461
    if days > 365:
        gy += (days - 1) // 365
        days = (days - 1) % 365
    gd = days + 1
    leap = (gy % 4 == 0 and gy % 100 != 0) or gy % 400 == 0
    for gm, length in enumerate([31, 29 if leap else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31], start=1):
        if gd <= length:
            return date(gy, gm, gd)
        gd -= length
    raise ValueError("bad Persian date")


def is_jalali_leap(jy):
    """Whether Esfand of this Persian year has 30 days."""
    return to_jalali(*to_gregorian(jy, 12, 30).timetuple()[:3])[2] == 30


def jalali_date(d):
    """'1404/08/09'."""
    y, m, day = to_jalali(d.year, d.month, d.day)
    return f"{y}/{m:02d}/{day:02d}"


def jalali_datetime(dt):
    """'1404/08/09 14:05' in the server's time zone."""
    if dt is None:
        return ""
    local = timezone.localtime(dt)
    y, m, d = to_jalali(local.year, local.month, local.day)
    return f"{y}/{m:02d}/{d:02d} {local:%H:%M}"
