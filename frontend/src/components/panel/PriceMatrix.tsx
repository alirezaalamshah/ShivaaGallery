"use client";

import { useState } from "react";

import { faNum, toEnDigits } from "@/lib/format";

import type { AdminColor, AdminSize } from "./types";
import { MoneyInput } from "./ui";
import s from "./panel.module.css";

export type Prices = Record<string, number | null>;

export const cellKey = (c: number, z: number) => `${c}-${z}`;

/**
 * A color × size table of prices. A price typed above the table can be put on every
 * cell at once, or on one color's row or one size's column by clicking its name.
 * Cells that are `locked` (sizes out of stock) take no price, so nobody prices what cannot be sold.
 * With `percentOf`, the price above the table can also be typed as a percentage off.
 */
export function PriceMatrix({
  id, label, colors, sizes, values, onChange, placeholder, mark, note, clearLabel, hint, error, locked, percentOf,
}: {
  id: string;
  label: string;
  colors: AdminColor[];
  sizes: AdminSize[];
  values: Prices;
  onChange: (update: (prev: Prices) => Prices) => void;
  placeholder: (k: string) => string;
  mark: (k: string, v: number | null) => "own" | "bad" | null;
  note?: (k: string, v: number | null) => string | null;
  clearLabel: string;
  hint: React.ReactNode;
  error?: string;
  locked?: (k: string) => boolean;
  /** The price of a cell after `pct` percent off, for typing a sale as a percentage. */
  percentOf?: (k: string, pct: number) => number | null;
}) {
  const [bulk, setBulk] = useState<number | null>(null);
  const [mode, setMode] = useState<"amount" | "percent">(percentOf ? "percent" : "amount");
  const isLocked = (k: string) => locked?.(k) ?? false;
  const filled = colors.some((c) => sizes.some((z) => values[cellKey(c.id, z.id!)] != null));
  const ready = bulk != null && (mode === "amount" || (bulk > 0 && bulk < 100));

  const apply = (only?: { color?: number; size?: number }) =>
    onChange((prev) => {
      const next = { ...prev };
      for (const c of colors) {
        if (only?.color != null && c.id !== only.color) continue;
        for (const z of sizes) {
          if (only?.size != null && z.id !== only.size) continue;
          const k = cellKey(c.id, z.id!);
          if (isLocked(k)) continue;
          next[k] = mode === "percent" && percentOf && bulk != null ? percentOf(k, bulk) : bulk;
        }
      }
      return next;
    });

  return (
    <div>
      {label && <div className="label" style={{ margin: "4px 0 8px" }}>{label}</div>}
      <div className={s.bulkPrice}>
        {percentOf && (
          <span className={s.tabs} role="group" aria-label="نوع مقدار">
            <button type="button" className={s.tab} aria-pressed={mode === "percent"} onClick={() => { setMode("percent"); setBulk(null); }}>درصد</button>
            <button type="button" className={s.tab} aria-pressed={mode === "amount"} onClick={() => { setMode("amount"); setBulk(null); }}>تومان</button>
          </span>
        )}
        {mode === "percent" ? (
          <input
            id={id}
            className="input num"
            inputMode="numeric"
            placeholder="مثلاً ۲۰"
            value={bulk == null ? "" : faNum(bulk)}
            onChange={(e) => {
              const raw = toEnDigits(e.target.value).replace(/\D/g, "").slice(0, 2);
              setBulk(raw ? Number(raw) : null);
            }}
            aria-label="درصد تخفیف"
            style={{ width: 110 }}
          />
        ) : (
          <MoneyInput id={id} value={bulk} onChange={setBulk} placeholder="قیمت" />
        )}
        <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} disabled={!ready} onClick={() => apply()}>اعمال روی همه‌ی موجودها</button>
        {filled && <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} onClick={() => onChange(() => ({}))}>{clearLabel}</button>}
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className={`${s.matrix} ${s.priceMatrix}`}>
          <thead>
            <tr>
              <th />
              {sizes.map((z) => (
                <th key={z.id}>
                  <button type="button" className={`${s.applyHead} num`} disabled={!ready} onClick={() => apply({ size: z.id! })} title={`اعمال روی سایز ${z.label}`}>
                    {z.label}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {colors.map((c) => (
              <tr key={c.id}>
                <th>
                  <button type="button" className={`${s.applyHead} ${s.colorHead}`} disabled={!ready} onClick={() => apply({ color: c.id })} title={`اعمال روی رنگ ${c.name}`}>
                    <i style={{ background: c.hex }} />{c.name}
                  </button>
                </th>
                {sizes.map((z) => {
                  const k = cellKey(c.id, z.id!);
                  const v = values[k] ?? null;
                  const off = isLocked(k);
                  const state = off ? null : mark(k, v);
                  const small = off ? null : note?.(k, v);
                  return (
                    <td key={k}>
                      <input
                        aria-label={`${label || "قیمت"}: ${c.name} سایز ${z.label}${off ? "، ناموجود" : ""}`}
                        aria-invalid={state === "bad"}
                        className={`num ${off ? s.lockedCell : state === "own" ? s.own : state === "bad" ? s.zero : ""}`}
                        inputMode="numeric"
                        disabled={off}
                        title={off ? "این رنگ و سایز موجودی ندارد؛ اول موجودی‌اش را وارد کنید" : undefined}
                        value={off ? "" : v == null ? "" : faNum(v)}
                        placeholder={off ? "ناموجود" : placeholder(k)}
                        onFocus={(e) => e.currentTarget.select()}
                        onChange={(e) => {
                          const raw = toEnDigits(e.target.value).replace(/\D/g, "");
                          onChange((prev) => ({ ...prev, [k]: raw ? Number(raw) : null }));
                        }}
                      />
                      {small && <small className={`${s.cellNote} num`}>{small}</small>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error ? <p className="err" style={{ marginTop: 6 }}>{error}</p> : <p className="hint" style={{ marginTop: 6 }}>{hint}</p>}
    </div>
  );
}
