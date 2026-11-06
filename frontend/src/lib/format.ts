const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

export const faNum = (n: number) => n.toLocaleString("fa-IR");

/** A number with its sign, which stays on the number's left inside right-to-left text. */
export const signed = (sign: "+" | "−", n: number) => `\u2066${sign}${faNum(n)}\u2069`;

export const toFaDigits = (s: string | number) => String(s).replace(/\d/g, (d) => FA_DIGITS[+d]);

export const toEnDigits = (s: string) =>
  s.replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d))).replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));

// The key each Persian letter sits on, on a standard Persian keyboard.
const FA_KEYS: Record<string, string> = {
  ض: "Q", ص: "W", ث: "E", ق: "R", ف: "T", غ: "Y", ع: "U", ه: "I", خ: "O", ح: "P",
  ش: "A", س: "S", ی: "D", ي: "D", ب: "F", ل: "G", ا: "H", ت: "J", ن: "K", م: "L",
  ظ: "Z", ط: "X", ز: "C", ر: "V", ذ: "B", د: "N", پ: "M",
};

/**
 * A discount code as it is stored: capital English letters, digits, - and _. Lower case becomes
 * capital, and a letter typed with the Persian keyboard becomes the English letter on the same key,
 * so the code works whichever way the customer types it.
 */
export const latinCode = (s: string) =>
  toEnDigits(s)
    .replace(/./g, (ch) => FA_KEYS[ch] ?? ch)
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 30);

/** "درخشش، *به سبک تو*" →[["درخشش،", false], ["به سبک تو", true]] — starred parts are highlighted. */
export function splitHighlight(text: string): [string, boolean][] {
  return text
    .split(/(\*[^*]+\*)/)
    .filter(Boolean)
    .map((part) => (part.startsWith("*") && part.endsWith("*") ? [part.slice(1, -1), true] : [part, false]));
}

/** A soft tint of a product color over the page ground, for image backdrops. */
export const tintOf = (hex: string) => `color-mix(in oklab, ${hex} 16%, var(--surface))`;

const jalali = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { year: "numeric", month: "long", day: "numeric" });
const jalaliTime = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });

/** "۲۷ مهر ۱۴۰۵" */
export const faDate = (iso: string) => jalali.format(new Date(iso));
/** "۲۷ مهر، ۱۴:۰۵" */
export const faDateTime = (iso: string) => jalaliTime.format(new Date(iso));
