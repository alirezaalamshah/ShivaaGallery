"use client";

import { useEffect, useState } from "react";

import { useAuth } from "@/components/auth/AuthProvider";
import { useStore } from "@/components/StoreProvider";
import { useToast } from "@/components/Toast";
import { faDate, faDateTime, faNum } from "@/lib/format";

import { isoDay } from "../dates";
import { adminCall, useAdmin } from "../hooks";
import { Card, Field, MoneyInput } from "../ui";
import s from "../panel.module.css";
import p from "./pos.module.css";
import type { Drawer, TillCloseRow } from "./types";

const diffText = (n: number) => (n === 0 ? "برابر است" : n > 0 ? `${faNum(n)} بیشتر` : `${faNum(-n)} کم`);

/**
 * The end-of-day count. The system works out the cash that should be in the drawer; the seller
 * counts it, and the difference is recorded. What stays in the drawer starts tomorrow's count.
 */
export function TillClose() {
  const store = useStore();
  const toast = useToast();
  const { me } = useAuth();
  const admin = me?.role === "admin";
  const today = isoDay(new Date());
  const [day, setDay] = useState(today);
  const { data, reload } = useAdmin<{ drawer: Drawer; closed: TillCloseRow | null; history: TillCloseRow[] }>(`/pos/close?date=${day}`);
  const [counted, setCounted] = useState<number | null>(null);
  const [card, setCard] = useState<number | null>(null);
  const [left, setLeft] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const c = data?.closed;
    setCounted(c ? c.counted_cash : null);
    setCard(c ? c.counted_card : null);
    setLeft(c ? c.left_in_drawer : null);
    setNote(c ? c.note : "");
    setError("");
  }, [data]);

  if (!data) return null;
  const d = data.drawer;
  const diff = counted === null ? null : counted - d.expected_cash;
  const cardDiff = card === null ? null : card - d.card_total;

  const save = async () => {
    if (counted === null) {
      setError("نقد داخل صندوق را بشمارید و بنویسید.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await adminCall("/pos/close", { method: "POST", body: { day, counted_cash: counted, counted_card: card, left_in_drawer: left ?? 0, note } });
      toast({ text: "صندوق بسته شد" });
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "ثبت نشد.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {admin && (
        <div className={p.dayNav}>
          <b>{day === today ? "امروز، " : ""}{faDate(`${day}T12:00:00`)}</b>
          <input type="date" className="input ltr" aria-label="انتخاب روز" value={day} max={today} onChange={(e) => e.target.value && setDay(e.target.value)} />
        </div>
      )}

      <div className={p.closeGrid}>
        <Card title="حساب صندوق طبق سیستم">
          <dl className={p.drawerSum}>
            <div><dt>موجودی اول روز</dt><dd className="num">{faNum(d.opening_cash)}</dd></div>
            <div><dt>نقد خالص فروش ({faNum(d.sale_count)} فاکتور)</dt><dd className="num">{faNum(d.cash_sales)}</dd></div>
            {d.cash_expenses > 0 && <div><dt>هزینه‌های پرداخت‌شده از صندوق</dt><dd className="num">− {faNum(d.cash_expenses)}</dd></div>}
            <div className={p.expected}><dt>نقد که باید در صندوق باشد</dt><dd className="num"><b>{faNum(d.expected_cash)}</b> {store.currency_label}</dd></div>
            <div><dt>کارت‌خوان</dt><dd className="num">{faNum(d.card_total)}</dd></div>
            <div><dt>کارت به کارت</dt><dd className="num">{faNum(d.transfer_total)}</dd></div>
          </dl>
          <p className="hint">موجودی اول روز همان پولی است که دیروز موقع بستن صندوق در آن ماند. پولی که به مشتری پس داده شده از نقد فروش کم شده است.</p>
        </Card>

        <Card title={data.closed ? "صندوق این روز بسته شده" : "شمارش و بستن صندوق"}>
          <div className={s.stack}>
            {data.closed && (
              <p className="hint">
                {data.closed.closed_by} در {faDateTime(data.closed.closed_at)} بست. اگر بعد از آن فروشی ثبت شده، دوباره بشمارید و ثبت کنید.
              </p>
            )}
            <Field label="نقد شمرده‌شده در صندوق">
              <MoneyInput id="close-cash" value={counted} onChange={setCounted} placeholder="۰" />
            </Field>
            {diff !== null && (
              <p className={`${p.diff} ${diff < 0 ? p.diffShort : diff === 0 ? p.diffOk : ""}`} role="status">
                {diff === 0 ? "نقد صندوق درست است." : diff < 0 ? `${faNum(-diff)} ${store.currency_label} کسری دارد.` : `${faNum(diff)} ${store.currency_label} اضافه دارد.`}
              </p>
            )}
            <Field label="جمع رسید کارت‌خوان (اختیاری)" hint="عدد گزارش پایان روز دستگاه کارت‌خوان">
              <MoneyInput id="close-card" value={card} onChange={setCard} placeholder="اختیاری" />
            </Field>
            {cardDiff !== null && cardDiff !== 0 && (
              <p className={`${p.diff} ${p.diffShort}`}>کارت‌خوان با سیستم {diffText(cardDiff)} است.</p>
            )}
            <Field label="پولی که برای فردا در صندوق می‌ماند" hint="بقیه‌ی نقد را برمی‌دارید یا به حساب می‌گذارید">
              <MoneyInput id="close-left" value={left} onChange={setLeft} placeholder="۰" />
            </Field>
            <Field label="یادداشت (اختیاری)">
              <input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="مثلاً دلیل کسری" />
            </Field>
            {error && <p className="err" role="alert">{error}</p>}
            <button type="button" className={s.btn} disabled={busy} onClick={save}>
              {data.closed ? "ثبت دوباره" : "بستن صندوق"}
            </button>
          </div>
        </Card>
      </div>

      {data.history.length > 0 && (
        <Card title="بستن‌های اخیر">
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr><th>روز</th><th>نقد مورد انتظار</th><th>شمرده‌شده</th><th>اختلاف</th><th>کارت‌خوان</th><th>ماند در صندوق</th><th>بست</th></tr>
              </thead>
              <tbody>
                {data.history.map((c) => (
                  <tr key={c.day} className={admin ? s.rowLink : undefined} onClick={admin ? () => setDay(c.day) : undefined}>
                    <td>{faDate(`${c.day}T12:00:00`)}</td>
                    <td className="num">{faNum(c.expected_cash)}</td>
                    <td className="num">{faNum(c.counted_cash)}</td>
                    <td className={`num ${c.difference < 0 ? "err" : ""}`}>{diffText(c.difference)}</td>
                    <td className="num">{faNum(c.card_total)}{c.counted_card !== null && c.counted_card !== c.card_total ? ` (رسید ${faNum(c.counted_card)})` : ""}</td>
                    <td className="num">{faNum(c.left_in_drawer)}</td>
                    <td>{c.closed_by}{c.note && <small className="muted"> · {c.note}</small>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
