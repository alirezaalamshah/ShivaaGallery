"use client";

import Link from "next/link";

import { Icon } from "@/components/Icon";
import { ProductMedia } from "@/components/ProductMedia";
import { useStore } from "@/components/StoreProvider";
import { faDate, faDateTime, faNum, toFaDigits } from "@/lib/format";
import type { Order, OrderStatus } from "@/lib/types";

import styles from "./Order.module.css";

const FLOW: { status: OrderStatus; label: string }[] = [
  { status: "awaiting_payment", label: "ثبت سفارش" },
  { status: "paid", label: "پرداخت" },
  { status: "processing", label: "آماده‌سازی" },
  { status: "shipped", label: "ارسال" },
  { status: "delivered", label: "تحویل" },
];

export function OrderTimeline({ order }: { order: Order }) {
  if (order.status === "cancelled") {
    return <p className={styles.cancelled}>این سفارش لغو شده است.</p>;
  }
  const reached = new Set(order.events.map((e) => e.status));
  const idx = Math.max(...FLOW.map((f, i) => (reached.has(f.status) || f.status === order.status ? i : -1)));
  const when = (s: OrderStatus) => order.events.find((e) => e.status === s)?.created_at;
  return (
    <ol className={styles.timeline} style={{ "--progress": idx / (FLOW.length - 1) } as React.CSSProperties}>
      {FLOW.map((f, i) => {
        const at = when(f.status) ?? (i === 0 ? order.created_at : undefined);
        return (
          <li key={f.status} className={i <= idx ? styles.reached : undefined} style={{ "--i": i } as React.CSSProperties}>
            <span className={styles.node}>{i <= idx ? <Icon name="check" /> : null}</span>
            <b>{f.label}</b>
            {at && <small>{faDateTime(at)}</small>}
          </li>
        );
      })}
    </ol>
  );
}

export function OrderView({ order, celebrate = false, actions }: { order: Order; celebrate?: boolean; actions?: React.ReactNode }) {
  const { currency_label, online_payment } = useStore();
  return (
    <div className={styles.wrap}>
      {celebrate && (
        <div className={styles.celebrate}>
          <svg viewBox="0 0 120 120" aria-hidden="true" className={styles.ok}>
            {Array.from({ length: 36 }, (_, i) => {
              const a = (i / 36) * Math.PI * 2;
              return <circle key={i} className={styles.spark} style={{ "--i": i } as React.CSSProperties} cx={60 + Math.cos(a) * 54} cy={60 + Math.sin(a) * 54} r={i % 3 ? 1.6 : 2.6} />;
            })}
            <circle className={styles.ringDraw} cx="60" cy="60" r="44" fill="none" strokeWidth="2.5" />
            <path className={styles.tick} d="M41 61l13 13 26-28" fill="none" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <h1>{order.paid_at ? "پرداخت انجام شد" : "سفارشت ثبت شد"}</h1>
          <p>
            {order.paid_at
              ? "سفارشت قطعی شد و به‌زودی آماده و ارسال می‌شود. پیامک تأیید هم برایت فرستاده شد."
              : "کالاهای این سفارش برایت کنار گذاشته شد. پیامک ثبت سفارش هم برایت فرستاده می‌شود."}
          </p>
        </div>
      )}

      <header className={styles.head}>
        <div>
          <span className={styles.no}>
            سفارش <b className="num" dir="ltr">#{toFaDigits(order.number)}</b>
          </span>
          <span className={styles.date}>{faDate(order.created_at)}</span>
        </div>
        <span className="pill" data-status={order.status}>{order.status_label}</span>
      </header>

      <OrderTimeline order={order} />

      {order.status === "awaiting_payment" && (
        <div className={styles.note}>
          <Icon name="card" />
          <span>
            {online_payment
              ? "این سفارش هنوز پرداخت نشده است."
              : <>فروشگاه برای هماهنگی پرداخت با شماره‌ی <b className="num" dir="ltr">{toFaDigits(order.phone)}</b> تماس می‌گیرد.</>}
            {order.payment_deadline && (
              <> کالاها تا <b className="num">{faDateTime(order.payment_deadline)}</b> برایت کنار گذاشته شده‌اند؛ بعد از آن، سفارش پرداخت‌نشده خودکار لغو می‌شود.</>
            )}
          </span>
        </div>
      )}
      {actions}
      {order.tracking_code && (
        <div className={styles.note}>
          <Icon name="truck" />
          <span>کد رهگیری مرسوله: <b className="num" dir="ltr">{toFaDigits(order.tracking_code)}</b> ({order.shipping_name})</span>
        </div>
      )}

      <section className={styles.card}>
        <h2>اقلام سفارش</h2>
        <ul className={styles.items}>
          {order.items.map((it, i) => (
            <li key={i}>
              <Link href={`/p/${it.product_slug}`} className={styles.th}>
                <ProductMedia image={it.image || null} alt={it.product_name} sizes="64px" />
              </Link>
              <span>
                <b>{it.product_name}</b>
                <small>
                  {it.color_name}، سایز <span className="num">{it.size_label}</span>، <span className="num">{faNum(it.qty)}</span> عدد
                </small>
              </span>
              <span className="num">{faNum(it.line_total)}</span>
            </li>
          ))}
        </ul>
        <div className={styles.totals}>
          <div><span>جمع کالاها</span><b className="num">{faNum(order.subtotal)}</b></div>
          <div><span>ارسال · {order.shipping_name}</span><b className="num">{faNum(order.shipping_fee)}</b></div>
          {order.discount_amount > 0 && (
            <div className={styles.off}><span>{order.birthday_discount ? "تخفیف تولد" : `تخفیف ${order.discount_code}`}</span><b className="num">{faNum(order.discount_amount)}−</b></div>
          )}
          <div className={styles.grand}><span>مبلغ کل</span><b className="num">{faNum(order.total)} {currency_label}</b></div>
        </div>
      </section>

      <section className={styles.card}>
        <h2>تحویل</h2>
        <p className={styles.addr}>
          <b>{order.receiver_name}</b>
          {order.receiver_phone && <> · <span className="num" dir="ltr">{toFaDigits(order.receiver_phone)}</span></>}
          {" · "}{order.province ? `${order.province}، ` : ""}{order.city}
          {order.address && <><br />{order.address}</>}
          {order.postal_code && <><br />کد پستی: <span className="num">{toFaDigits(order.postal_code)}</span></>}
        </p>
      </section>
    </div>
  );
}
