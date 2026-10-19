"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { Icon } from "@/components/Icon";
import { navStart } from "@/components/NavProgress";
import { faNum, toEnDigits } from "@/lib/format";
import type { Facets } from "@/lib/types";

import styles from "./Listing.module.css";

const SORTS = [
  { value: "", label: "جدیدترین" },
  { value: "current", label: "ارزان‌ترین" },
  { value: "-current", label: "گران‌ترین" },
];

export function FilterBar({ facets, count }: { facets: Facets; count: number }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const list = (key: string) => (params.get(key) ?? "").split(",").filter(Boolean);
  const push = (next: URLSearchParams) => {
    next.delete("page");
    const qs = next.toString();
    navStart();
    startTransition(() => router.push(qs ? `${path}?${qs}` : path, { scroll: false }));
  };
  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    push(next);
  };
  const toggleIn = (key: string, id: number) => {
    const cur = new Set(list(key));
    const k = String(id);
    if (cur.has(k)) cur.delete(k);
    else cur.add(k);
    set(key, [...cur].join(","));
  };

  const activeCount = ["color", "size", "min_price", "max_price", "in_stock", "on_sale"].reduce(
    (n, k) => n + (params.get(k) ? 1 : 0),
    0,
  );
  const sizes = facets.size_systems.flatMap((s) => s.sizes);

  const onPrice = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const next = new URLSearchParams(params);
    for (const key of ["min_price", "max_price"]) {
      const raw = toEnDigits(String(form.get(key) ?? "")).replace(/\D/g, "");
      if (raw) next.set(key, raw);
      else next.delete(key);
    }
    push(next);
  };

  return (
    <div className={`${styles.bar} ${pending ? styles.pending : ""}`}>
      <div className={styles.barRow}>
        <button type="button" className="chip" aria-expanded={open} aria-controls="filters" onClick={() => setOpen(!open)}>
          <Icon name="filter" className={styles.chipIcon} />
          فیلتر{activeCount > 0 && <span className="num"> ({faNum(activeCount)})</span>}
        </button>
        <button type="button" className="chip" aria-pressed={params.get("on_sale") === "true"} onClick={() => set("on_sale", params.get("on_sale") ? null : "true")}>
          حراج
        </button>
        <button type="button" className="chip" aria-pressed={params.get("in_stock") === "true"} onClick={() => set("in_stock", params.get("in_stock") ? null : "true")}>
          فقط موجود
        </button>
        <label className={styles.sort}>
          <span className="sr-only">مرتب‌سازی</span>
          <select id="sort" value={params.get("ordering") ?? ""} onChange={(e) => set("ordering", e.target.value || null)}>
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <span className={`${styles.count} num`} aria-live="polite">
          {faNum(count)} محصول
        </span>
      </div>

      <div id="filters" className={`${styles.panel} ${open ? styles.on : ""}`}>
        <div>
          <fieldset className={styles.group}>
            <legend>رنگ</legend>
            <div className={styles.swatches}>
              {facets.colors.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={list("color").includes(String(c.id))}
                  onClick={() => toggleIn("color", c.id)}
                  className={styles.swatch}
                >
                  <i style={{ background: c.hex }} />
                  {c.name}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className={styles.group}>
            <legend>سایز</legend>
            <div className={styles.swatches}>
              {sizes.map((z) => (
                <button key={z.id} type="button" className="chip num" aria-pressed={list("size").includes(String(z.id))} onClick={() => toggleIn("size", z.id)}>
                  {z.label}
                </button>
              ))}
            </div>
          </fieldset>
          <form className={styles.group} onSubmit={onPrice}>
            <fieldset className={styles.priceRow}>
              <legend>قیمت (تومان)</legend>
              <label>
                <span className="sr-only">از</span>
                <input id="min_price" name="min_price" inputMode="numeric" placeholder="از" defaultValue={params.get("min_price") ? faNum(Number(params.get("min_price"))) : ""} />
              </label>
              <label>
                <span className="sr-only">تا</span>
                <input id="max_price" name="max_price" inputMode="numeric" placeholder="تا" defaultValue={params.get("max_price") ? faNum(Number(params.get("max_price"))) : ""} />
              </label>
              <button type="submit" className="chip">اعمال</button>
            </fieldset>
          </form>
          {activeCount > 0 && (
            <button type="button" className={styles.clear} onClick={() => push(new URLSearchParams(params.get("search") ? { search: params.get("search")! } : {}))}>
              حذف همه‌ی فیلترها
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
