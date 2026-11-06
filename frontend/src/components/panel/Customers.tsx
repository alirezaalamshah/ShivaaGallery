"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type MouseEvent, useEffect, useState } from "react";

import { Icon } from "@/components/Icon";
import { Select } from "@/components/Select";
import { navStart } from "@/components/NavProgress";
import { useStore } from "@/components/StoreProvider";
import { useToast } from "@/components/Toast";
import { fieldErrors } from "@/lib/client";
import { faDate, faDateTime, faNum, toEnDigits, toFaDigits } from "@/lib/format";

import { useCan } from "./access";
import { DateInput } from "./DateInput";
import { isoDay } from "./dates";
import { adminCall, useAdmin } from "./hooks";
import { Card, Empty, Field, Modal, PageHead, Pager, Switch } from "./ui";
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
  is_active: boolean;
  birthday: string | null;
  birthday_soon: boolean;
};

const KINDS = [
  { value: "", label: "همه" },
  { value: "online", label: "خرید اینترنتی" },
  { value: "store", label: "خرید حضوری" },
  { value: "none", label: "بدون خرید" },
  { value: "birthday", label: "تولد این هفته" },
  { value: "blocked", label: "غیرفعال" },
];

/** Where this customer came from, in a few words. */
const origin = (c: { has_account: boolean; store_tickets: number }) => (c.has_account ? "حساب سایت دارد" : c.store_tickets ? "فقط خرید حضوری" : "ثبت‌شده در فروشگاه");

const ORDERINGS = [
  { value: "recent", label: "آخرین خرید" },
  { value: "spent", label: "بیشترین خرید" },
  { value: "purchases", label: "بیشترین دفعات" },
];

/** Opens a table row's page on a click anywhere in it. Links keep their own click, and selecting text (a phone number to copy) opens nothing. */
function useOpenRow() {
  const router = useRouter();
  return (e: MouseEvent, href: string) => {
    if ((e.target as HTMLElement).closest("a,button") || window.getSelection()?.toString()) return;
    navStart();
    router.push(href);
  };
}

/** Everyone who bought online or at the shop (with a mobile), or made an account, one row per mobile. */
export function Customers() {
  const openRow = useOpenRow();
  const store = useStore();
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("");
  const [ordering, setOrdering] = useState("recent");
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const can = useCan();
  const router = useRouter();
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(q.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);
  const params = new URLSearchParams({ ordering, ...(kind && { kind }), ...(search && { search }) }).toString();
  const { data, loading } = useAdmin<{ count: number; pages: number; results: Row[] }>(`/customers?${params}&page=${page}`);

  return (
    <>
      <PageHead title="مشتری‌ها" sub="باشگاه مشتری: خریدهای اینترنتی و حضوری هر مشتری با شماره موبایلش یک‌جا جمع می‌شود. مشتری قدیمی یا بدون خرید را با «ثبت مشتری» اضافه کنید.">
        {can("customers.add") && (
          <button type="button" className={s.btn} onClick={() => setAdding(true)}>
            <Icon name="plus" /> ثبت مشتری
          </button>
        )}
        {can("customers.export") && (
          <a href={`/api/admin/customers/export?${params}`} className={`${s.btn} ${s.btnGhost}`} download>
            خروجی اکسل
          </a>
        )}
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
              <button key={k.value} type="button" className={s.tab} aria-pressed={kind === k.value} onClick={() => { setKind(k.value); setPage(1); }}>{k.label}</button>
            ))}
          </div>
          <Select label="مرتب‌سازی" value={ordering} options={ORDERINGS} fit onChange={(v) => { setOrdering(v); setPage(1); }} />
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
                  <tr key={c.phone} className={s.rowLink} onClick={(e) => openRow(e, `/panel/customers/${c.phone}`)}>
                    <td>
                      <Link href={`/panel/customers/${c.phone}`} className={s.cellStack}>
                        <b>
                          {c.name || "بی‌نام"}
                          {!c.is_active && <span className="pill" data-status="cancelled" style={{ marginInlineStart: 6 }}>غیرفعال</span>}
                        </b>
                        <small className="muted">{origin(c)}{c.has_note ? " · یادداشت دارد" : ""}{c.birthday_soon ? " · 🎂 تولد این هفته" : ""}</small>
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
        {data && <Pager page={page} pages={data.pages} onChange={setPage} />}
      </Card>
      {adding && <NewCustomer onClose={() => setAdding(false)} onSaved={(phone) => router.push(`/panel/customers/${phone}`)} />}
    </>
  );
}

/** Register an old customer, or one who has not bought yet, for the customer club. */
function NewCustomer({ onClose, onSaved }: { onClose: () => void; onSaved: (phone: string) => void }) {
  const [form, setForm] = useState({ phone: "", name: "", birthday: "", note: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    setErrors({});
    try {
      const res = await adminCall<{ phone: string }>("/customers", { method: "POST", body: { ...form, phone: toEnDigits(form.phone), birthday: form.birthday || null } });
      onSaved(res.phone);
    } catch (e) {
      const f = fieldErrors(e);
      setErrors(Object.keys(f).length ? f : { form: e instanceof Error ? e.message : "ذخیره نشد." });
      setBusy(false);
    }
  };
  return (
    <Modal
      title="ثبت مشتری"
      onClose={onClose}
      footer={
        <>
          <button type="button" className={s.btn} disabled={busy || !form.phone} onClick={save}>{busy ? "در حال ثبت…" : "ثبت"}</button>
          <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={onClose}>انصراف</button>
        </>
      }
    >
      <div className={s.formGrid}>
        <Field label="موبایل" error={errors.phone}>
          <input className="input ltr num" inputMode="tel" placeholder="۰۹…" autoFocus value={toFaDigits(form.phone)} onChange={(e) => setForm({ ...form, phone: toEnDigits(e.target.value) })} />
        </Field>
        <Field label="نام" error={errors.name}>
          <input className="input" value={form.name} maxLength={80} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="تاریخ تولد (اختیاری)" error={errors.birthday} hint="برای تخفیف هفته‌ی تولد" full>
          <DateInput value={form.birthday} max={isoDay(new Date())} clearable placeholder="روز تولد" onChange={(v) => setForm({ ...form, birthday: v })} />
        </Field>
        <Field label="یادداشت (اختیاری)" error={errors.note} full>
          <textarea className="input" rows={3} value={form.note} maxLength={2000} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="مثلاً: مشتری قدیمی مغازه، سایز ۴۰" />
        </Field>
      </div>
      {errors.form && <p className="err" role="alert">{errors.form}</p>}
    </Modal>
  );
}

type Detail = {
  phone: string;
  name: string;
  note_name: string;
  note: string;
  is_active: boolean;
  birthday: string | null;
  birthday_soon: boolean;
  registered: string | null;
  birthday_discounts: { reference: string; amount: number; cycle: number; created_at: string }[];
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
  const openRow = useOpenRow();
  const store = useStore();
  const toast = useToast();
  const { data, setData, error } = useAdmin<Detail>(`/customers/${phone}`);
  const can = useCan();
  const canEdit = can("customers.edit");
  const [birthday, setBirthday] = useState("");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!data) return;
    setName(data.note_name);
    setNote(data.note);
    setBirthday(data.birthday ?? "");
  }, [data]);

  if (error) return <Empty icon="user" title={error} />;
  if (!data) return null;
  const st = data.stats;

  const save = async (body: Record<string, unknown> = { name, note }, done = "ذخیره شد") => {
    setBusy(true);
    try {
      setData(await adminCall<Detail>(`/customers/${phone}`, { method: "PATCH", body }));
      toast({ text: done });
    } catch (e) {
      toast({ text: e instanceof Error ? e.message : "ذخیره نشد." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead
        title={data.name || "مشتری بی‌نام"}
        sub={[
          data.account ? `عضو سایت از ${faDate(data.account.joined)}` : st.store_tickets ? "فقط خرید حضوری؛ در سایت حساب ندارد" : "ثبت‌شده در فروشگاه",
          !data.is_active && "غیرفعال: نه در سایت و نه در مغازه به او فروخته نمی‌شود",
        ].filter(Boolean).join(" · ")}
      >
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
                      <tr key={o.id} className={s.rowLink} onClick={(e) => openRow(e, `/panel/orders/${o.id}`)}>
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
          <Card title="باشگاه مشتری">
            <div className={s.stack}>
              <div className={s.switchRow}>
                <span>
                  <b>{data.is_active ? "فعال" : "غیرفعال"}</b>
                  <small>{data.is_active ? "می‌تواند در سایت و مغازه خرید کند" : "نه در سایت و نه در مغازه به او فروخته نمی‌شود"}</small>
                </span>
                <Switch
                  checked={data.is_active}
                  disabled={!can("customers.block") || busy}
                  label="فعال بودن مشتری"
                  onChange={(v) => save({ is_active: v }, v ? "مشتری فعال شد" : "مشتری غیرفعال شد")}
                />
              </div>
              <div className="field">
                <span className="label">تاریخ تولد {data.birthday_soon && <span className="pill" data-status="delivered">🎂 تولد این هفته</span>}</span>
                {canEdit ? (
                  <div style={{ display: "flex", gap: 8 }}>
                    <DateInput value={birthday} max={isoDay(new Date())} clearable placeholder="ثبت نشده" onChange={setBirthday} label="تاریخ تولد" />
                    {birthday !== (data.birthday ?? "") && (
                      <button type="button" className={`${s.btn} ${s.btnSm}`} disabled={busy} onClick={() => save({ birthday: birthday || null }, "تاریخ تولد ذخیره شد")}>ذخیره</button>
                    )}
                  </div>
                ) : (
                  <span>{data.birthday ? faDate(`${data.birthday}T12:00:00`) : "ثبت نشده"}</span>
                )}
                <span className="hint">مشتری فقط یک بار خودش ثبت می‌کند؛ تغییرش فقط از این‌جاست.</span>
              </div>
              {data.birthday_discounts.length > 0 && (
                <ul className={s.timeline} style={{ margin: 0 }}>
                  {data.birthday_discounts.map((b) => (
                    <li key={b.reference}>
                      <span>
                        <b>تخفیف تولد {toFaDigits(b.cycle)}: <span className="num">{faNum(b.amount)}</span> {store.currency_label}</b>
                        <small>{b.reference} · {faDate(b.created_at)}</small>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          {canEdit && (
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
              <button type="button" className={s.btn} disabled={busy} onClick={() => save()}>ذخیره</button>
            </div>
          </Card>
          )}

          <Card title="آدرس‌ها">
            {data.addresses.length || data.order_addresses.length ? (
              <ul className={s.stack} style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {data.addresses.map((a) => (
                  <li key={a.id}>
                    <b>{a.receiver_name || "به نام مشتری"}</b> {a.receiver_phone && <span className="num" dir="ltr">{toFaDigits(a.receiver_phone)}</span>}
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
