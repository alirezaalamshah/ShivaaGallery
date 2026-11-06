import cities from "./iran-cities.json";

/**
 * Iran's 31 provinces and all their cities, for the address forms. A village or a place too new
 * for the list can still be typed in. The source of the data is noted in docs/decisions.md.
 */
export const PROVINCES: Record<string, string[]> = cities;

export const PROVINCE_NAMES = Object.keys(PROVINCES).sort((a, b) => a.localeCompare(b, "fa"));

/** The province of a city, or "" if the name is unknown or belongs to towns in several provinces. */
export function provinceOf(city: string) {
  const found = Object.entries(PROVINCES).filter(([, cities]) => cities.includes(city.trim()));
  return found.length === 1 ? found[0][0] : "";
}

/** Chosen in the city list when the place is not on it; the form then asks for its name. */
export const OTHER_CITY = "__other";

export const PROVINCE_OPTIONS = [{ value: "", label: "انتخاب استان" }, ...PROVINCE_NAMES.map((p) => ({ value: p, label: p }))];

export function cityOptions(province: string) {
  if (!province) return [{ value: "", label: "اول استان را انتخاب کن" }];
  return [{ value: "", label: "انتخاب شهر" }, ...(PROVINCES[province] ?? []).map((c) => ({ value: c, label: c })), { value: OTHER_CITY, label: "شهرم در فهرست نیست" }];
}
