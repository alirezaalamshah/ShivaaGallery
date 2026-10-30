"use client";

import { useState } from "react";

import { useAuth } from "@/components/auth/AuthProvider";
import { Icon } from "@/components/Icon";
import { call } from "@/lib/client";
import { toEnDigits, toFaDigits } from "@/lib/format";

import styles from "./Product.module.css";

/** "Tell me when it's back": one SMS when this color and size can be bought again. */
export function StockNotify({ variantId, what }: { variantId: number; what: string }) {
  const { me } = useAuth();
  const customer = me?.role === "customer";
  const [phone, setPhone] = useState("");
  const [done, setDone] = useState<Record<number, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const ask = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await call<{ phone: string }>("/stock-alerts", { method: "POST", body: { variant: variantId, ...(!customer && { phone }) } });
      setDone((d) => ({ ...d, [variantId]: res.phone }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "ثبت نشد.");
    } finally {
      setBusy(false);
    }
  };

  if (done[variantId]) {
    return (
      <p className={styles.notifyDone} role="status">
        <Icon name="check" /> وقتی {what} موجود شد، به <span className="num" dir="ltr">{toFaDigits(done[variantId])}</span> پیامک می‌زنیم.
      </p>
    );
  }

  return (
    <form className={styles.notify} onSubmit={ask}>
      <p><b>{what}</b> فعلاً تمام شده است.</p>
      <div className={styles.notifyRow}>
        {!customer && (
          <input
            className="input ltr num"
            inputMode="tel"
            autoComplete="tel"
            aria-label="شماره موبایل"
            placeholder="۰۹۱۲ ۰۰۰ ۰۰۰۰"
            value={toFaDigits(phone)}
            onChange={(e) => setPhone(toEnDigits(e.target.value))}
            required
          />
        )}
        <button type="submit" className="btn btn-ink" disabled={busy}>
          <Icon name="phone" /> {busy ? "در حال ثبت…" : "موجود شد خبرم کن"}
        </button>
      </div>
      {error && <p className="err" role="alert">{error}</p>}
    </form>
  );
}
