"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Icon } from "@/components/Icon";
import { Select } from "@/components/Select";
import { ProductMedia } from "@/components/ProductMedia";
import { useStore } from "@/components/StoreProvider";
import { useToast } from "@/components/Toast";
import { faDate, faDateTime, faNum, signed, toEnDigits, toFaDigits } from "@/lib/format";

import { DateInput } from "./DateInput";
import { RANGES, rangeOf, type RangeValue } from "./dates";
import { adminCall, refreshSite, useAdmin } from "./hooks";
import { useCan } from "./access";
import { Card, Empty, Field, Modal, PageHead } from "./ui";
import s from "./panel.module.css";
import k from "./Stock.module.css";

/** Stock of 9999 is left over from an older panel and means "count unknown". */
const UNKNOWN_STOCK = 9999;

type Size = { id: number; size: string; stock: number; price: number; sku: string };
type ProductRow = {
  id: number;
  name: string;
  category: string;
  category_id: number;
  active: boolean;
  thumb: string | null;
  stock: number;
  unknown: boolean;
  sale_value: number;
  cost_price: number | null;
  cost_value: number | null;
  colors: { name: string; hex: string; sizes: Size[] }[];
};
type Overview = {
  totals: { pieces: number; variants: number; out: number; low: number; unknown: number; sale_value: number; cost_value: number | null; without_cost: number | null };
  products: ProductRow[];
  low_stock: number;
  show_cost: boolean;
};

type Tab = "stock" | "stale" | "deductions";

/**
 * Stock is shared by the shop and the site. This page shows what is on the shelf and what it is
 * worth, takes pieces in or out (with a reason), runs a stock count, and lists what has stopped selling.
 */
export function Stock() {
  const router = useRouter();
  const params = useSearchParams();
  const can = useCan();
  const param = params.get("tab");
  const tab: Tab = param === "stale" ? "stale" : param === "deductions" && can("stock.history") ? "deductions" : "stock";
  const go = (t: Tab) => router.replace(t === "stock" ? "/panel/stock" : `/panel/stock?tab=${t}`);

  return (
    <>
      <PageHead title="موجودی انبار" sub="موجودی مغازه و سایت یکی است. فروش مغازه را در صندوق ثبت کنید تا سایت آن را نفروشد.">
        {can("pos.sell") && <Link href="/panel/pos" className={`${s.btn} ${s.btnGhost}`}><Icon name="card" /> صندوق فروش</Link>}
        {can("stock.history") && <Link href="/panel/inventory" className={`${s.btn} ${s.btnGhost}`}>دفتر موجودی</Link>}
      </PageHead>
      <div className={`${s.tabs} ${k.pageTabs}`} role="group" aria-label="بخش">
        <button type="button" className={s.tab} aria-pressed={tab === "stock"} onClick={() => go("stock")}>موجودی و ارزش انبار</button>
        <button type="button" className={s.tab} aria-pressed={tab === "stale"} onClick={() => go("stale")}>کالای راکد</button>
        {can("stock.history") && <button type="button" className={s.tab} aria-pressed={tab === "deductions"} onClick={() => go("deductions")}>کسر موجودی‌ها</button>}
      </div>
      {tab === "stock" ? <StockList initialFilter={params.get("stock") === "low" ? "low" : "all"} /> : tab === "stale" ? <Stale /> : <Deductions />}
    </>
  );
}

/* ---------- stock and its value ---------- */

type Filter = "all" | "low" | "out" | "unknown";

const sizeState = (n: number, low: number) => (n >= UNKNOWN_STOCK ? "unknown" : n === 0 ? "out" : n <= low ? "low" : "ok");

function StockList({ initialFilter }: { initialFilter: Filter }) {
  const store = useStore();
  const toast = useToast();
  const can = useCan();
  const { data, reload, loading } = useAdmin<Overview>("/stock");
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState<"name" | "stock" | "value">("name");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<{ product: ProductRow; color: string; size: Size } | null>(null);
  // Stock count: what was counted for each size, and the stock shown when the count started.
  const [counts, setCounts] = useState<Record<number, { counted: number | null; shown: number }> | null>(null);
  const [countNote, setCountNote] = useState("");
  const [saving, setSaving] = useState(false);
  const cur = store.currency_label;
  const edit = can("stock.edit");
  const low = data?.low_stock ?? 2;

  const categories = useMemo(() => [...new Set(data?.products.map((p) => p.category))], [data]);
  const shown = useMemo(() => {
    if (!data) return [];
    const term = q.trim().toLowerCase();
    const wanted = (n: number) => filter === "all" || sizeState(n, low) === filter;
    const rows = data.products.filter(
      (p) =>
        (!category || p.category === category) &&
        (!term || p.name.toLowerCase().includes(term) || p.colors.some((c) => c.name.includes(term) || c.sizes.some((z) => z.sku.toLowerCase().includes(term)))) &&
        p.colors.some((c) => c.sizes.some((z) => wanted(z.stock))),
    );
    if (sort === "stock") rows.sort((a, b) => a.stock - b.stock);
    if (sort === "value") rows.sort((a, b) => (b.cost_value ?? b.sale_value) - (a.cost_value ?? a.sale_value));
    return rows;
  }, [data, q, filter, category, sort, low]);

  const startCount = () => {
    if (!data) return;
    const all: Record<number, { counted: number | null; shown: number }> = {};
    for (const p of data.products) for (const c of p.colors) for (const z of c.sizes) all[z.id] = { counted: null, shown: z.stock };
    setCounts(all);
    setCountNote("");
  };
  const changed = counts ? Object.entries(counts).filter(([, c]) => c.counted !== null && c.counted !== c.shown) : [];
  const saveCount = async () => {
    if (!changed.length) return;
    setSaving(true);
    try {
      const res = await adminCall<{ changed: number; plus: number; minus: number; skipped: string[] }>("/stock/count", {
        method: "POST",
        body: { note: countNote, lines: changed.map(([id, c]) => ({ variant: Number(id), counted: c.counted, shown: c.shown })) },
      });
      toast({ text: `انبارگردانی ثبت شد: ${faNum(res.changed)} سایز اصلاح شد (${signed("+", res.plus)} / ${signed("−", res.minus)})` });
      if (res.skipped.length) toast({ text: `در این فاصله فروش داشتند و دوباره بشمارید: ${res.skipped.join("، ")}` });
      setCounts(null);
      reload();
      refreshSite();
    } catch (e) {
      toast({ text: e instanceof Error ? e.message : "ثبت نشد." });
    } finally {
      setSaving(false);
    }
  };

  if (!data) return loading ? null : <Empty icon="grid" title="موجودی دریافت نشد" />;
  const t = data.totals;
  // Profit if everything with a purchase price sold at today's price.
  const withCost = data.products.filter((p) => p.cost_value !== null);
  const potential = withCost.reduce((n, p) => n + p.sale_value - (p.cost_value ?? 0), 0);

  return (
    <>
      <div className={s.stats}>
        <div className={s.stat}>
          <Icon name="grid" />
          <span>موجودی کل</span>
          <b className="num">{faNum(t.pieces)} <small>عدد</small></b>
          <small>{faNum(t.variants)} رنگ و سایز در {faNum(data.products.length)} محصول</small>
        </div>
        {data.show_cost && (
          <div className={s.stat}>
            <Icon name="wallet" />
            <span>ارزش انبار به قیمت خرید</span>
            <b className="num">{faNum(t.cost_value ?? 0)}</b>
            <small>{t.without_cost ? `${cur} · ${faNum(t.without_cost)} محصول قیمت خرید ندارد و حساب نشده` : cur}</small>
          </div>
        )}
        <div className={s.stat}>
          <Icon name="card" />
          <span>ارزش انبار به قیمت فروش</span>
          <b className="num">{faNum(t.sale_value)}</b>
          <small>{data.show_cost ? `${cur} · سود اگر همه فروش برود: ${faNum(potential)}` : cur}</small>
        </div>
        <button type="button" className={`${s.stat} ${k.statBtn}`} aria-pressed={filter === "out" || filter === "low"} onClick={() => setFilter(t.out ? "out" : "low")}>
          <Icon name="bag" />
          <span>نیاز به سفارش</span>
          <b className="num">{faNum(t.out + t.low)} <small>سایز</small></b>
          <small>{faNum(t.out)} تمام‌شده · {faNum(t.low)} با {faNum(low)} عدد یا کمتر</small>
        </button>
      </div>

      {t.unknown > 0 && (
        <p className={s.notice}>
          <Icon name="ret" /> {faNum(t.unknown)} رنگ و سایز موجودی نامشخص (؟) دارد و در جمع‌ها حساب نشده.
          {edit && !counts && <button type="button" className={`${s.btn} ${s.btnSm}`} onClick={() => { setFilter("unknown"); startCount(); }}>شمردن و ثبت عدد واقعی</button>}
        </p>
      )}

      <Card>
        <div className={s.toolbar}>
          <div className={s.tabs} role="group" aria-label="نمایش">
            {([["all", "همه"], ["low", "رو به اتمام"], ["out", "تمام‌شده"], ["unknown", "نامشخص"]] as const).map(([v, label]) => (
              <button key={v} type="button" className={s.tab} aria-pressed={filter === v} onClick={() => setFilter(v)}>{label}</button>
            ))}
          </div>
          <Select label="دسته" value={category} options={[{ value: "", label: "همه‌ی دسته‌ها" }, ...categories.map((c) => ({ value: c, label: c }))]} fit onChange={setCategory} />
          <Select label="مرتب‌سازی" value={sort} options={[{ value: "name", label: "بر اساس دسته و نام" }, { value: "stock", label: "کمترین موجودی اول" }, { value: "value", label: "بیشترین ارزش اول" }]} fit onChange={(v) => setSort(v as typeof sort)} />
          <label className={s.search}>
            <Icon name="search" />
            <span className="sr-only">جستجو</span>
            <input id="stock-search" className="input" placeholder="نام محصول، رنگ یا کد انبار" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          {edit && !counts && (
            <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={startCount}><Icon name="check" /> انبارگردانی</button>
          )}
        </div>

        {counts && (
          <p className="hint">
            <b>انبارگردانی:</b> عدد شمرده‌شده‌ی هر سایز را در خانه‌اش بنویسید. خانه‌های خالی دست نمی‌خورند. اختلاف‌ها با علت «انبارگردانی» در دفتر موجودی ثبت می‌شوند.
          </p>
        )}

        {shown.length ? (
          <ul className={k.list}>
            {shown.map((p) => (
              <li key={p.id} className={k.product}>
                <span className={k.thumb}><ProductMedia image={p.thumb} alt={p.name} sizes="48px" /></span>
                <div className={k.head}>
                  {can("products.view") ? <Link href={`/panel/products/${p.id}`}><b>{p.name}</b></Link> : <b>{p.name}</b>}
                  <small className="muted">{p.category}{!p.active && " · در سایت نمایش داده نمی‌شود"}</small>
                </div>
                <div className={k.sums}>
                  <b className="num">{faNum(p.stock)}{p.unknown ? "+؟" : ""} <small>عدد</small></b>
                  {p.cost_value !== null ? (
                    <small className="num">خرید {faNum(p.cost_value)}</small>
                  ) : (
                    data.show_cost && p.stock > 0 && <small className="muted">قیمت خرید ندارد</small>
                  )}
                  <small className="num muted">فروش {faNum(p.sale_value)}</small>
                </div>
                <div className={k.colors}>
                  {p.colors.map((c) => (
                    <div key={c.name} className={k.color}>
                      <span className={k.colorName}><i style={{ background: c.hex }} />{c.name}</span>
                      <span className={k.sizes}>
                        {c.sizes.map((z) => {
                          const state = sizeState(z.stock, low);
                          const label = state === "unknown" ? "؟" : faNum(z.stock);
                          if (counts) {
                            const v = counts[z.id];
                            return (
                              <label key={z.id} className={`${k.chip} ${k.countChip} ${v?.counted !== null && v?.counted !== v?.shown ? k.chipChanged : ""}`}>
                                <span className="num">{z.size}</span>
                                <input
                                  className="num"
                                  inputMode="numeric"
                                  placeholder={label}
                                  aria-label={`${p.name} ${c.name} سایز ${z.size}، الان ${label}`}
                                  value={v?.counted === null || v?.counted === undefined ? "" : toFaDigits(String(v.counted))}
                                  onChange={(e) => {
                                    const raw = toEnDigits(e.target.value).replace(/\D/g, "");
                                    setCounts({ ...counts, [z.id]: { shown: v?.shown ?? z.stock, counted: raw === "" ? null : Math.min(Number(raw), UNKNOWN_STOCK - 1) } });
                                  }}
                                />
                              </label>
                            );
                          }
                          return (
                            <button
                              key={z.id}
                              type="button"
                              className={`${k.chip} ${k[state] ?? ""}`}
                              disabled={!edit}
                              onClick={() => setEditing({ product: p, color: c.name, size: z })}
                              title={`${faNum(z.price)} ${cur}`}
                              aria-label={`${p.name} ${c.name} سایز ${z.size}: ${state === "out" ? "تمام شده" : state === "unknown" ? "نامشخص" : `${label} عدد`}`}
                            >
                              <span className="num">{z.size}</span>
                              <b className="num">{state === "out" ? "۰" : label}</b>
                            </button>
                          );
                        })}
                      </span>
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty icon="grid" title={q || category || filter !== "all" ? "چیزی پیدا نشد" : "رنگ و سایزی ثبت نشده"} />
        )}

        {!counts && (
          <p className="hint" style={{ marginTop: 14 }}>
            روی هر سایز بزنید تا کالای تازه اضافه کنید یا موجودی را با ذکر دلیل کم کنید (مرجوع به تأمین‌کننده، خرابی، کسری). رنگ‌ها:{" "}
            <span className={`${k.legend} ${k.low}`}>رو به اتمام</span> <span className={`${k.legend} ${k.out}`}>تمام‌شده</span> <span className={`${k.legend} ${k.unknown}`}>نامشخص</span>
          </p>
        )}
      </Card>

      {counts && (
        <div className={k.countBar}>
          <span>
            <b className="num">{faNum(changed.length)}</b> سایز اختلاف دارد
            {changed.length > 0 && (
              <small className="num">
                {" "}({signed("+", changed.reduce((n, [, c]) => n + Math.max((c.counted ?? 0) - c.shown, 0), 0))} / {signed("−", changed.reduce((n, [, c]) => n + Math.max(c.shown - (c.counted ?? 0), 0), 0))})
              </small>
            )}
          </span>
          <input className="input" placeholder="یادداشت، مثلاً انبارگردانی آخر ماه" value={countNote} onChange={(e) => setCountNote(e.target.value)} maxLength={200} />
          <button type="button" className={s.btn} disabled={!changed.length || saving} onClick={saveCount}>{saving ? "در حال ثبت…" : "ثبت انبارگردانی"}</button>
          <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={() => setCounts(null)}>انصراف</button>
        </div>
      )}

      {editing && (
        <MoveModal
          {...editing}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            reload();
            refreshSite();
          }}
        />
      )}
    </>
  );
}

const OUT_REASONS = [
  { value: "supplier", label: "مرجوع به تأمین‌کننده", hint: "نام تأمین‌کننده یا ایراد کالا" },
  { value: "damaged", label: "خراب یا آسیب‌دیده", hint: "چه آسیبی دیده" },
  { value: "lost", label: "گم‌شده یا کسری", hint: "اختیاری" },
  { value: "remove", label: "دلیل دیگر", hint: "دلیل را بنویسید (الزامی)" },
] as const;

/** Take pieces of one size in (new stock) or out (with a reason for the reports). */
function MoveModal({ product, color, size, onClose, onDone }: { product: ProductRow; color: string; size: Size; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const store = useStore();
  const [mode, setMode] = useState<"in" | "out">("in");
  const [qty, setQty] = useState("1");
  const [reason, setReason] = useState<(typeof OUT_REASONS)[number]["value"]>("supplier");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const n = Number(toEnDigits(qty)) || 0;
  const unknown = size.stock >= UNKNOWN_STOCK;
  const max = unknown ? 1000 : size.stock;
  const picked = OUT_REASONS.find((r) => r.value === reason)!;

  const save = async () => {
    if (n < 1) return setError("تعداد را بنویسید.");
    if (mode === "out" && n > max) return setError(`فقط ${faNum(max)} عدد موجود است.`);
    if (mode === "out" && reason === "remove" && !note.trim()) return setError("دلیل کسر موجودی را بنویسید.");
    setBusy(true);
    try {
      await adminCall(`/variants/${size.id}/move`, { method: "POST", body: { kind: mode === "in" ? "receive" : reason, qty: n, note } });
      toast({ text: mode === "in" ? `${faNum(n)} عدد به موجودی اضافه شد` : `${faNum(n)} عدد از موجودی کم شد (${picked.label})` });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "ثبت نشد.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`${product.name}، ${color}، سایز ${size.size}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={`${s.btn} ${mode === "out" ? s.btnDangerSolid : ""}`} disabled={busy} onClick={save}>
            {busy ? "در حال ثبت…" : mode === "in" ? `افزودن ${faNum(n)} عدد` : `کسر ${faNum(n)} عدد`}
          </button>
          <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={onClose}>انصراف</button>
        </>
      }
    >
      <p className={k.moveNow}>
        موجودی الان: <b className="num">{unknown ? "نامشخص" : `${faNum(size.stock)} عدد`}</b> · قیمت فروش <span className="num">{faNum(size.price)}</span> {store.currency_label}
      </p>
      <div className={s.tabs} role="group" aria-label="نوع تغییر">
        <button type="button" className={s.tab} aria-pressed={mode === "in"} onClick={() => { setMode("in"); setError(""); }}><Icon name="plus" /> ورود کالا</button>
        <button type="button" className={s.tab} aria-pressed={mode === "out"} disabled={size.stock === 0} onClick={() => { setMode("out"); setError(""); }}><Icon name="minus" /> کسر موجودی</button>
      </div>
      <div className={k.moveForm}>
        <Field label="تعداد">
          <input className="input num" inputMode="numeric" value={toFaDigits(qty)} onChange={(e) => setQty(toEnDigits(e.target.value).replace(/\D/g, ""))} autoFocus />
        </Field>
        {mode === "out" && (
          <fieldset className={k.reasons}>
            <legend className="label">دلیل</legend>
            {OUT_REASONS.map((r) => (
              <label key={r.value}>
                <input type="radio" name="reason" checked={reason === r.value} onChange={() => setReason(r.value)} /> {r.label}
              </label>
            ))}
          </fieldset>
        )}
        <Field label={mode === "in" ? "یادداشت (اختیاری)" : "توضیح"} hint={mode === "out" ? picked.hint : "مثلاً نام تأمین‌کننده یا شماره فاکتور خرید"}>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
        </Field>
      </div>
      {error && <p className="err" role="alert">{error}</p>}
    </Modal>
  );
}

/* ---------- stale stock ---------- */

type StaleRow = {
  product_id: number; name: string; category: string; stock: number; stock_unknown: boolean;
  stock_value: number | null; sale_value: number; last_sold: string | null; idle_days: number; never_sold: boolean;
};
type StaleData = {
  days: number; rows: StaleRow[]; products: number; pieces: number; cost_value: number | null; without_cost: number | null; sale_value: number;
  categories: { id: number; name: string }[];
};

const DAY_PRESETS = [30, 60, 90, 180];

function Stale() {
  const store = useStore();
  const can = useCan();
  const [days, setDays] = useState(60);
  const [typed, setTyped] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState<"idle" | "value">("idle");
  const { data, loading } = useAdmin<StaleData>(`/stock/stale?days=${days}${category ? `&category=${category}` : ""}`);
  const cur = store.currency_label;

  useEffect(() => {
    const n = Number(toEnDigits(typed));
    if (!typed || !n) return;
    const t = setTimeout(() => setDays(Math.min(n, 3650)), 400);
    return () => clearTimeout(t);
  }, [typed]);

  const rows = useMemo(() => {
    const out = [...(data?.rows ?? [])];
    if (sort === "value") out.sort((a, b) => (b.stock_value ?? b.sale_value) - (a.stock_value ?? a.sale_value));
    return out;
  }, [data, sort]);

  return (
    <>
      <Card>
        <div className={s.toolbar} style={{ marginBottom: 0 }}>
          <span className={k.daysLabel}>بدون فروش در</span>
          <div className={s.tabs} role="group" aria-label="روز بی‌فروش">
            {DAY_PRESETS.map((d) => (
              <button key={d} type="button" className={s.tab} aria-pressed={days === d && !typed} onClick={() => { setTyped(""); setDays(d); }}>{faNum(d)} روز</button>
            ))}
          </div>
          <label className={k.daysInput}>
            <span>یا</span>
            <input className="input num" inputMode="numeric" placeholder="روز دلخواه" value={toFaDigits(typed)} onChange={(e) => setTyped(toEnDigits(e.target.value).replace(/\D/g, "").slice(0, 4))} aria-label="تعداد روز دلخواه" />
            <span>روز اخیر</span>
          </label>
          <Select label="دسته" value={category} options={[{ value: "", label: "همه‌ی دسته‌ها" }, ...(data?.categories.map((c) => ({ value: c.id, label: c.name })) ?? [])]} fit onChange={setCategory} />
        </div>
      </Card>

      {data && (
        <div className={s.stats}>
          <div className={s.stat}><span>محصول راکد</span><b className="num">{faNum(data.products)}</b><small>بیش از {faNum(data.days)} روز بدون فروش</small></div>
          <div className={s.stat}><span>تعداد کالای راکد</span><b className="num">{faNum(data.pieces)} <small>عدد</small></b><small>روی قفسه مانده</small></div>
          {data.cost_value !== null && (
            <div className={s.stat}>
              <span>پول خوابیده (قیمت خرید)</span><b className="num">{faNum(data.cost_value)}</b>
              <small>{data.without_cost ? `${cur} · ${faNum(data.without_cost)} محصول قیمت خرید ندارد` : cur}</small>
            </div>
          )}
          <div className={s.stat}><span>ارزش به قیمت فروش</span><b className="num">{faNum(data.sale_value)}</b><small>{cur}</small></div>
        </div>
      )}

      <Card
        title="فهرست کالاهای راکد"
        actions={
          <Select label="مرتب‌سازی" value={sort} options={[{ value: "idle", label: "طولانی‌ترین بی‌فروشی اول" }, { value: "value", label: "بیشترین ارزش اول" }]} fit onChange={(v) => setSort(v as typeof sort)} />
        }
      >
        <p className="hint" style={{ marginTop: 0 }}>
          محصولاتی که موجودی دارند ولی از آخرین فروششان (یا از روز ثبت، اگر هرگز فروش نرفته‌اند) دست‌کم {faNum(days)} روز گذشته. برای حراج، بنر یا کد تخفیف گزینه‌ی خوبی‌اند.
        </p>
        {rows.length ? (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr><th>محصول</th><th>موجودی</th>{data?.cost_value !== null && <th>ارزش خرید ({cur})</th>}<th>ارزش فروش ({cur})</th><th>آخرین فروش</th><th>روز بی‌فروش</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.product_id}>
                    <td>{can("products.view") ? <Link href={`/panel/products/${r.product_id}`}>{r.name}</Link> : r.name} <small className="muted">{r.category}</small></td>
                    <td className="num">{faNum(r.stock)}{r.stock_unknown ? " +؟" : ""}</td>
                    {data?.cost_value !== null && <td className="num">{r.stock_value === null ? <span className="muted">قیمت خرید ندارد</span> : faNum(r.stock_value)}</td>}
                    <td className="num">{faNum(r.sale_value)}</td>
                    <td className="muted">{r.last_sold ? faDate(r.last_sold) : "هرگز فروخته نشده"}</td>
                    <td className="num"><b>{faNum(r.idle_days)}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          !loading && <Empty icon="check" title={`کالایی بیش از ${faNum(days)} روز بی‌فروش نمانده`} />
        )}
      </Card>
    </>
  );
}

/* ---------- deductions ---------- */

type DeductionData = {
  from: string; to: string; pieces: number; cost_value: number | null; more: number;
  reasons: { reason: string; label: string; pieces: number; count: number; cost_value: number | null }[];
  rows: { id: number; created_at: string; product_id: number; product: string; color: string; size: string; qty: number; reason: string; reason_label: string; note: string; by: string; cost_value: number | null }[];
};

function Deductions() {
  const store = useStore();
  const [range, setRange] = useState<RangeValue>("month");
  const [custom, setCustom] = useState({ from: "", to: "" });
  const [reason, setReason] = useState("");
  const qs = new URLSearchParams(rangeOf(range, custom) as Record<string, string>).toString();
  const { data, loading } = useAdmin<DeductionData>(`/stock/deductions?${qs}`);
  const cur = store.currency_label;
  const rows = data?.rows.filter((r) => !reason || r.reason === reason) ?? [];

  return (
    <>
      <Card>
        <div className={s.toolbar} style={{ marginBottom: 0 }}>
          <Select label="بازه‌ی زمانی" value={range} options={RANGES} fit onChange={(v) => setRange(v as RangeValue)} />
          {range === "custom" && (
            <>
              <DateInput label="از" placeholder="از" value={custom.from} max={custom.to || undefined} clearable onChange={(v) => setCustom({ ...custom, from: v })} style={{ width: "auto" }} />
              <DateInput label="تا" placeholder="تا" value={custom.to} min={custom.from || undefined} clearable onChange={(v) => setCustom({ ...custom, to: v })} style={{ width: "auto" }} />
            </>
          )}
        </div>
      </Card>

      {data && (
        <div className={s.stats}>
          <button type="button" className={`${s.stat} ${k.statBtn}`} aria-pressed={!reason} onClick={() => setReason("")}>
            <span>کل کسر موجودی</span>
            <b className="num">{faNum(data.pieces)} <small>عدد</small></b>
            <small>{data.cost_value !== null ? `${faNum(data.cost_value)} ${cur} به قیمت خرید` : "همه‌ی دلیل‌ها"}</small>
          </button>
          {data.reasons.map((r) => (
            <button key={r.reason} type="button" className={`${s.stat} ${k.statBtn}`} aria-pressed={reason === r.reason} onClick={() => setReason(reason === r.reason ? "" : r.reason)}>
              <span>{r.label}</span>
              <b className="num">{faNum(r.pieces)} <small>عدد</small></b>
              <small>{r.cost_value !== null ? `${faNum(r.cost_value)} ${cur}` : `${faNum(r.count)} بار`}</small>
            </button>
          ))}
        </div>
      )}

      <Card title="ریز کسر موجودی‌ها">
        <p className="hint" style={{ marginTop: 0 }}>کالاهایی که بدون فروش از موجودی کم شده‌اند. ارزش با قیمت خرید فعلی هر محصول حساب شده است.</p>
        {rows.length ? (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr><th>زمان</th><th>محصول</th><th>رنگ / سایز</th><th>تعداد</th><th>دلیل</th>{data?.cost_value !== null && <th>ارزش خرید ({cur})</th>}<th>توسط</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="muted">{faDateTime(r.created_at)}</td>
                    <td>{r.product}</td>
                    <td>{r.color}، سایز <span className="num">{r.size}</span></td>
                    <td className="num">{faNum(r.qty)}</td>
                    <td>{r.reason_label}{r.note && <small className="muted" style={{ display: "block" }}>{r.note}</small>}</td>
                    {data?.cost_value !== null && <td className="num">{r.cost_value === null ? <span className="muted">—</span> : faNum(r.cost_value)}</td>}
                    <td className="muted">{r.by || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!!data?.more && <p className="hint">{faNum(data.more)} مورد قدیمی‌تر نمایش داده نشده؛ بازه را کوتاه‌تر کنید.</p>}
          </div>
        ) : (
          !loading && <Empty icon="check" title="در این بازه چیزی از موجودی کسر نشده" />
        )}
      </Card>
    </>
  );
}
