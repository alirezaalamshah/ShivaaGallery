"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Icon } from "@/components/Icon";
import { useStore } from "@/components/StoreProvider";
import { useToast } from "@/components/Toast";
import { faDate, faDateTime, faNum, toFaDigits } from "@/lib/format";

import { adminCall, useAdmin } from "./hooks";
import { Card, Empty, PageHead } from "./ui";
import s from "./panel.module.css";

type Row = {
  phone: string;
  name: string;
  city: string;
  has_account: boolean;
  has_note: boolean;
  joined: string | null;
  online_orders: number;
  online_spent: number;
  store_tickets: number;
  store_spent: number;
  total_spent: number;
  purchases: number;
  first_purchase: string | null;
  last_purchase: string | null;
};

const KINDS = [
  { value: "", label: "همه" },
  { value: "online", label: "خرید اینترنتی" },
  { value: "store", label: "خرید حضوری" },
  { value: "none", label: "بدون خرید" },
];

const ORDERINGS = [
  { value: "recent", label: "آخرین خرید" },
  { value: "spent", label: "بیشترین خرید" },
  { value: "purchases", label: "بیشترین دفعات" },
];

/** Everyone who bought online or at the shop (with a mobile), or made an account, one row per mobile. */
export function Customers() {
  const store = useStore();
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("");
  const [ordering, setOrdering] = useState("recent");
  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  const params = new URLSearchParams({ ordering, ...(kind && { kind }), ...(search && { search }) }).toString();
  const { data, loading } = useAdmin<{ count: number; results: Row[] }>(`/customers?${params}`);

  return (
    <>
      <PageHead title="مشتری‌ها" sub="خریدهای اینترنتی و حضوری هر مشتری با شماره موبایلش یک‌جا جمع می‌شود. خرید حضوری وقتی این‌جا می‌آید که فروشنده موبایل مشتری را در صندوق بنویسد.">
        <a href={`/api/admin/customers/export?${params}`} className={`${s.btn} ${s.btnGhost}`} download>
          خروجی اکسل
        </a>
      </PageHead>
      <Card>
        <div className={s.toolbar}>
          <label className={s.search}>
            <Icon name="search" />
            <span className="sr-only">جستجو</span>
            <input id="customer-search" className="input" placeholder="موبایل، نام یا شهر" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <div className={s.tabs} role="group" aria-label="نوع مشتری">
            {KINDS.map((k) => (
              <button key={k.value} type="button" className={s.tab} aria-pressed={kind === k.value} onClick={() => setKind(k.value)}>{k.label}</button>
            ))}
          </div>
          <select className="input" aria-label="مرتب‌سازی" value={ordering} onChange={(e) => setOrdering(e.target.value)} style={{ width: "auto" }}>
            {ORDERINGS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        {data && <p className="muted" style={{ margin: "0 0 10px" }}>{faNum(data.count)} مشتری</p>}
        {data?.results.length ? (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr><th>مشتری</th><th>موبایل</th><th>شهر</th><th>اینترنتی</th><th>حضوری</th><th>جمع خرید ({store.currency_label})</th><th>آخرین خرید</th></tr>
              </thead>
              <tbody>
                {data.results.map((c) => (
                  <tr key={c.phone} className={s.rowLink}>
                    <td>
                      <Link href={`/panel/customers/${c.phone}`} className={s.cellStack}>
                        <b>{c.name || "بی‌نام"}</b>
                        <small className="muted">{c.has_account ? "حساب سایت دارد" : "فقط خرید حضوری"}{c.has_note ? " · یادداشت دارد" : ""}</small>
                      </Link>
                    </td>
                    <td className="num" dir="ltr">{toFaDigits(c.phone)}</td>
                    <td>{c.city || "—"}</td>
                    <td className="num">{c.online_orders ? `${faNum(c.online_orders)} سفارش` : "—"}</td>
                    <td className="num">{c.store_tickets ? `${faNum(c.store_tickets)} فاکتور` : "—"}</td>
                    <td className="num">{faNum(c.total_spent)}</td>
                    <td className="muted">{c.last_purchase ? faDateTime(c.last_purchase) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          !loading && <Empty icon="user" title={search || kind ? "مشتری‌ای پیدا نشد" : "هنوز مشتری‌ای نیست"} />
        )}
      </Card>
    </>
  );
}

type Detail = {
  phone: string;
  name: string;
  note_name: string;
  note: string;
  account: { joined: string; last_login: string | null; first_name: string; last_name: string } | null;
  stats: {
    online_orders: number; online_spent: number; store_tickets: number; store_spent: number; total_spent: number; purchases: number; average: number;
    first_purchase: string | null; last_purchase: string | null;
    top_sizes: { label: string; count: number }[]; top_colors: { label: string; count: number }[]; top_categories: { label: string; count: number }[];
  };
  addresses: { id: number; receiver_name: string; receiver_phone: string; province: string; city: string; address: string; postal_code: string }[];
  order_addresses: string[];
  orders: { id: number; number: string; status: string; status_label: string; total: number; item_count: number; created_at: string; city: string }[];
  store_sales: { id: number; number: string; status: string; total: number; created_at: string; seller: string; item_count: number; returned_count: number }[];
  returns: { id: number; order: string; status_label: string; wants: string; created_at: string }[];
  reviews: { id: number; product: string; rating: number; text: string; status: string; created_at: string }[];
  favorites: { product_id: number; name: string; created_at: string }[];
  stock_alerts: { product: string; color: string; size: string; created_at: string; notified_at: string | null }[];
};

const tops = (list: { label: string; count: number }[]) => (list.length ? list.map((x) => `${x.label} (${faNum(x.count)})`).join("، ") : "—");

/** One customer: who they are, everything they bought online and at the shop, and the shop's private note. */
export function CustomerDetail({ phone }: { phone: string }) {
  const store = useStore();
  const toast = useToast();
  const { data, setData, error } = useAdmin<Detail>(`/customers/${phone}`);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!data) return;
    setName(data.note_name);
    setNote(data.note);
  }, [data]);

  if (error) return <Empty icon="user" title={error} />;
  if (!data) return null;
  const st = data.stats;

  const save = async () => {
    setBusy(true);
    try {
      setData(await adminCall<Detail>(`/customers/${phone}`, { method: "PATCH", body: { name, note } }));
      toast({ text: "ذخیره شد" });
    } catch (e) {
      toast({ text: e instanceof Error ? e.message : "ذخیره نشد." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead title={data.name || "مشتری بی‌نام"} sub={data.account ? `عضو سایت از ${faDate(data.account.joined)}` : "فقط خرید حضوری؛ در سایت حساب ندارد"}>
        <a href={`tel:${data.phone}`} className={`${s.btn} ${s.btnGhost}`}>
          <Icon name="phone" /> <span className="num" dir="ltr">{toFaDigits(data.phone)}</span>
        </a>
        <Link href="/panel/customers" className={`${s.btn} ${s.btnGhost}`}>همه‌ی مشتری‌ها</Link>
      </PageHead>

      <div className={s.stats}>
        <div className={s.stat}><span>جمع خرید</span><b className="num">{faNum(st.total_spent)}</b><small>{store.currency_label} · {faNum(st.purchases)} خرید</small></div>
        <div className={s.stat}><span>اینترنتی</span><b className="num">{faNum(st.online_spent)}</b><small>{faNum(st.online_orders)} سفارش</small></div>
        <div className={s.stat}><span>حضوری</span><b className="num">{faNum(st.store_spent)}</b><small>{faNum(st.store_tickets)} فاکتور</small></div>
        <div className={s.stat}><span>میانگین هر خرید</span><b className="num">{faNum(st.average)}</b><small>{st.last_purchase ? `آخرین خرید ${faDate(st.last_purchase)}` : "هنوز خریدی نکرده"}</small></div>
      </div>

      <div className={s.cols}>
        <div className={s.stack}>
          <Card title="سلیقه‌ی خرید">
            <dl className={s.kv}>
              <dt>سایزها</dt><dd>{tops(st.top_sizes)}</dd>
              <dt>رنگ‌ها</dt><dd>{tops(st.top_colors)}</dd>
              <dt>دسته‌ها</dt><dd>{tops(st.top_categories)}</dd>
              {st.first_purchase && <><dt>اولین خرید</dt><dd>{faDate(st.first_purchase)}</dd></>}
              {data.account?.last_login && <><dt>آخرین ورود به سایت</dt><dd>{faDateTime(data.account.last_login)}</dd></>}
            </dl>
          </Card>

          <Card title={`سفارش‌های اینترنتی (${faNum(data.orders.length)})`}>
            {data.orders.length ? (
              <div className={s.tableWrap}>
                <table className={s.table}>
                  <thead><tr><th>سفارش</th><th>تاریخ</th><th>عدد</th><th>مبلغ</th><th>وضعیت</th></tr></thead>
                  <tbody>
                    {data.orders.map((o) => (
                      <tr key={o.id} className={s.rowLink}>
                        <td><Link href={`/panel/orders/${o.id}`} className="num" dir="ltr">#{toFaDigits(o.number)}</Link></td>
                        <td className="muted">{faDateTime(o.created_at)}</td>
                        <td className="num">{faNum(o.item_count)}</td>
                        <td className="num">{faNum(o.total)}</td>
                        <td><span className="pill" data-status={o.status}>{o.status_label}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="muted">سفارش اینترنتی ندارد.</p>}
          </Card>

          <Card title={`خریدهای حضوری (${faNum(data.store_sales.length)})`}>
            {data.store_sales.length ? (
              <div className={s.tableWrap}>
                <table className={s.table}>
                  <thead><tr><th>فاکتور</th><th>تاریخ</th><th>فروشنده</th><th>عدد</th><th>مبلغ</th></tr></thead>
                  <tbody>
                    {data.store_sales.map((x) => (
                      <tr key={x.id} className={x.status === "voided" ? "muted" : undefined}>
                        <td><a href={`/panel/pos/sales/${x.id}/print`} target="_blank" rel="noopener" className="num" dir="ltr">#{toFaDigits(x.number)}</a></td>
                        <td className="muted">{faDateTime(x.created_at)}</td>
                        <td>{x.seller}</td>
                        <td className="num">{faNum(x.item_count)}{x.returned_count ? ` · ${faNum(x.returned_count)} پس‌گرفته` : ""}</td>
                        <td className="num">{x.status === "voided" ? "باطل شده" : faNum(x.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="muted">خرید حضوری با این شماره ثبت نشده.</p>}
          </Card>

          {(data.returns.length > 0 || data.reviews.length > 0) && (
            <Card title="مرجوعی‌ها و نظرها">
              <ul className={s.stack} style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {data.returns.map((r) => (
                  <li key={`r${r.id}`}>مرجوعی سفارش <span className="num">#{toFaDigits(r.order)}</span> ({r.wants}): {r.status_label} <small className="muted">{faDate(r.created_at)}</small></li>
                ))}
                {data.reviews.map((r) => (
                  <li key={`v${r.id}`}>نظر درباره‌ی {r.product}: <span className="num">{faNum(r.rating)}</span> از ۵ ({r.status}){r.text ? ` · ${r.text}` : ""}</li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className={s.stack}>
          <Card title="یادداشت فروشگاه">
            <div className={s.stack}>
              <label className="field">
                <span className="label">نام (اختیاری)</span>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder={data.name || "مثلاً برای مشتری حضوری"} />
              </label>
              <label className="field">
                <span className="label">یادداشت</span>
                <textarea className="input" rows={4} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} placeholder="مثلاً: سایز ۴۰ می‌پوشد، رنگ تیره دوست دارد" />
                <span className="hint">فقط مدیر می‌بیند.</span>
              </label>
              <button type="button" className={s.btn} disabled={busy} onClick={save}>ذخیره</button>
            </div>
          </Card>

          <Card title="آدرس‌ها">
            {data.addresses.length || data.order_addresses.length ? (
              <ul className={s.stack} style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {data.addresses.map((a) => (
                  <li key={a.id}>
                    <b>{a.receiver_name}</b> {a.receiver_phone && <span className="num" dir="ltr">{toFaDigits(a.receiver_phone)}</span>}
                    <br />
                    {a.province} {a.city}، {a.address}
                    {a.postal_code && <small className="muted"> · کد پستی <span className="num">{toFaDigits(a.postal_code)}</span></small>}
                  </li>
                ))}
                {data.order_addresses.filter((x) => !data.addresses.some((a) => x.includes(a.address))).map((x) => (
                  <li key={x}>{x} <small className="muted">(از سفارش‌ها)</small></li>
                ))}
              </ul>
            ) : <p className="muted">آدرسی ثبت نشده.</p>}
          </Card>

          {(data.favorites.length > 0 || data.stock_alerts.length > 0) && (
            <Card title="علاقه‌مندی‌ها و «خبرم کن»">
              <ul className={s.stack} style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {data.favorites.map((f) => (
                  <li key={`f${f.product_id}`}><Icon name="heart" /> <Link href={`/panel/products/${f.product_id}`}>{f.name}</Link></li>
                ))}
                {data.stock_alerts.map((a, i) => (
                  <li key={`a${i}`}>منتظر {a.product}، {a.color}، سایز <span className="num">{a.size}</span> <small className="muted">{a.notified_at ? "خبر داده شد" : "هنوز موجود نشده"}</small></li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
