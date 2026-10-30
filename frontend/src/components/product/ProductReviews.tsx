"use client";

import { useEffect, useState } from "react";

import { useAuth } from "@/components/auth/AuthProvider";
import { call } from "@/lib/client";
import { faDate, faNum } from "@/lib/format";
import type { Reviews } from "@/lib/types";

import styles from "./Reviews.module.css";

function Stars({ value, size = 16 }: { value: number; size?: number }) {
  return (
    <span className={styles.stars} style={{ "--pct": `${(value / 5) * 100}%`, fontSize: size } as React.CSSProperties} aria-label={`${faNum(value)} از ۵`} role="img">
      <span aria-hidden="true">★★★★★</span>
    </span>
  );
}

/** Buyers' ratings and comments. Only customers who received this product can write one; the store approves it first. */
export function ProductReviews({ slug }: { slug: string }) {
  const { me } = useAuth();
  const [data, setData] = useState<Reviews | null>(null);
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const url = `/products/${encodeURIComponent(slug)}/reviews`;

  useEffect(() => {
    call<Reviews>(url).then(setData).catch(() => {});
  }, [url, me]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rating) {
      setError("به این محصول از ۱ تا ۵ ستاره بده.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      setData(await call<Reviews>(url, { method: "POST", body: { rating, text } }));
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ثبت نشد.");
    } finally {
      setBusy(false);
    }
  };

  if (!data) return null;
  const mine = data.mine;
  const showForm = data.can_review && (!mine || editing);

  return (
    <section className={styles.wrap} aria-labelledby="reviews-title" data-reveal>
      <header className={styles.head}>
        <div>
          <span className="latin">Reviews</span>
          <h2 id="reviews-title">نظرات خریداران</h2>
        </div>
        {data.average != null && (
          <div className={styles.summary}>
            <b className="num">{faNum(data.average)}</b>
            <Stars value={data.average} size={18} />
            <small className="num">{faNum(data.count)} نظر</small>
          </div>
        )}
      </header>

      {mine && !editing && (
        <div className={styles.mine}>
          <div>
            <b>نظر شما</b> <span className={styles.status} data-status={mine.status}>{mine.status_label}</span>
          </div>
          <Stars value={mine.rating} />
          {mine.text && <p>{mine.text}</p>}
          {data.can_review && (
            <button type="button" className={styles.link} onClick={() => { setRating(mine.rating); setText(mine.text); setEditing(true); }}>
              ویرایش نظر
            </button>
          )}
        </div>
      )}

      {showForm && (
        <form className={styles.form} onSubmit={submit}>
          <div className={styles.pick} role="radiogroup" aria-label="امتیاز">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${faNum(n)} ستاره`} className={n <= rating ? styles.on : undefined} onClick={() => { setRating(n); setError(""); }}>
                ★
              </button>
            ))}
          </div>
          <textarea className="input" value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder="جنس، اندازه و دوخت چطور بود؟ (اختیاری)" />
          {error && <p className="err" role="alert">{error}</p>}
          <div className={styles.actions}>
            <button type="submit" className="btn btn-ink" disabled={busy}>{busy ? "در حال ثبت…" : "ثبت نظر"}</button>
            {editing && <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>انصراف</button>}
          </div>
          <p className="hint">نظر بعد از تأیید فروشگاه نمایش داده می‌شود.</p>
        </form>
      )}

      {data.items.length ? (
        <ul className={styles.list}>
          {data.items.map((r) => (
            <li key={r.id}>
              <div className={styles.meta}>
                <b>{r.author}</b>
                <Stars value={r.rating} size={14} />
                <small>{faDate(r.created_at)}</small>
              </div>
              {r.text && <p>{r.text}</p>}
              {r.reply && (
                <p className={styles.reply}>
                  <b>پاسخ فروشگاه:</b> {r.reply}
                </p>
              )}
            </li>
          ))}
        </ul>
      ) : (
        !mine && <p className={styles.empty}>هنوز نظری ثبت نشده. خریداران این مدل بعد از دریافت سفارش می‌توانند نظر بدهند.</p>
      )}
    </section>
  );
}
