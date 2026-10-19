"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Icon } from "@/components/Icon";
import { ProductMedia } from "@/components/ProductMedia";
import { useStore } from "@/components/StoreProvider";
import { faDateTime, faNum, toFaDigits } from "@/lib/format";

import { adminCall, useAdmin } from "./hooks";
import type { AdminOrder, AdminOrderRow, Paged } from "./types";
import { Card, Empty, Field, PageHead } from "./ui";
import s from "./panel.module.css";

const TABS = [
  { value: "", label: "همه" },
  { value: "open", label: "باز" },
  { value: "awaiting_payment", label: "در انتظار پرداخت" },
  { value: "paid", label: "پرداخت شد" },
  { value: "processing", label: "آماده‌سازی" },
  { value: "shipped", label: "ارسال شد" },
  { value: "delivered", label: "تحویل شد" },
  { value: "cancelled", label: "لغو شد" },
];

export function OrdersList() {
  const router = useRouter();
  const params = useSearchParams();
  const status = params.get("status") ?? "";
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  const qs = new URLSearchParams({ ...(status && { status }), ...(search && { search }), page: String(page) });
  const { data, loading } = useAdmin<Paged<AdminOrderRow>>(`/orders?${qs}`);

  return (
    <>
      <PageHead title="سفارش‌ها" sub={data ? `${faNum(data.count)} سفارش` : undefined} />
      <Card>
        <div className={s.toolbar}>
          <div className={s.tabs} role="group" aria-label="وضعیت">
            {TABS.map((t) => (
              <button key={t.value} type="button" className={s.tab} aria-pressed={status === t.value} onClick={() => { setPage(1); router.replace(t.value ? `/panel/orders?status=${t.value}` : "/panel/orders"); }}>
                {t.label}
              </button>
            ))}
          </div>
          <label className={s.search}>
            <Icon name="search" />
            <span className="sr-only">جستجو</span>
            <input id="order-search" className="input" placeholder="شماره سفارش، موبایل یا نام" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          </label>
        </div>
        {data?.results.length ? (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr><th>شماره</th><th>مشتری</th><th>موبایل</th><th>شهر</th><th>ارسال</th><th>اقلام</th><th>مبلغ</th><th>وضعیت</th><th>زمان ثبت</th></tr>
              </thead>
              <tbody>
                {data.results.map((o) => (
                  <tr key={o.id} className={s.rowLink} onClick={() => router.push(`/panel/orders/${o.id}`)}>
                    <td className="num" dir="ltr"><Link href={`/panel/orders/${o.id}`}>#{toFaDigits(o.number)}</Link></td>
                    <td>{o.receiver_name}</td>
                    <td className="num" dir="ltr">{toFaDigits(o.phone)}</td>
                    <td>{o.city}</td>
                    <td className="muted">{o.shipping_name}</td>
                    <td className="num">{faNum(o.item_count ?? 0)}</td>
                    <td className="num">{faNum(o.total)}</td>
                    <td><span className="pill" data-status={o.status}>{o.status_label}</span></td>
                    <td className="muted">{faDateTime(o.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          !loading && <Empty icon="bag" title="سفارشی پیدا نشد" />
        )}
        {data && (data.next || data.previous) && (
          <div className={s.toolbar} style={{ justifyContent: "center", marginTop: 14, marginBottom: 0 }}>
            <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} disabled={!data.previous} onClick={() => setPage(page - 1)}>قبلی</button>
            <span className="muted num">صفحه‌ی {faNum(page)}</span>
            <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} disabled={!data.next} onClick={() => setPage(page + 1)}>بعدی</button>
          </div>
        )}
      </Card>
    </>
  );
}

export function OrderDetail({ id }: { id: string }) {
  const store = useStore();
  const { data: order, setData, error } = useAdmin<AdminOrder>(`/orders/${id}`);
  const [tracking, setTracking] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (error) return <Empty icon="bag" title={error} />;
  if (!order) return <PageHead title="سفارش" sub="در حال بارگذاری…" />;

  const update = async (body: Record<string, unknown>, done: string) => {
    setBusy(true);
    setMsg(null);
    try {
      setData(await adminCall<AdminOrder>(`/orders/${order.id}/update_status`, { method: "POST", body }));
      setMsg({ ok: true, text: done });
      setStatusNote("");
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "ذخیره نشد." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead title={`سفارش #${toFaDigits(order.number)}`} sub={`${faDateTime(order.created_at)} · ${order.receiver_name}`}>
        <Link href="/panel/orders" className={`${s.btn} ${s.btnGhost}`}><Icon name="back" /> همه‌ی سفارش‌ها</Link>
      </PageHead>
      {msg && <p className={msg.ok ? "hint" : "err"} role="status">{msg.text}</p>}
      <div className={s.cols}>
        <div className={s.stack}>
          <Card title="اقلام" actions={<span className="pill" data-status={order.status}>{order.status_label}</span>}>
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead><tr><th>محصول</th><th>رنگ</th><th>سایز</th><th>کد انبار</th><th>تعداد</th><th>قیمت واحد</th><th>جمع</th></tr></thead>
                <tbody>
                  {order.items.map((it, i) => (
                    <tr key={i}>
                      <td>
                        <span className={s.nameCell} style={{ minWidth: 180 }}>
                          <span className={s.thumb}><ProductMedia image={it.image || null} alt={it.product_name} sizes="46px" /></span>
                          <b>{it.product_name}</b>
                        </span>
                      </td>
                      <td>{it.color_name}</td>
                      <td className="num">{it.size_label}</td>
                      <td className="muted" dir="ltr">{it.sku}</td>
                      <td className="num">{faNum(it.qty)}</td>
                      <td className="num">{faNum(it.unit_price)}</td>
                      <td className="num">{faNum(it.line_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <dl className={s.kv} style={{ marginTop: 16, justifyContent: "end" }}>
              <dt>جمع کالاها</dt><dd className="num">{faNum(order.subtotal)}</dd>
              <dt>ارسال ({order.shipping_name})</dt><dd className="num">{faNum(order.shipping_fee)}</dd>
              {order.discount_amount > 0 && (<><dt>تخفیف {order.discount_code}</dt><dd className={`num ${s.danger}`}>{faNum(order.discount_amount)}−</dd></>)}
              <dt><b>مبلغ کل</b></dt><dd className="num"><b>{faNum(order.total)} {store.currency_label}</b></dd>
            </dl>
          </Card>

          <Card title="مشتری و تحویل">
            <dl className={s.kv}>
              <dt>تحویل‌گیرنده</dt><dd>{order.receiver_name}</dd>
              <dt>موبایل</dt><dd><a href={`tel:${order.phone}`} className="num" dir="ltr">{toFaDigits(order.phone)}</a></dd>
              <dt>شهر</dt><dd>{order.city}</dd>
              <dt>آدرس</dt><dd>{order.address}</dd>
              {order.postal_code && (<><dt>کد پستی</dt><dd className="num">{toFaDigits(order.postal_code)}</dd></>)}
              {order.note && (<><dt>یادداشت مشتری</dt><dd>{order.note}</dd></>)}
            </dl>
          </Card>
        </div>

        <div className={s.stack}>
          <Card title="تغییر وضعیت">
            {order.next_statuses.length ? (
              <div style={{ display: "grid", gap: 12 }}>
                <Field label="توضیح برای تاریخچه (اختیاری)">
                  <input id="status-note" className="input" value={statusNote} onChange={(e) => setStatusNote(e.target.value)} />
                </Field>
                <div className={s.chipset}>
                  {order.next_statuses.map((n) => (
                    <button key={n.value} type="button" disabled={busy} className={`${s.btn} ${n.value === "cancelled" ? s.btnDanger : ""}`} onClick={() => update({ status: n.value, note: statusNote }, `وضعیت به «${n.label}» تغییر کرد و برای مشتری پیامک شد.`)}>
                      {n.label}
                    </button>
                  ))}
                </div>
                {order.next_statuses.some((n) => n.value === "cancelled") && <p className="hint">با لغو سفارش، کالاها به موجودی برمی‌گردند.</p>}
              </div>
            ) : (
              <p className="muted" style={{ margin: 0 }}>این سفارش در وضعیت نهایی است.</p>
            )}
          </Card>

          <Card title="کد رهگیری مرسوله">
            <div style={{ display: "flex", gap: 8 }}>
              <input id="tracking" className="input ltr num" value={tracking ?? order.tracking_code} onChange={(e) => setTracking(e.target.value)} placeholder="مثلاً کد پست یا تیپاکس" />
              <button type="button" className={s.btn} disabled={busy || tracking === null} onClick={() => update({ tracking_code: tracking ?? "" }, "کد رهگیری ذخیره شد.")}>ذخیره</button>
            </div>
          </Card>

          <Card title="یادداشت داخلی">
            <textarea id="admin-note" className="input" value={note ?? order.admin_note} onChange={(e) => setNote(e.target.value)} placeholder="فقط مدیر می‌بیند" />
            <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} style={{ marginTop: 8 }} disabled={busy || note === null} onClick={() => update({ admin_note: note ?? "" }, "یادداشت ذخیره شد.")}>ذخیره‌ی یادداشت</button>
          </Card>

          <Card title="تاریخچه">
            <ol className={s.timeline}>
              {order.events.map((e, i) => (
                <li key={i}>
                  <span>
                    <b>{e.label}</b>
                    <small>{faDateTime(e.created_at)}{e.note ? ` · ${e.note}` : ""}</small>
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}
