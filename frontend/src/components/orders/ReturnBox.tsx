"use client";

import { useState } from "react";

import { Icon } from "@/components/Icon";
import { useStore } from "@/components/StoreProvider";
import { call } from "@/lib/client";
import { faDate, faNum } from "@/lib/format";
import type { Order } from "@/lib/types";

import styles from "./Order.module.css";

const REASONS = [
  { value: "size", label: "سایز مناسب نبود" },
  { value: "defect", label: "ایراد یا آسیب در کالا" },
  { value: "different", label: "با عکس و توضیحات فرق داشت" },
  { value: "other", label: "دلیل دیگر" },
];

/** The customer's return requests for this order, and the form to ask for one while the return window is open. */
export function ReturnBox({ order, onChange }: { order: Order; onChange: (o: Order) => void }) {
  const store = useStore();
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState<Record<number, number>>({});
  const [reason, setReason] = useState("");
  const [wants, setWants] = useState<"exchange" | "refund">("exchange");
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const win = order.return_window;
  const requests = order.returns ?? [];
  if (!win && !requests.length) return null;

  const chosen = Object.entries(qty).filter(([, n]) => n > 0).map(([item, n]) => ({ item: Number(item), qty: n }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chosen.length) return setError("کالایی که می‌خواهی برگردانی را انتخاب کن.");
    if (!reason) return setError("دلیل مرجوعی را انتخاب کن.");
    setBusy(true);
    setError("");
    try {
      onChange(await call<Order>(`/orders/${encodeURIComponent(order.number)}/return`, { method: "POST", body: { items: chosen, reason, wants, text } }));
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ثبت نشد.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={styles.returns}>
      <h2>مرجوعی و تعویض</h2>
      {requests.map((r) => (
        <div key={r.id} className={styles.returnCard}>
          <div className={styles.returnHead}>
            <b>درخواست {r.wants_label}</b>
            <span className={styles.returnStatus} data-status={r.status}>{r.status_label}</span>
          </div>
          <small>{faDate(r.created_at)} · {r.reason_label}</small>
          <ul>
            {r.items.map((i) => (
              <li key={i.item}>{i.product_name}، {i.color_name}، سایز <span className="num">{i.size_label}</span> × <span className="num">{faNum(i.qty)}</span></li>
            ))}
          </ul>
          {r.admin_note && <p className={styles.returnNote}><b>پیام فروشگاه:</b> {r.admin_note}</p>}
          {r.status === "approved" && !r.admin_note && <p className={styles.returnNote}>درخواستت تأیید شد. فروشگاه برای ارسال کالا با تو تماس می‌گیرد.</p>}
        </div>
      ))}

      {win && !win.can && !requests.length && <p className="muted">{win.problem}</p>}
      {win?.can && !open && (
        <div className={styles.returnAsk}>
          <p>
            تا {win.deadline ? faDate(win.deadline) : ""} می‌توانی کالاهای این سفارش را برگردانی یا عوض کنی.
          </p>
          <button type="button" className="btn btn-ghost" onClick={() => setOpen(true)}>
            <Icon name="ret" /> درخواست مرجوعی یا تعویض
          </button>
        </div>
      )}

      {open && (
        <form className={styles.returnForm} onSubmit={submit}>
          <fieldset>
            <legend>کدام کالاها؟</legend>
            {order.items.map((i) => (
              <div key={i.id} className={styles.returnItem}>
                <span>{i.product_name}، {i.color_name}، سایز <span className="num">{i.size_label}</span></span>
                <select className="input" aria-label={`تعداد ${i.product_name}`} value={qty[i.id] ?? 0} onChange={(e) => setQty({ ...qty, [i.id]: Number(e.target.value) })}>
                  {Array.from({ length: i.qty + 1 }, (_, n) => <option key={n} value={n}>{n === 0 ? "برنمی‌گردد" : `${faNum(n)} عدد`}</option>)}
                </select>
              </div>
            ))}
          </fieldset>
          <label className="field">
            <span className="label">دلیل</span>
            <select className="input" value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="">انتخاب کن</option>
              {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </label>
          {store.returns.type !== "exchange" && (
            <div className={styles.wants} role="radiogroup" aria-label="درخواست">
              <label><input type="radio" name="wants" checked={wants === "exchange"} onChange={() => setWants("exchange")} /> تعویض</label>
              <label><input type="radio" name="wants" checked={wants === "refund"} onChange={() => setWants("refund")} /> بازگشت وجه</label>
            </div>
          )}
          <label className="field">
            <span className="label">توضیح (اختیاری)</span>
            <textarea className="input" value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder="مثلاً برای تعویض، چه سایزی می‌خواهی؟" />
          </label>
          {error && <p className="err" role="alert">{error}</p>}
          <div className={styles.actions}>
            <button type="submit" className="btn btn-ink" disabled={busy}>{busy ? "در حال ثبت…" : "ثبت درخواست"}</button>
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>انصراف</button>
          </div>
        </form>
      )}
    </section>
  );
}
