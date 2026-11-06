"use client";

import Link from "next/link";
import { useState } from "react";

import { Icon } from "@/components/Icon";
import { useStore } from "@/components/StoreProvider";
import { faDate, faNum, signed } from "@/lib/format";

import { DateInput } from "./DateInput";
import { RANGES, rangeOf, type RangeValue } from "./dates";
import { useAdmin } from "./hooks";
import { Card, Empty, Modal, PageHead } from "./ui";
import s from "./panel.module.css";
import rp from "./Reports.module.css";

type Pnl = {
  online: { orders: number; goods: number; discount: number; sales: number; shipping: number; refunds: number };
  store: { tickets: number; goods: number; discount: number; sales: number; returns: number };
  net_sales: number;
  cogs: number;
  gross_profit: number;
  gross_margin: number | null;
  expenses: { category: string; label: string; total: number; count: number }[];
  expense_total: number;
  /** Damaged and lost pieces, at purchase price. */
  write_offs: { pieces: number; total: number; missing_cost: number };
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
  const [open, setOpen] = useState<Line | null>(null);
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
            <button type="button" className={`${s.stat} ${rp.statBtn}`} onClick={() => setOpen("expenses")}>
              <span>هزینه‌ها</span>
              <b className="num">{faNum(data.pnl.expense_total)}</b>
              <small>{data.pnl.write_offs.total ? `جدا از ${faNum(data.pnl.write_offs.total)} کالای خراب و گم‌شده` : "برای دیدن ریز هزینه‌ها بزنید"}</small>
            </button>
            <button type="button" className={`${s.stat} ${rp.statBtn} ${data.pnl.net_profit < 0 ? s.statWarn : ""}`} onClick={() => setOpen("net_profit")}>
              <span>{data.pnl.net_profit < 0 ? "زیان خالص" : "سود خالص"}</span><b className="num">{faNum(Math.abs(data.pnl.net_profit))}</b><small>{cur} · چطور حساب شده؟</small>
            </button>
          </div>

          <div className={s.cols}>
            <Card title="فروش روزانه">
              <DailyChart days={data.daily} currency={cur} />
            </Card>
            <Card title="صورت سود و زیان">
              <Statement pnl={data.pnl} onOpen={setOpen} />
            </Card>
          </div>

          <Card title="پرفروش‌ها">
            {data.best_sellers.length ? (
              <div className={s.tableWrap}>
                <table className={s.table}>
                  <thead><tr><th>محصول</th><th>دسته</th><th>عدد فروش</th><th>فروش ({cur})</th><th>سود ({cur})</th></tr></thead>
                  <tbody>
                    {data.best_sellers.map((r) => (
                      <tr key={`${r.product_id}-${rp.name}`}>
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
          {open && <DetailModal key={open} line={open} pnl={data.pnl} params={params} currency={cur} onClose={() => setOpen(null)} onOpen={setOpen} />}
        </>
      )}
    </>
  );
}

type Line = "online" | "shipping" | "store" | "returns" | "net_sales" | "cogs" | "gross" | "expenses" | "write_offs" | "net_profit";

const WRITE_OFF_NOTE = "کالایی که در «موجودی انبار» با دلیل «خراب» یا «گم‌شده» کسر شده، به قیمت خریدش زیان حساب می‌شود؛ پولش رفته و فروشی هم ندارد. کالای «مرجوع به تأمین‌کننده» حساب نمی‌شود، چون پولش برمی‌گردد.";

/** Every line opens the numbers behind it. Expenses are one line; their breakdown is in its window. */
function Statement({ pnl, onOpen }: { pnl: Pnl; onOpen: (line: Line) => void }) {
  const row = (line: Line, label: string, value: number, opts: { minus?: boolean; strong?: boolean; hint?: string } = {}) => (
    <li key={line} className={opts.strong ? rp.strong : undefined}>
      <button type="button" onClick={() => onOpen(line)} aria-label={`${label}: ${faNum(value)}، دیدن جزئیات`}>
        <span className={rp.label}>
          {label}
          {opts.hint && <small>{opts.hint}</small>}
        </span>
        <span className={`num ${value < 0 ? "err" : ""}`}>{opts.minus && value ? signed("−", value) : faNum(value)}</span>
        <Icon name="chev" />
      </button>
    </li>
  );
  const returns = pnl.online.refunds + pnl.store.returns;
  return (
    <>
      <ul className={rp.statement}>
        {row("online", "فروش اینترنتی", pnl.online.sales, { hint: pnl.online.discount ? `بعد از ${faNum(pnl.online.discount)} تخفیف` : `${faNum(pnl.online.orders)} سفارش` })}
        {pnl.online.shipping > 0 && row("shipping", "هزینه‌ی ارسال دریافتی", pnl.online.shipping)}
        {row("store", "فروش حضوری", pnl.store.sales, { hint: pnl.store.discount ? `بعد از ${faNum(pnl.store.discount)} تخفیف` : `${faNum(pnl.store.tickets)} فاکتور` })}
        {returns > 0 && row("returns", "مرجوعی‌ها", returns, { minus: true })}
        {row("net_sales", "فروش خالص", pnl.net_sales, { strong: true })}
        {row("cogs", "قیمت خرید کالاهای فروخته‌شده", pnl.cogs, { minus: true })}
        {row("gross", "سود ناخالص", pnl.gross_profit, { strong: true, hint: pnl.gross_margin !== null ? `${faNum(pnl.gross_margin)}٪ از فروش` : "" })}
        {row("expenses", "هزینه‌ها", pnl.expense_total, { minus: true, hint: pnl.expenses.length ? `${faNum(pnl.expenses.reduce((n, e) => n + e.count, 0))} مورد در ${faNum(pnl.expenses.length)} دسته` : "" })}
        {(pnl.write_offs.total > 0 || pnl.write_offs.pieces > 0) &&
          row("write_offs", "کالای خراب و گم‌شده", pnl.write_offs.total, { minus: true, hint: `${faNum(pnl.write_offs.pieces)} عدد، به قیمت خرید` })}
        {row("net_profit", pnl.net_profit < 0 ? "زیان خالص" : "سود خالص", pnl.net_profit, { strong: true })}
      </ul>
      <p className="hint">برای دیدن ریز هر عدد، روی آن ردیف بزنید.</p>
    </>
  );
}

type Detail = {
  line: Line;
  columns: { key: string; label: string; kind: "text" | "num" | "money" | "date" }[];
  rows: (Record<string, string | number | null> & { href?: string | null })[];
  count: number;
  more: number;
  total: number;
};

const TITLES: Record<Line, string> = {
  online: "فروش اینترنتی", shipping: "هزینه‌ی ارسال دریافتی", store: "فروش حضوری", returns: "مرجوعی‌ها", net_sales: "فروش خالص",
  cogs: "قیمت خرید کالاهای فروخته‌شده", gross: "سود ناخالص هر محصول", expenses: "هزینه‌ها", write_offs: "کالای خراب و گم‌شده", net_profit: "سود خالص",
};

const NOTES: Partial<Record<Line, string>> = {
  online: "سفارش‌های پرداخت‌شده‌ی این بازه، بعد از کم شدن تخفیف. هزینه‌ی ارسال جدا حساب شده.",
  store: "فاکتورهای ثبت‌شده در صندوق، بعد از کم شدن تخفیف. فاکتورهای باطل‌شده حساب نشده‌اند.",
  returns: "پولی که در این بازه به مشتری پس داده شده: مرجوعی‌های اینترنتی «انجام‌شده» با بازگشت وجه، و کالاهای پس‌گرفته در صندوق.",
  cogs: "قیمت خریدی که هنگام هر فروش در محصول ثبت بوده، ضرب در تعداد فروش. کالاهای پس‌گرفته کم شده‌اند.",
  gross: "فروش هر محصول منهای قیمت خرید آن. محصولی که قیمت خرید نداشته، سودش بیشتر از واقع دیده می‌شود.",
  expenses: "هزینه‌هایی که در صفحه‌ی «هزینه‌ها» برای روزهای این بازه ثبت شده.",
  write_offs: WRITE_OFF_NOTE,
};

/** A line's breakdown. Formula lines are explained from the statement itself; the rest come from the server. */
function DetailModal({ line, pnl, params, currency, onClose, onOpen }: { line: Line; pnl: Pnl; params: string; currency: string; onClose: () => void; onOpen: (l: Line) => void }) {
  const formula = line === "net_sales" || line === "net_profit";
  const { data, loading } = useAdmin<Detail>(formula ? null : `/reports/detail/${line}?${params}`);
  const [q, setQ] = useState("");
  const term = q.trim();
  const rows = (data?.rows ?? []).filter((row) => !term || data!.columns.some((c) => c.kind === "text" && String(row[c.key] ?? "").includes(term)));
  const shown = term ? rows.reduce((n, row) => n + (Number(row.amount) || 0), 0) : data?.total ?? 0;
  const cell = (kind: string, v: string | number | null | undefined) =>
    v === null || v === undefined || v === "" ? <span className="muted">—</span>
      : kind === "money" || kind === "num" ? faNum(Number(v))
        : kind === "date" ? faDate(String(v).length === 10 ? `${v}T12:00:00` : String(v))
          : String(v);

  return (
    <Modal title={TITLES[line]} onClose={onClose} wide>
      {NOTES[line] && <p className="hint" style={{ marginTop: 0 }}>{NOTES[line]}</p>}

      {formula ? (
        <Formula line={line} pnl={pnl} currency={currency} onOpen={onOpen} />
      ) : (
        <>
          {line === "expenses" && pnl.expenses.length > 0 && (
            <div className={rp.chips}>
              {pnl.expenses.map((e) => (
                <span key={e.category}>{e.label} <b className="num">{faNum(e.total)}</b> <small className="num">({faNum(e.count)} مورد)</small></span>
              ))}
            </div>
          )}
          {line === "write_offs" && pnl.write_offs.missing_cost > 0 && (
            <p className="err">{faNum(pnl.write_offs.missing_cost)} عدد قیمت خرید نداشت و در این عدد حساب نشده.</p>
          )}
          {data && data.count > 8 && (
            <label className={`${s.search} ${rp.detailSearch}`}>
              <Icon name="search" />
              <span className="sr-only">جستجو در ردیف‌ها</span>
              <input className="input" placeholder="جستجو در ردیف‌ها" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
          )}
          {data?.rows.length ? (
            <div className={rp.detailScroll}>
              <table className={s.table}>
                <thead>
                  <tr>{data.columns.map((c) => <th key={c.key}>{c.label}{c.kind === "money" ? ` (${currency})` : ""}</th>)}</tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i}>
                      {data.columns.map((c, j) => (
                        <td key={c.key} className={c.kind === "money" || c.kind === "num" ? `num ${Number(row[c.key]) < 0 ? "err" : ""}` : c.kind === "date" ? "muted" : undefined}>
                          {j === 0 && row.href ? <Link href={row.href}>{cell(c.kind, row[c.key])}</Link> : cell(c.kind, row[c.key])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            !loading && <Empty icon="chart" title="در این بازه ردیفی نیست" />
          )}
          {data && data.rows.length > 0 && (
            <p className={rp.detailTotal}>
              <span>{term ? `${faNum(rows.length)} ردیف از ${faNum(data.count)}` : `${faNum(data.count)} ردیف`}</span>
              <b className="num">جمع: {faNum(shown)} {currency}</b>
            </p>
          )}
          {!!data?.more && <p className="hint">{faNum(data.more)} ردیف دیگر نمایش داده نشده؛ بازه‌ی زمانی را کوتاه‌تر کنید.</p>}
          {line === "expenses" && <Link href="/panel/expenses" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`}>ثبت و ویرایش هزینه‌ها</Link>}
        </>
      )}
    </Modal>
  );
}

/** How a total line is made, each part opening its own window. */
function Formula({ line, pnl, currency, onOpen }: { line: Line; pnl: Pnl; currency: string; onOpen: (l: Line) => void }) {
  const part = (l: Line, label: string, value: number, sign: "+" | "−") => (
    <li key={l}>
      <button type="button" onClick={() => onOpen(l)}>
        <span>{label}</span><span className="num">{signed(sign, value)}</span><Icon name="chev" />
      </button>
    </li>
  );
  const returns = pnl.online.refunds + pnl.store.returns;
  return (
    <>
      <ul className={rp.statement}>
        {line === "net_sales" ? (
          <>
            {part("online", "فروش اینترنتی", pnl.online.sales, "+")}
            {pnl.online.shipping > 0 && part("shipping", "هزینه‌ی ارسال دریافتی", pnl.online.shipping, "+")}
            {part("store", "فروش حضوری", pnl.store.sales, "+")}
            {returns > 0 && part("returns", "مرجوعی‌ها", returns, "−")}
          </>
        ) : (
          <>
            {part("net_sales", "فروش خالص", pnl.net_sales, "+")}
            {part("cogs", "قیمت خرید کالاهای فروخته‌شده", pnl.cogs, "−")}
            {part("expenses", "هزینه‌ها", pnl.expense_total, "−")}
            {pnl.write_offs.total > 0 && part("write_offs", "کالای خراب و گم‌شده", pnl.write_offs.total, "−")}
          </>
        )}
        <li className={rp.strong}>
          <span className={rp.formulaTotal}>
            <span>= {TITLES[line]}</span>
            <b className={`num ${(line === "net_sales" ? pnl.net_sales : pnl.net_profit) < 0 ? "err" : ""}`}>
              {faNum(line === "net_sales" ? pnl.net_sales : pnl.net_profit)} {currency}
            </b>
          </span>
        </li>
      </ul>
      {line === "net_profit" && pnl.write_offs.total > 0 && <p className="hint">{WRITE_OFF_NOTE}</p>}
    </>
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
