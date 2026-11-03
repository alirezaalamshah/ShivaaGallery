"use client";

import Link from "next/link";
import { useState } from "react";

import { useToast } from "@/components/Toast";
import { faDateTime, faNum, toFaDigits } from "@/lib/format";

import { adminCall, refreshSite, useAdmin } from "./hooks";
import { useCan } from "./access";
import type { Paged } from "./types";
import { Card, ConfirmButton, Empty, PageHead, Pager } from "./ui";
import s from "./panel.module.css";

type Review = {
  id: number;
  product: number;
  product_name: string;
  product_slug: string;
  author: string;
  phone: string;
  rating: number;
  text: string;
  status: "pending" | "approved" | "rejected";
  status_label: string;
  reply: string;
  created_at: string;
};

const TABS = [
  { value: "pending", label: "در انتظار بررسی" },
  { value: "approved", label: "منتشر شده" },
  { value: "rejected", label: "رد شده" },
  { value: "", label: "همه" },
];

/** Buyers' reviews: approve to show them on the product page, answer, or reject. */
export function Reviews() {
  const toast = useToast();
  const [status, setStatus] = useState("pending");
  const manage = useCan()("reviews.manage");
  const [page, setPage] = useState(1);
  const [replying, setReplying] = useState<number | null>(null);
  const [reply, setReply] = useState("");
  const { data, setData, loading } = useAdmin<Paged<Review>>(`/reviews?page=${page}${status ? `&status=${status}` : ""}`);

  const save = async (r: Review, body: Partial<Review>, done: string) => {
    try {
      const fresh = await adminCall<Review>(`/reviews/${r.id}`, { method: "PATCH", body });
      setData((d) => d && { ...d, results: d.results.map((x) => (x.id === r.id ? fresh : x)) });
      toast({ text: done });
      refreshSite();
    } catch (e) {
      toast({ text: e instanceof Error ? e.message : "ذخیره نشد." });
    }
  };

  const remove = async (r: Review) => {
    try {
      await adminCall(`/reviews/${r.id}`, { method: "DELETE" });
      setData((d) => d && { ...d, results: d.results.filter((x) => x.id !== r.id) });
      refreshSite();
    } catch (e) {
      toast({ text: e instanceof Error ? e.message : "حذف نشد." });
    }
  };

  return (
    <>
      <PageHead title="نظرات خریداران" sub="فقط کسانی که محصول را دریافت کرده‌اند می‌توانند نظر بدهند. نظر بعد از تأیید شما در صفحه‌ی محصول نمایش داده می‌شود." />
      <Card>
        <div className={s.toolbar}>
          <div className={s.tabs} role="group" aria-label="وضعیت">
            {TABS.map((t) => (
              <button key={t.value} type="button" className={s.tab} aria-pressed={status === t.value} onClick={() => { setStatus(t.value); setPage(1); }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
        {data?.results.length ? (
          <ul className={s.reviewList}>
            {data.results.map((r) => (
              <li key={r.id}>
                <div className={s.reviewHead}>
                  <span className={s.reviewStars} aria-label={`${faNum(r.rating)} از ۵`}>{"★".repeat(r.rating)}<i>{"★".repeat(5 - r.rating)}</i></span>
                  <Link href={`/p/${r.product_slug}`} target="_blank"><b>{r.product_name}</b></Link>
                  <span className="muted">{r.author} · <span className="num" dir="ltr">{toFaDigits(r.phone)}</span> · {faDateTime(r.created_at)}</span>
                  <span className="pill" data-status={r.status === "approved" ? "delivered" : r.status === "rejected" ? "cancelled" : "awaiting_payment"}>{r.status_label}</span>
                </div>
                {r.text ? <p>{r.text}</p> : <p className="muted">(فقط امتیاز داده است)</p>}
                {r.reply && replying !== r.id && <p className={s.reviewReply}><b>پاسخ شما:</b> {r.reply}</p>}
                {replying === r.id && (
                  <div className={s.stack}>
                    <textarea className="input" value={reply} onChange={(e) => setReply(e.target.value)} maxLength={1000} placeholder="پاسخ فروشگاه، زیر نظر نمایش داده می‌شود" autoFocus />
                    <div className={s.actions}>
                      <button type="button" className={`${s.btn} ${s.btnSm}`} onClick={async () => { await save(r, { reply }, "پاسخ ذخیره شد"); setReplying(null); }}>ذخیره‌ی پاسخ</button>
                      <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} onClick={() => setReplying(null)}>انصراف</button>
                    </div>
                  </div>
                )}
                {manage && (
                <div className={s.actions}>
                  {r.status !== "approved" && <button type="button" className={`${s.btn} ${s.btnSm}`} onClick={() => save(r, { status: "approved" }, "نظر منتشر شد")}>تأیید و انتشار</button>}
                  {r.status !== "rejected" && <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} onClick={() => save(r, { status: "rejected" }, "نظر رد شد")}>رد</button>}
                  {replying !== r.id && <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} onClick={() => { setReply(r.reply); setReplying(r.id); }}>{r.reply ? "ویرایش پاسخ" : "پاسخ"}</button>}
                  <ConfirmButton label="حذف" small onConfirm={() => remove(r)} />
                </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          !loading && <Empty icon="heart" title={status === "pending" ? "نظری در انتظار بررسی نیست" : "نظری پیدا نشد"} />
        )}
        {data && <Pager page={page} pages={data.pages} onChange={setPage} />}
      </Card>
    </>
  );
}
