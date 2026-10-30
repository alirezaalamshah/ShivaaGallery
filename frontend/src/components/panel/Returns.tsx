"use client";

import Link from "next/link";
import { useState } from "react";

import { useToast } from "@/components/Toast";
import { faDateTime, faNum, toFaDigits } from "@/lib/format";
import type { ReturnRequest } from "@/lib/types";

import { adminCall, refreshSite, useAdmin } from "./hooks";
import type { Paged } from "./types";
import { Card, Empty, PageHead } from "./ui";
import s from "./panel.module.css";

type AdminReturn = ReturnRequest & {
  order_id: number;
  order_number: string;
  receiver_name: string;
  phone: string;
  next_statuses: { value: string; label: string }[];
};

const TABS = [
  { value: "open", label: "باز" },
  { value: "pending", label: "در انتظار بررسی" },
  { value: "approved", label: "تأیید شده" },
  { value: "completed", label: "انجام شده" },
  { value: "rejected", label: "رد شده" },
  { value: "", label: "همه" },
];

const PILL: Record<string, string> = { pending: "awaiting_payment", approved: "processing", completed: "delivered", rejected: "cancelled" };

/**
 * Customers' return and exchange requests. Approve, then mark «done» once the piece arrives:
 * that puts it back in stock. Refunds and exchanges themselves are handled by the shop.
 */
export function Returns() {
  const toast = useToast();
  const [status, setStatus] = useState("open");
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const { data, setData, loading } = useAdmin<Paged<AdminReturn>>(`/returns${status ? `?status=${status}` : ""}`);

  const update = async (r: AdminReturn, next?: string) => {
    setBusy(r.id);
    try {
      const fresh = await adminCall<AdminReturn>(`/returns/${r.id}/update_status`, {
        method: "POST",
        body: { ...(next && { status: next }), admin_note: notes[r.id] ?? r.admin_note },
      });
      setData((d) => d && { ...d, results: d.results.map((x) => (x.id === r.id ? fresh : x)) });
      toast({ text: !next ? "پیام ذخیره شد" : next === "completed" ? "انجام شد و کالا به موجودی برگشت" : "ذخیره شد و به مشتری پیامک رفت" });
      if (next === "completed") refreshSite();
    } catch (e) {
      toast({ text: e instanceof Error ? e.message : "ذخیره نشد." });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHead title="مرجوعی‌ها" sub="درخواست‌های مرجوعی و تعویض مشتری‌ها. با «انجام شد»، کالای برگشتی خودکار به موجودی اضافه می‌شود." />
      <Card>
        <div className={s.toolbar}>
          <div className={s.tabs} role="group" aria-label="وضعیت">
            {TABS.map((t) => (
              <button key={t.value} type="button" className={s.tab} aria-pressed={status === t.value} onClick={() => setStatus(t.value)}>{t.label}</button>
            ))}
          </div>
        </div>
        {data?.results.length ? (
          <ul className={s.reviewList}>
            {data.results.map((r) => (
              <li key={r.id}>
                <div className={s.reviewHead}>
                  <Link href={`/panel/orders/${r.order_id}`} className="num" dir="ltr"><b>#{toFaDigits(r.order_number)}</b></Link>
                  <span>{r.receiver_name} · <a href={`tel:${r.phone}`} className="num" dir="ltr">{toFaDigits(r.phone)}</a></span>
                  <span className="muted">{faDateTime(r.created_at)}</span>
                  <span className="pill" data-status={PILL[r.status]}>{r.status_label}</span>
                </div>
                <p>
                  <b>{r.wants_label}</b> · {r.reason_label}
                </p>
                <ul className={s.returnItems}>
                  {r.items.map((i) => (
                    <li key={i.item}>{i.product_name}، {i.color_name}، سایز <span className="num">{i.size_label}</span> × <span className="num">{faNum(i.qty)}</span></li>
                  ))}
                </ul>
                {r.text && <p className="muted">«{r.text}»</p>}
                {r.next_statuses.length > 0 ? (
                  <>
                    <textarea
                      className="input"
                      value={notes[r.id] ?? r.admin_note}
                      onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })}
                      maxLength={1000}
                      placeholder="پیام به مشتری، مثلاً آدرس ارسال کالا یا زمان بازگشت وجه"
                    />
                    <div className={s.actions}>
                      {r.next_statuses.map((n) => (
                        <button
                          key={n.value}
                          type="button"
                          className={`${s.btn} ${s.btnSm} ${n.value === "rejected" ? s.btnGhost : ""}`}
                          disabled={busy === r.id}
                          onClick={() => update(r, n.value)}
                        >
                          {n.value === "approved" ? "تأیید درخواست" : n.value === "completed" ? "کالا رسید، انجام شد" : "رد درخواست"}
                        </button>
                      ))}
                      {(notes[r.id] ?? r.admin_note) !== r.admin_note && (
                        <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} disabled={busy === r.id} onClick={() => update(r)}>فقط ذخیره‌ی پیام</button>
                      )}
                    </div>
                  </>
                ) : (
                  r.admin_note && <p className={s.reviewReply}><b>پیام شما:</b> {r.admin_note}</p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          !loading && <Empty icon="ret" title={status === "open" ? "درخواست بازی نیست" : "درخواستی پیدا نشد"} />
        )}
      </Card>
    </>
  );
}
