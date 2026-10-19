const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

export const faNum = (n: number) => n.toLocaleString("fa-IR");

export const toFaDigits = (s: string | number) => String(s).replace(/\d/g, (d) => FA_DIGITS[+d]);

export const toEnDigits = (s: string) =>
  s.replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d))).replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));

/** "درخشش، *به سبک تو*" → [["درخشش،", false], ["به سبک تو", true]] — starred parts are highlighted. */
export function splitHighlight(text: string): [string, boolean][] {
  return text
    .split(/(\*[^*]+\*)/)
    .filter(Boolean)
    .map((part) => (part.startsWith("*") && part.endsWith("*") ? [part.slice(1, -1), true] : [part, false]));
}

/** A soft tint of a product color over the page ground, for image backdrops. */
export const tintOf = (hex: string) => `color-mix(in oklab, ${hex} 16%, var(--surface))`;
