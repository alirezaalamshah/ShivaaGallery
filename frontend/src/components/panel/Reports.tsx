"use client";

import Link from "next/link";
import { useState } from "react";

import { useStore } from "@/components/StoreProvider";
import { faDate, faNum } from "@/lib/format";

import { DateInput } from "./DateInput";
import { RANGES, rangeOf, type RangeValue } from "./dates";
import { useAdmin } from "./hooks";
import { Card, Empty, PageHead } from "./ui";
import s from "./panel.module.css";

type Pnl = {
  online: { orders: number; goods: number; discount: number; sales: number; shipping: number; refunds: number };
  store: { tickets: number; goods: number; discount: number; sales: number; returns: number };
  net_sales: number;
  cogs: number;
  gross_profit: number;
  gross_margin: number | null;
  expenses: { category: string; label: string; total: number; count: number }[];
  expense_total: number;
  net_profit: number;
  missing_cost: { pieces: number; sales: number };
};

type ProductRow = { product_id: number | null; name: string; category: string; qty: number; sales: number; cost: number; missing_cost: number; profit: number | null };

type Slow = {
  product_id: number; name: string; category: string; price: number; cost_price: number | null; stock: number; stock_unknown: boolean;
  stock_value: number | null; last_sold: string | null; idle_days: number; never_sold: boolean;
};

type Report = {
  from: string;
  to: string;
  pnl: Pnl;
  daily: { day: string; online: number; store: number }[];
  best_sellers: ProductRow[];
  by_category: { category: string; qty: number; sales: number }[];
  by_seller: { seller: string; tickets: number; total: number }[];
  slow_movers: Slow[];
  products_without_cost: number;
};

// Validated for the cream panel surface (dataviz validator: all checks pass).
const SERIES = [
  { key: "online", label: "اینترنتی", color: "#2a6fa8" },
  { key: "store", label: "حضوری", color: "#a8781c" },
] as const;

const PRESETS = RANGES.filter((r) => r.value !== "today");

/** Profit and loss, best sellers and slow movers, from the site and the shop till together. */
export function Reports() {
  const store = useStore();
  const [range, setRange] = useState<RangeValue>("month");
  const [custom, setCustom] = useState({ from: "", to: "" });
  const dates = range === "" ? { from: "2000-01-01" } : rangeOf(range, custom);
  const params = new URLSearchParams(dates as Record<string, string>).toString();
  const { data, loading } = useAdmin<Report>(`/reports?${params}`);
  const cur = store.currency_label;

  return (
    <>
      <PageHead title="سود و زیان و گزارش‌ها" sub="فروش سایت و مغازه با هم. سود از روی قیمت خریدی حساب می‌شود که هنگام هر فروش در محصول ثبت بوده است." />
      <Card>
        <div className={s.toolbar} style={{ marginBottom: 0 }}>
          <select className="input" aria-label="بازه‌ی زمانی" value={range} onChange={(e) => setRange(e.target.value as RangeValue)} style={{ width: "auto" }}>
            {PRESETS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          {range === "custom" && (
            <>
              <DateInput label="از" placeholder="از" value={custom.from} max={custom.to || undefined} clearable onChange={(v) => setCustom({ ...custom, from: v })} style={{ width: "auto" }} />
              <DateInput label="تا" placeholder="تا" value={custom.to} min={custom.from || undefined} clearable onChange={(v) => setCustom({ ...custom, to: v })} style={{ width: "auto" }} />
            </>
          )}
          {data && <span className="muted">{faDate(`${data.from}T12:00:00`)} تا {faDate(`${data.to}T12:00:00`)}</span>}
        </div>
      </Card>

      {!data ? (
        !loading && <Empty icon="chart" title="گزارش آماده نشد" />
      ) : (
        <>
          {(data.pnl.missing_cost.pieces > 0 || data.products_without_cost > 0) && (
            <p className={`${s.card} err`} role="status" style={{ margin: 0 }}>
              {data.pnl.missing_cost.pieces > 0 && `${faNum(data.pnl.missing_cost.pieces)} عدد از فروش این بازه (${faNum(data.pnl.missing_cost.sales)} ${cur}) قیمت خرید نداشت و سودش بیشتر از واقع نشان داده می‌شود. `}
              {data.products_without_cost > 0 && <>{faNum(data.products_without_cost)} محصول هنوز قیمت خرید ندارد. <Link href="/panel/products" className="link-more">ثبت در محصولات</Link></>}
            </p>
          )}

          <div className={s.stats}>
            <div className={s.stat}><span>فروش خالص</span><b className="num">{faNum(data.pnl.net_sales)}</b><small>{cur} · {faNum(data.pnl.online.orders)} سفارش، {faNum(data.pnl.store.tickets)} فاکتور</small></div>
            <div className={s.stat}><span>سود ناخالص</span><b className="num">{faNum(data.pnl.gross_profit)}</b><small>{data.pnl.gross_margin !== null ? `${faNum(data.pnl.gross_margin)}٪ از فروش` : cur}</small></div>
            <div className={s.stat}><span>هزینه‌ها</span><b className="num">{faNum(data.pnl.expense_total)}</b><small><Link href="/panel/expenses">ثبت و دیدن هزینه‌ها</Link></small></div>
            <div className={`${s.stat} ${data.pnl.net_profit < 0 ? s.statWarn : ""}`}><span>{data.pnl.net_profit < 0 ? "زیان خالص" : "سود خالص"}</span><b className="num">{faNum(Math.abs(data.pnl.net_profit))}</b><small>{cur}</small></div>
          </div>

          <div className={s.cols}>
            <Card title="فروش روزانه">
              <DailyChart days={data.daily} currency={cur} />
            </Card>
            <Card title="صورت سود و زیان">
              <Statement pnl={data.pnl} />
            </Card>
          </div>

          <Card title="پرفروش‌ها">
            {data.best_sellers.length ? (
              <div className={s.tableWrap}>
                <table className={s.table}>
                  <thead><tr><th>محصول</th><th>دسته</th><th>عدد فروش</th><th>فروش ({cur})</th><th>سود ({cur})</th></tr></thead>
                  <tbody>
                    {data.best_sellers.map((r) => (
                      <tr key={`${r.product_id}-${r.name}`}>
                        <td>{r.product_id ? <Link href={`/panel/products/${r.product_id}`}>{r.name}</Link> : r.name}</td>
                        <td className="muted">{r.category}</td>
                        <td className="num">{faNum(r.qty)}</td>
                        <td className="num">{faNum(r.sales)}</td>
                        <td className="num">{r.profit === null ? <span className="muted">قیمت خرید ندارد</span> : faNum(r.profit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="muted">در این بازه فروشی نبوده.</p>}
          </Card>

          <Card title="کالاهای راکد" actions={<Link href="/panel/stock?tab=stale" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`}>با فیلتر روز و دسته</Link>}>
            <p className="hint" style={{ marginTop: 0 }}>محصولاتی که موجودی دارند ولی در این بازه هیچ فروشی نداشتند؛ هر چه بیشتر مانده، بالاتر. برای حراج یا بنر گزینه‌ی خوبی‌اند.</p>
            {data.slow_movers.length ? (
              <div className={s.tableWrap}>
                <table className={s.table}>
                  <thead><tr><th>محصول</th><th>موجودی</th><th>ارزش خرید موجودی ({cur})</th><th>آخرین فروش</th><th>روز بی‌فروش</th></tr></thead>
                  <tbody>
                    {data.slow_movers.map((r) => (
                      <tr key={r.product_id}>
                        <td><Link href={`/panel/products/${r.product_id}`}>{r.name}</Link> <small className="muted">{r.category}</small></td>
                        <td className="num">{faNum(r.stock)}{r.stock_unknown ? " +؟" : ""}</td>
                        <td className="num">{r.stock_value === null ? <span className="muted">قیمت خرید ندارد</span> : faNum(r.stock_value)}</td>
                        <td className="muted">{r.last_sold ? faDate(r.last_sold) : "هرگز فروخته نشده"}</td>
                        <td className="num">{faNum(r.idle_days)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="muted">همه‌ی محصولات موجود در این بازه فروش داشته‌اند.</p>}
          </Card>

          <div className={s.cols}>
            <Card title="فروش هر دسته">
              {data.by_category.length ? (
                <table className={s.table}>
                  <thead><tr><th>دسته</th><th>عدد</th><th>فروش ({cur})</th></tr></thead>
                  <tbody>
                    {data.by_category.map((c) => (
                      <tr key={c.category}><td>{c.category}</td><td className="num">{faNum(c.qty)}</td><td className="num">{faNum(c.sales)}</td></tr>
                    ))}
                  </tbody>
                </table>
              ) : <p className="muted">—</p>}
            </Card>
            <Card title="فروش حضوری هر فروشنده">
              {data.by_seller.length ? (
                <table className={s.table}>
                  <thead><tr><th>فروشنده</th><th>فاکتور</th><th>مبلغ ({cur})</th></tr></thead>
                  <tbody>
                    {data.by_seller.map((x) => (
                      <tr key={x.seller}><td>{x.seller}</td><td className="num">{faNum(x.tickets)}</td><td className="num">{faNum(x.total)}</td></tr>
                    ))}
                  </tbody>
                </table>
              ) : <p className="muted">در این بازه فروش حضوری نبوده.</p>}
            </Card>
          </div>
        </>
      )}
    </>
  );
}

function Statement({ pnl }: { pnl: Pnl }) {
  const row = (label: string, value: number, opts: { minus?: boolean; strong?: boolean; hint?: string } = {}) => (
    <>
      <dt>{opts.strong ? <b>{label}</b> : label}{opts.hint && <small className="muted"> {opts.hint}</small>}</dt>
      <dd className={`num ${value < 0 ? "err" : ""}`}>{opts.strong ? <b>{opts.minus ? "− " : ""}{faNum(value)}</b> : <>{opts.minus ? "− " : ""}{faNum(value)}</>}</dd>
    </>
  );
  return (
    <dl className={s.kv}>
      {row("فروش اینترنتی", pnl.online.sales, { hint: pnl.online.discount ? `(بعد از ${faNum(pnl.online.discount)} تخفیف)` : "" })}
      {pnl.online.shipping > 0 && row("هزینه‌ی ارسال دریافتی", pnl.online.shipping)}
      {row("فروش حضوری", pnl.store.sales, { hint: pnl.store.discount ? `(بعد از ${faNum(pnl.store.discount)} تخفیف)` : "" })}
      {pnl.online.refunds + pnl.store.returns > 0 && row("مرجوعی‌ها", pnl.online.refunds + pnl.store.returns, { minus: true })}
      {row("فروش خالص", pnl.net_sales, { strong: true })}
      {row("قیمت خرید کالاهای فروخته‌شده", pnl.cogs, { minus: true })}
      {row("سود ناخالص", pnl.gross_profit, { strong: true })}
      {pnl.expenses.map((e) => <span key={e.category} style={{ display: "contents" }}>{row(e.label, e.total, { minus: true })}</span>)}
      {row(pnl.net_profit < 0 ? "زیان خالص" : "سود خالص", pnl.net_profit, { strong: true })}
    </dl>
  );
}

/** Net sales per day, online and at the shop, stacked; hover or focus a day for its numbers. */
function DailyChart({ days, currency }: { days: Report["daily"]; currency: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const max = Math.max(1, ...days.map((d) => Math.max(0, d.online) + Math.max(0, d.store)));
  const every = Math.max(1, Math.ceil(days.length / 8));
  const h = hover !== null ? days[hover] : null;
  const label = (d: string) => new Intl.DateTimeFormat("fa-IR-u-ca-persian", { month: "short", day: "numeric" }).format(new Date(`${d}T12:00:00`));

  if (!days.some((d) => d.online || d.store)) return <p className="muted">در این بازه فروشی نبوده.</p>;

  return (
    <div className={s.stack}>
      <div className={s.legendRow}>
        {SERIES.map((x) => (
          <span key={x.key} className={s.legendItem}><i style={{ background: x.color }} />{x.label}</span>
        ))}
        <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} style={{ marginInlineStart: "auto" }} onClick={() => setTable(!table)}>
          {table ? "نمودار" : "جدول"}
        </button>
      </div>
      {table ? (
        <div className={s.tableWrap} style={{ maxHeight: 260, overflowY: "auto" }}>
          <table className={s.table}>
            <thead><tr><th>روز</th><th>اینترنتی</th><th>حضوری</th><th>جمع</th></tr></thead>
            <tbody>
              {days.map((d) => (
                <tr key={d.day}><td>{label(d.day)}</td><td className="num">{faNum(d.online)}</td><td className="num">{faNum(d.store)}</td><td className="num">{faNum(d.online + d.store)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className={s.dayChart} onMouseLeave={() => setHover(null)}>
          <span className={s.dayChartMax}>{faNum(max)}</span>
          <div className={s.dayBars} style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
            {days.map((d, i) => (
              <button
                key={d.day}
                type="button"
                className={s.dayBar}
                aria-label={`${label(d.day)}: اینترنتی ${faNum(d.online)}، حضوری ${faNum(d.store)} ${currency}`}
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                data-on={hover === i || undefined}
              >
                <span className={s.dayStack}>
                  {SERIES.map((x) => {
                    const v = Math.max(0, d[x.key]);
                    return v ? <i key={x.key} style={{ height: `${(v / max) * 100}%`, background: x.color }} /> : null;
                  })}
                </span>
                <small>{i % every === 0 ? label(d.day) : ""}</small>
              </button>
            ))}
          </div>
          {h && (
            <div className={s.dayTip} role="status">
              <b>{label(h.day)}</b>
              {SERIES.map((x) => (
                <span key={x.key}><i style={{ background: x.color }} />{x.label}: <span className="num">{faNum(h[x.key])}</span></span>
              ))}
              <span>جمع: <b className="num">{faNum(h.online + h.store)}</b> {currency}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
