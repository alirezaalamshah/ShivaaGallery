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
 */
export function PriceMatrix({
  id, label, colors, sizes, values, onChange, placeholder, mark, note, clearLabel, hint, error,
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
}) {
  const [bulk, setBulk] = useState<number | null>(null);
  const filled = colors.some((c) => sizes.some((z) => values[cellKey(c.id, z.id!)] != null));

  const apply = (only?: { color?: number; size?: number }) =>
    onChange((prev) => {
      const next = { ...prev };
      for (const c of colors) {
        if (only?.color != null && c.id !== only.color) continue;
        for (const z of sizes) {
          if (only?.size != null && z.id !== only.size) continue;
          next[cellKey(c.id, z.id!)] = bulk;
        }
      }
      return next;
    });

  return (
    <div>
      <div className="label" style={{ margin: "22px 0 8px" }}>{label}</div>
      <div className={s.bulkPrice}>
        <MoneyInput id={id} value={bulk} onChange={setBulk} placeholder="قیمت" />
        <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} disabled={bulk == null} onClick={() => apply()}>اعمال روی همه</button>
        {filled && <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} onClick={() => onChange(() => ({}))}>{clearLabel}</button>}
      </div>
      <table className={`${s.matrix} ${s.priceMatrix}`}>
        <thead>
          <tr>
            <th />
            {sizes.map((z) => (
              <th key={z.id}>
                <button type="button" className={`${s.applyHead} num`} disabled={bulk == null} onClick={() => apply({ size: z.id! })} title={`اعمال روی سایز ${z.label}`}>
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
                <button type="button" className={`${s.applyHead} ${s.colorHead}`} disabled={bulk == null} onClick={() => apply({ color: c.id })} title={`اعمال روی رنگ ${c.name}`}>
                  <i style={{ background: c.hex }} />{c.name}
                </button>
              </th>
              {sizes.map((z) => {
                const k = cellKey(c.id, z.id!);
                const v = values[k] ?? null;
                const state = mark(k, v);
                const small = note?.(k, v);
                return (
                  <td key={k}>
                    <input
                      aria-label={`${label}: ${c.name} سایز ${z.label}`}
                      aria-invalid={state === "bad"}
                      className={`num ${state === "own" ? s.own : state === "bad" ? s.zero : ""}`}
                      inputMode="numeric"
                      value={v == null ? "" : faNum(v)}
                      placeholder={placeholder(k)}
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
      {error ? <p className="err" style={{ marginTop: 6 }}>{error}</p> : <p className="hint" style={{ marginTop: 6 }}>{hint}</p>}
    </div>
  );
}
