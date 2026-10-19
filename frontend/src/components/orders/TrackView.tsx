"use client";

import { useState } from "react";

import { call } from "@/lib/client";
import { toEnDigits, toFaDigits } from "@/lib/format";
import type { Order } from "@/lib/types";

import { OrderView } from "./OrderView";

export function TrackView() {
  const [number, setNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      setOrder(await call<Order>("/orders/track", { method: "POST", body: { number: toEnDigits(number).replace(/\D/g, ""), phone: toEnDigits(phone) } }));
    } catch (err) {
      setOrder(null);
      setError(err instanceof Error ? err.message : "پیدا نشد.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ maxWidth: 720, marginInline: "auto", padding: "28px 16px 64px", display: "grid", gap: 18 }}>
      <div>
        <span className="latin" style={{ fontSize: 11, color: "var(--accent-ink)" }}>Track order</span>
        <h1 className="page-title">پیگیری سفارش</h1>
        <p style={{ color: "var(--muted)", margin: "4px 0 0" }}>شماره‌ی سفارش و موبایلی که با آن خرید کردی را بنویس.</p>
      </div>
      <form onSubmit={submit} style={{ display: "grid", gap: 12, padding: 18, borderRadius: 18, background: "var(--surface)", border: "1px solid var(--line)" }}>
        <div className="row2">
          <label className="field">
            <span className="label">شماره‌ی سفارش</span>
            <input id="track-number" className="input ltr num" inputMode="numeric" value={toFaDigits(number)} onChange={(e) => setNumber(toEnDigits(e.target.value))} required />
          </label>
          <label className="field">
            <span className="label">شماره موبایل</span>
            <input id="track-phone" className="input ltr num" inputMode="tel" placeholder="۰۹۱۲ ۰۰۰ ۰۰۰۰" value={toFaDigits(phone)} onChange={(e) => setPhone(toEnDigits(e.target.value))} required />
          </label>
        </div>
        {error && <p className="err" role="alert">{error}</p>}
        <button type="submit" className="btn btn-ink" disabled={busy} style={{ borderRadius: 14 }}>
          {busy ? "در حال جستجو…" : "پیگیری"}
        </button>
      </form>
      {order && <OrderView order={order} />}
    </div>
  );
}
