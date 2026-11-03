/** Persian (Jalali) ↔ Gregorian calendar math, for the panel's date picker. No extra dependency. */

export type JDate = { y: number; m: number; d: number };

export const J_MONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];
/** Saturday first, as the Persian week starts. */
export const J_WEEKDAYS = ["ش", "ی", "د", "س", "چ", "پ", "ج"];

const div = (a: number, b: number) => Math.floor(a / b);

export function toJalali(date: Date): JDate {
  const gy = date.getFullYear();
  const gm = date.getMonth() + 1;
  const gd = date.getDate();
  const gDays = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days = 355666 + 365 * gy + div(gy2 + 3, 4) - div(gy2 + 99, 100) + div(gy2 + 399, 400) + gd + gDays[gm - 1];
  let y = -1595 + 33 * div(days, 12053);
  days %= 12053;
  y += 4 * div(days, 1461);
  days %= 1461;
  if (days > 365) {
    y += div(days - 1, 365);
    days = (days - 1) % 365;
  }
  const m = days < 186 ? 1 + div(days, 31) : 7 + div(days - 186, 30);
  const d = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return { y, m, d };
}

/** The Gregorian day of a Persian date, at local noon (safe from daylight-saving edges). */
export function fromJalali({ y, m, d }: JDate): Date {
  const jy = y + 1595;
  let days = -355668 + 365 * jy + div(jy, 33) * 8 + div((jy % 33) + 3, 4) + d + (m < 7 ? (m - 1) * 31 : (m - 7) * 30 + 186);
  let gy = 400 * div(days, 146097);
  days %= 146097;
  if (days > 36524) {
    days -= 1;
    gy += 100 * div(days, 36524);
    days %= 36524;
    if (days >= 365) days += 1;
  }
  gy += 4 * div(days, 1461);
  days %= 1461;
  if (days > 365) {
    gy += div(days - 1, 365);
    days = (days - 1) % 365;
  }
  let gd = days + 1;
  const leap = (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0;
  const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 0;
  while (gd > monthDays[gm]) gd -= monthDays[gm++];
  return new Date(gy, gm, gd, 12);
}

export function jalaliMonthLength(y: number, m: number) {
  if (m <= 6) return 31;
  if (m <= 11) return 30;
  return toJalali(fromJalali({ y, m: 12, d: 30 })).d === 30 ? 30 : 29;
}

/** 0 for Saturday … 6 for Friday. */
export const weekdayIndex = (date: Date) => (date.getDay() + 1) % 7;
