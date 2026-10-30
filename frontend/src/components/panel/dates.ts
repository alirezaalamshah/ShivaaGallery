/** Date helpers for panel filters. The API takes plain YYYY-MM-DD days in the store's time zone. */

export const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const jalaliDayOfMonth = new Intl.DateTimeFormat("en-u-ca-persian", { day: "numeric" });

/** The first day of the current Persian month. */
function persianMonthStart(today: Date) {
  const d = new Date(today);
  while (Number(jalaliDayOfMonth.format(d).replace(/\D/g, "")) !== 1) d.setDate(d.getDate() - 1);
  return d;
}

export const RANGES = [
  { value: "", label: "همه‌ی زمان‌ها" },
  { value: "today", label: "امروز" },
  { value: "7", label: "۷ روز اخیر" },
  { value: "30", label: "۳۰ روز اخیر" },
  { value: "month", label: "این ماه" },
  { value: "custom", label: "بازه‌ی دلخواه" },
] as const;

export type RangeValue = (typeof RANGES)[number]["value"];

/** {from, to} for a preset; empty for "all time". */
export function rangeOf(value: RangeValue, custom: { from: string; to: string } = { from: "", to: "" }): { from?: string; to?: string } {
  const today = new Date();
  if (value === "today") return { from: isoDay(today), to: isoDay(today) };
  if (value === "7" || value === "30") {
    const start = new Date(today);
    start.setDate(start.getDate() - Number(value) + 1);
    return { from: isoDay(start), to: isoDay(today) };
  }
  if (value === "month") return { from: isoDay(persianMonthStart(today)), to: isoDay(today) };
  if (value === "custom") return { ...(custom.from && { from: custom.from }), ...(custom.to && { to: custom.to }) };
  return {};
}
