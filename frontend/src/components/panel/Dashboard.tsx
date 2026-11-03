"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Icon } from "@/components/Icon";
import { useStore } from "@/components/StoreProvider";
import { navStart } from "@/components/NavProgress";
import { faDateTime, faNum, toEnDigits, toFaDigits } from "@/lib/format";

import { TILL, useCan } from "./access";
import { adminCall, refreshSite, useAdmin } from "./hooks";
import type { AdminOrderRow } from "./types";
import { Card, Empty, PageHead } from "./ui";
import s from "./panel.module.css";

type Dash = {
  store_sales_today: number;
  store_sales_count: number;
  reviews_pending: number;
  returns_open: number;
  stock_alerts: number;
  sales_today: number;
  orders_today: number;
  orders_open: number;
  orders_to_ship: number;
  orders_unpaid: number;
  products_active: number;
  variants_out: number;
  sales_week: { day: string; total: number }[];
  low_stock: { variant: number; product_id: number; product: string; color: string; color_hex: string; size: string; stock: number }[];
  recent_orders: AdminOrderRow[];
};

const weekday = new Intl.DateTimeFormat("fa-IR", { weekday: "short" });

export function Dashboard() {
  const store = useStore();
  const router = useRouter();
  const { data, reload } = useAdmin<Dash>("/dashboard");
  const [restock, setRestock] = useState<Record<number, string>>({});
  const can = useCan();

  if (!data) return <PageHead title="داشبورد" sub="در حال بارگذاری…" />;
  const max = Math.max(1, ...data.sales_week.map((d) => d.total));
  const weekTotal = data.sales_week.reduce((n, d) => n + d.total, 0);

  const saveStock = async (variant: number) => {
    const value = Number(toEnDigits(restock[variant] ?? ""));
    if (!Number.isFinite(value)) return;
    await adminCall(`/variants/${variant}/stock`, { method: "POST", body: { stock: value, note: "از داشبورد" } });
    setRestock((r) => ({ ...r, [variant]: "" }));
    reload();
    refreshSite();
  };

  return (
    <>
      <PageHead title="داشبورد" sub={`سلام! این‌جا خلاصه‌ی امروز ${store.name} است.`}>
        {can(...TILL) && (
          <Link href="/panel/pos" className={s.btn}>
            <Icon name="card" /> صندوق فروش
          </Link>
        )}
        {can("products.edit") && (
          <Link href="/panel/products/new" className={`${s.btn} ${s.btnGhost}`}>
            <Icon name="plus" /> محصول جدید
          </Link>
        )}
      </PageHead>

      <div className={s.stats}>
        <div className={s.stat}>
          <Icon name="card" />
          <span>فروش اینترنتی امروز</span>
          <b className="num">{faNum(data.sales_today)}</b>
          <small>{store.currency_label} · فقط سفارش‌های پرداخت‌شده</small>
        </div>
        <Link href="/panel/pos?tab=sales" className={s.stat}>
          <Icon name="home" />
          <span>فروش حضوری امروز</span>
          <b className="num">{faNum(data.store_sales_today)}</b>
          <small>{store.currency_label} · {faNum(data.store_sales_count)} فاکتور صندوق</small>
        </Link>
        <div className={s.stat}>
          <Icon name="bag" />
          <span>سفارش‌های پرداخت‌شده‌ی امروز</span>
          <b className="num">{faNum(data.orders_today)}</b>
          <small>بدون سفارش‌های لغوشده</small>
        </div>
        <Link href="/panel/orders?status=open" className={`${s.stat} ${data.orders_to_ship ? s.statWarn : ""}`}>
          <Icon name="truck" />
          <span>سفارش‌های باز</span>
          <b className="num">{faNum(data.orders_open)}</b>
          <small>{faNum(data.orders_to_ship)} آماده‌ی ارسال · {faNum(data.orders_unpaid)} منتظر پرداخت</small>
        </Link>
        <Link href="/panel/products" className={s.stat}>
          <Icon name="grid" />
          <span>محصولات فعال</span>
          <b className="num">{faNum(data.products_active)}</b>
          <small>در سایت نمایش داده می‌شوند</small>
        </Link>
        <Link href="/panel/products?stock=out" className={`${s.stat} ${data.variants_out ? s.statWarn : ""}`}>
          <Icon name="ret" />
          <span>تنوع‌های تمام‌شده</span>
          <b className="num">{faNum(data.variants_out)}</b>
          <small>رنگ و سایزهای بدون موجودی{data.stock_alerts ? ` · ${faNum(data.stock_alerts)} نفر منتظر موجود شدن` : ""}</small>
        </Link>
        {(data.returns_open > 0 || data.reviews_pending > 0) && (
          <>
            <Link href="/panel/returns" className={`${s.stat} ${data.returns_open ? s.statWarn : ""}`}>
              <Icon name="ret" />
              <span>مرجوعی‌های باز</span>
              <b className="num">{faNum(data.returns_open)}</b>
              <small>منتظر بررسی یا دریافت کالا</small>
            </Link>
            <Link href="/panel/reviews" className={s.stat}>
              <Icon name="heart" />
              <span>نظرهای جدید</span>
              <b className="num">{faNum(data.reviews_pending)}</b>
              <small>منتظر تأیید شما</small>
            </Link>
          </>
        )}
      </div>

      <div className={s.cols}>
        <div className={s.stack}>
          <Card title="فروش ۷ روز اخیر" actions={<span className="muted num">{faNum(weekTotal)} {store.currency_label}</span>}>
            <div className={s.chart}>
              {data.sales_week.map((d, i) => (
                <div key={d.day} className={s.bar} title={`${faNum(d.total)} ${store.currency_label}`}>
                  <i style={{ height: `${(d.total / max) * 100}%`, "--i": i } as React.CSSProperties} data-zero={d.total === 0} />
                  <span>{weekday.format(new Date(d.day))}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card title="آخرین سفارش‌ها" actions={<Link href="/panel/orders" className="link-more">همه <Icon name="arrow" /></Link>}>
            {data.recent_orders.length ? (
              <div className={s.tableWrap}>
                <table className={s.table}>
                  <thead>
                    <tr><th>شماره</th><th>مشتری</th><th>شهر</th><th>مبلغ</th><th>وضعیت</th><th>زمان</th></tr>
                  </thead>
                  <tbody>
                    {data.recent_orders.map((o) => (
                      <tr key={o.id} className={s.rowLink} onClick={() => { navStart(); router.push(`/panel/orders/${o.id}`); }}>
                        <td className="num" dir="ltr">#{toFaDigits(o.number)}</td>
                        <td>{o.receiver_name}</td>
                        <td>{o.city}</td>
                        <td className="num">{faNum(o.total)}</td>
                        <td><span className="pill" data-status={o.status}>{o.status_label}</span></td>
                        <td className="muted">{faDateTime(o.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty icon="bag" title="هنوز سفارشی ثبت نشده" />
            )}
          </Card>
        </div>

        <Card title="موجودی رو به اتمام" actions={<Link href="/panel/stock?stock=low" className="link-more">همه <Icon name="arrow" /></Link>}>
          {data.low_stock.length ? (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
              {data.low_stock.map((v) => (
                <li key={v.variant} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <i style={{ width: 14, height: 14, borderRadius: "50%", background: v.color_hex, boxShadow: "inset 0 0 0 1px rgb(0 0 0 / .15)", flex: "none" }} />
                  <Link href={`/panel/products/${v.product_id}`} style={{ flex: 1, minWidth: 0, fontSize: 13.5 }}>
                    <b style={{ display: "block", fontWeight: 600 }}>{v.product}</b>
                    <small className="muted">{v.color}، سایز {v.size}، <span className={v.stock ? "" : s.danger}>{v.stock ? `${faNum(v.stock)} عدد` : "تمام شده"}</span></small>
                  </Link>
                  {can("stock.edit") && (
                  <>
                  <input
                    aria-label={`موجودی جدید ${v.product}`}
                    className="input ltr num"
                    style={{ width: 70, minHeight: 36, padding: "4px 8px", textAlign: "center" }}
                    inputMode="numeric"
                    placeholder="تعداد"
                    value={restock[v.variant] ?? ""}
                    onChange={(e) => setRestock((r) => ({ ...r, [v.variant]: e.target.value }))}
                    onKeyDown={(e) => e.key === "Enter" && saveStock(v.variant)}
                  />
                  <button type="button" className={`${s.btn} ${s.btnSm}`} disabled={!restock[v.variant]} onClick={() => saveStock(v.variant)}>ثبت</button>
                  </>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <Empty icon="check" title="موجودی همه‌ی کالاها خوب است" />
          )}
        </Card>
      </div>
    </>
  );
}
