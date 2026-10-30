"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "@/components/auth/AuthProvider";
import { Icon } from "@/components/Icon";
import { useStore } from "@/components/StoreProvider";
import { useToast } from "@/components/Toast";
import { ApiError } from "@/lib/client";
import { faNum, toEnDigits, toFaDigits } from "@/lib/format";

import { adminCall, refreshSite } from "../hooks";
import { MoneyInput, Modal } from "../ui";
import s from "../panel.module.css";
import p from "./pos.module.css";
import { type Lookup, type PosProduct, type PosVariant, type Sale, type TicketLine, UNKNOWN_STOCK } from "./types";

type Pay = "cash" | "card" | "transfer" | "split";

const PAY: { value: Pay; label: string }[] = [
  { value: "cash", label: "نقد" },
  { value: "card", label: "کارت‌خوان" },
  { value: "transfer", label: "کارت به کارت" },
  { value: "split", label: "چند روش" },
];

const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

type Ticket = {
  lines: TicketLine[];
  discount: number;
  discountMode: "amount" | "percent";
  discountInput: number | null;
  pay: Pay;
  split: { cash: number | null; card: number | null; transfer: number | null };
  received: number | null;
  customerName: string;
  customerPhone: string;
  note: string;
  key: string;
};

const EMPTY: Omit<Ticket, "key"> = {
  lines: [],
  discount: 0,
  discountMode: "amount",
  discountInput: null,
  pay: "cash",
  split: { cash: null, card: null, transfer: null },
  received: null,
  customerName: "",
  customerPhone: "",
  note: "",
};

const fresh = (): Ticket => ({ ...EMPTY, key: newKey() });

export const payText = (sale: Pick<Sale, "cash" | "card" | "transfer">) =>
  [sale.cash && `نقد ${faNum(sale.cash)}`, sale.card && `کارت‌خوان ${faNum(sale.card)}`, sale.transfer && `کارت به کارت ${faNum(sale.transfer)}`].filter(Boolean).join(" · ");

const stockText = (n: number) => (n >= UNKNOWN_STOCK ? "؟" : n === 0 ? "تمام" : faNum(n));

/** Ring up one in-store sale. The open ticket survives a page refresh, per person, in this browser. */
export function Register() {
  const { me } = useAuth();
  const store = useStore();
  const toast = useToast();
  const storageKey = `pos:ticket:${me?.username ?? ""}`;
  const [ticket, setTicket] = useState<Ticket>(fresh);
  const [loaded, setLoaded] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PosProduct[]>([]);
  const [maxDiscount, setMaxDiscount] = useState<number | null>(null);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [short, setShort] = useState<Record<number, number>>({});
  const [done, setDone] = useState<{ sale: Sale; change: number | null } | null>(null);
  const [showCustomer, setShowCustomer] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const ticketRef = useRef<HTMLElement>(null);

  // Keep the open ticket across refreshes.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (saved && Array.isArray(saved.lines)) setTicket({ ...fresh(), ...saved });
    } catch {
      /* nothing saved, or storage blocked */
    }
    setLoaded(true);
  }, [storageKey]);
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(ticket));
    } catch {
      /* the till still works for this visit */
    }
  }, [ticket, loaded, storageKey]);

  const search = useCallback(async (term: string) => {
    setSearching(true);
    try {
      const res = await adminCall<Lookup>(`/pos/lookup?q=${encodeURIComponent(term)}`);
      setResults(res.products);
      setMaxDiscount(res.max_discount);
      return res;
    } catch (e) {
      toast({ text: e instanceof Error ? e.message : "جستجو ممکن نشد." });
      return null;
    } finally {
      setSearching(false);
    }
  }, [toast]);

  useEffect(() => {
    const t = setTimeout(() => search(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q, search]);

  const add = (product: PosProduct, v: PosVariant) => {
    setError("");
    const have = ticket.lines.find((l) => l.variant === v.id);
    if (have && v.stock < UNKNOWN_STOCK && have.qty >= v.stock) {
      toast({ text: `از ${product.name} ${v.color} سایز ${v.size} فقط ${faNum(v.stock)} عدد موجود است.` });
      return;
    }
    const line: TicketLine = {
      variant: v.id, product: product.name, color: v.color, colorHex: v.color_hex, size: v.size, sku: v.sku,
      price: v.price, stock: v.stock, image: product.image, qty: 1,
    };
    setTicket((t) => ({
      ...t,
      lines: t.lines.some((l) => l.variant === v.id)
        ? t.lines.map((l) => (l.variant === v.id ? { ...l, qty: l.qty + 1, stock: v.stock, price: v.price } : l))
        : [...t.lines, line],
    }));
  };

  const onSearchKey = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    // A barcode scanner types the code and presses Enter: add that piece at once.
    const res = await search(q.trim());
    const product = res?.products.find((x) => x.variants.some((v) => v.id === res.exact));
    const v = product?.variants.find((x) => x.id === res?.exact);
    if (product && v) {
      if (v.stock === 0) toast({ text: `${product.name} ${v.color} سایز ${v.size} تمام شده است.` });
      else add(product, v);
      setQ("");
    }
  };

  const setQty = (variant: number, qty: number) => {
    setError("");
    setTicket((t) => ({
      ...t,
      lines: qty <= 0 ? t.lines.filter((l) => l.variant !== variant) : t.lines.map((l) => (l.variant === variant ? { ...l, qty } : l)),
    }));
  };

  const subtotal = useMemo(() => ticket.lines.reduce((n, l) => n + l.price * l.qty, 0), [ticket.lines]);
  const pieces = ticket.lines.reduce((n, l) => n + l.qty, 0);
  const discount = Math.min(
    subtotal,
    ticket.discountMode === "percent" ? Math.round((subtotal * Math.min(100, ticket.discountInput ?? 0)) / 100) : ticket.discountInput ?? 0,
  );
  const total = subtotal - discount;
  const overLimit = maxDiscount !== null && discount * 100 > subtotal * maxDiscount;
  const payments =
    ticket.pay === "split"
      ? { cash: ticket.split.cash ?? 0, card: ticket.split.card ?? 0, transfer: ticket.split.transfer ?? 0 }
      : { cash: 0, card: 0, transfer: 0, [ticket.pay]: total };
  const paid = payments.cash + payments.card + payments.transfer;
  const change = ticket.pay === "cash" && ticket.received ? ticket.received - total : null;

  const problems = [
    !ticket.lines.length && "کالایی در فاکتور نیست.",
    overLimit && `تخفیف شما حداکثر ${faNum(maxDiscount!)}٪ است.`,
    ticket.pay === "split" && paid !== total && `جمع پرداخت‌ها ${faNum(paid)} است؛ باید ${faNum(total)} باشد.`,
    change !== null && change < 0 && "مبلغ دریافتی کمتر از مبلغ فاکتور است.",
  ].filter(Boolean) as string[];

  const finish = async () => {
    if (problems.length) {
      setError(problems[0]);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const sale = await adminCall<Sale>("/pos/sales", {
        method: "POST",
        body: {
          lines: ticket.lines.map((l) => ({ variant: l.variant, qty: l.qty })),
          discount,
          ...payments,
          customer_name: ticket.customerName,
          customer_phone: toEnDigits(ticket.customerPhone),
          note: ticket.note,
          client_key: ticket.key,
        },
      });
      setDone({ sale, change });
      setTicket(fresh());
      setShort({});
      setShowCustomer(false);
      search(q.trim());
      refreshSite();
    } catch (e) {
      if (e instanceof ApiError && Array.isArray(e.data?.lines)) {
        const lines = e.data.lines as { variant: number; available?: number }[];
        setShort(Object.fromEntries(lines.map((l) => [l.variant, l.available ?? 0])));
      }
      setError(e instanceof Error ? e.message : "ثبت نشد.");
    } finally {
      setBusy(false);
    }
  };

  const nextSale = () => {
    setDone(null);
    searchRef.current?.focus();
  };

  return (
    <div className={p.till}>
      <section className={p.catalog} aria-label="انتخاب کالا">
        <label className={`${s.search} ${p.searchBox}`}>
          <Icon name="search" />
          <span className="sr-only">جستجوی کالا</span>
          <input
            ref={searchRef}
            className="input"
            placeholder="نام محصول، دسته یا کد کالا (بارکد)"
            value={q}
            autoFocus
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onSearchKey}
          />
        </label>
        <div className={p.results} aria-busy={searching}>
          {results.map((product) => {
            const colors = [...new Map(product.variants.map((v) => [v.color, v.color_hex])).entries()];
            return (
              <article key={product.id} className={p.product}>
                <header>
                  {product.image ? (
                    // eslint-disable-next-line @next/next/no-img-element -- small thumbnail
                    <img src={product.image} alt="" />
                  ) : (
                    <span className={p.noImg} />
                  )}
                  <b>{product.name}</b>
                  {!product.active && <small className="muted">(در سایت نمایش داده نمی‌شود)</small>}
                </header>
                {colors.map(([color, hex]) => (
                  <div key={color} className={p.colorRow}>
                    <span className={p.colorName}><i style={{ background: hex }} />{color}</span>
                    <span className={p.sizes}>
                      {product.variants.filter((v) => v.color === color).map((v) => {
                        const inTicket = ticket.lines.find((l) => l.variant === v.id)?.qty ?? 0;
                        return (
                          <button
                            key={v.id}
                            type="button"
                            className={`${p.size} ${inTicket ? p.sizeIn : ""}`}
                            disabled={v.stock === 0}
                            onClick={() => add(product, v)}
                            aria-label={`${product.name} ${color} سایز ${v.size}، ${faNum(v.price)} ${store.currency_label}، موجودی ${stockText(v.stock)}`}
                          >
                            <b className="num">{v.size}</b>
                            <small className="num">{stockText(v.stock)}</small>
                            {inTicket > 0 && <em className="num">{faNum(inTicket)}</em>}
                          </button>
                        );
                      })}
                    </span>
                  </div>
                ))}
              </article>
            );
          })}
          {!searching && !results.length && <p className="muted">کالایی پیدا نشد.</p>}
        </div>
      </section>

      <aside ref={ticketRef} className={p.ticket} aria-label="فاکتور">
        <h2>فاکتور <small className="num">{pieces ? `${faNum(pieces)} عدد` : ""}</small></h2>
        {ticket.lines.length ? (
          <ul className={p.lines}>
            {ticket.lines.map((l) => {
              const left = short[l.variant];
              return (
                <li key={l.variant} className={left !== undefined ? p.lineShort : undefined}>
                  <span className={p.lineWhat}>
                    <b>{l.product}</b>
                    <small><i style={{ background: l.colorHex }} />{l.color}، سایز <span className="num">{l.size}</span></small>
                    {left !== undefined && <small className="err">فقط {faNum(left)} عدد موجود است</small>}
                  </span>
                  <span className={p.qty}>
                    <button type="button" aria-label="یکی کمتر" onClick={() => setQty(l.variant, l.qty - 1)}><Icon name={l.qty === 1 ? "trash" : "minus"} /></button>
                    <b className="num">{faNum(l.qty)}</b>
                    <button type="button" aria-label="یکی بیشتر" disabled={l.stock < UNKNOWN_STOCK && l.qty >= l.stock} onClick={() => setQty(l.variant, l.qty + 1)}><Icon name="plus" /></button>
                  </span>
                  <span className={`${p.linePrice} num`}>{faNum(l.price * l.qty)}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className={p.emptyTicket}>
            <Icon name="bag" />
            کالا را از فهرست انتخاب کنید یا کد آن را اسکن کنید.
          </p>
        )}

        <div className={p.sums}>
          <div><span>جمع کالاها</span><b className="num">{faNum(subtotal)}</b></div>
          <div className={p.discountRow}>
            <span>تخفیف</span>
            <span className={p.discountInput}>
              <MoneyInput id="pos-discount" value={ticket.discountInput} onChange={(v) => setTicket({ ...ticket, discountInput: v })} placeholder="۰" />
              <span className={s.tabs} role="group" aria-label="نوع تخفیف">
                <button type="button" className={s.tab} aria-pressed={ticket.discountMode === "amount"} onClick={() => setTicket({ ...ticket, discountMode: "amount" })}>{store.currency_label}</button>
                <button type="button" className={s.tab} aria-pressed={ticket.discountMode === "percent"} onClick={() => setTicket({ ...ticket, discountMode: "percent" })}>٪</button>
              </span>
            </span>
          </div>
          {discount > 0 && <div className={p.minor}><span>مبلغ تخفیف</span><span className="num">− {faNum(discount)}</span></div>}
          {maxDiscount !== null && <div className={`${p.minor} ${overLimit ? p.warn : ""}`}><span>سقف تخفیف شما</span><span className="num">{faNum(maxDiscount)}٪</span></div>}
          <div className={p.total}><span>مبلغ قابل پرداخت</span><b className="num">{faNum(total)} <small>{store.currency_label}</small></b></div>
        </div>

        <div className={p.payTabs} role="radiogroup" aria-label="روش پرداخت">
          {PAY.map((m) => (
            <button key={m.value} type="button" role="radio" aria-checked={ticket.pay === m.value} onClick={() => setTicket({ ...ticket, pay: m.value })}>
              {m.label}
            </button>
          ))}
        </div>

        {ticket.pay === "cash" && (
          <label className={p.payField}>
            <span>مبلغ دریافتی از مشتری</span>
            <MoneyInput id="pos-received" value={ticket.received} onChange={(v) => setTicket({ ...ticket, received: v })} placeholder="اختیاری" />
            {change !== null && change >= 0 && <span className={p.change}>باقی‌مانده برای پس دادن: <b className="num">{faNum(change)}</b></span>}
          </label>
        )}
        {ticket.pay === "split" && (
          <div className={p.split}>
            {(["cash", "card", "transfer"] as const).map((k) => (
              <label key={k} className={p.payField}>
                <span>{PAY.find((m) => m.value === k)!.label}</span>
                <MoneyInput id={`pos-${k}`} value={ticket.split[k]} onChange={(v) => setTicket({ ...ticket, split: { ...ticket.split, [k]: v } })} placeholder="۰" />
              </label>
            ))}
            <span className={`${p.minor} ${paid !== total ? p.warn : ""}`}>
              {paid === total ? "جمع پرداخت‌ها درست است." : paid < total ? `${faNum(total - paid)} مانده` : `${faNum(paid - total)} بیشتر از مبلغ فاکتور`}
            </span>
          </div>
        )}

        <button type="button" className={p.more} aria-expanded={showCustomer} onClick={() => setShowCustomer(!showCustomer)}>
          اطلاعات مشتری و یادداشت (اختیاری) <Icon name="chev" />
        </button>
        {showCustomer && (
          <div className={p.customer}>
            <input className="input" placeholder="نام مشتری" value={ticket.customerName} onChange={(e) => setTicket({ ...ticket, customerName: e.target.value })} maxLength={80} />
            <input className="input ltr num" inputMode="tel" placeholder="موبایل مشتری" value={toFaDigits(ticket.customerPhone)} onChange={(e) => setTicket({ ...ticket, customerPhone: toEnDigits(e.target.value) })} />
            <input className="input" placeholder="یادداشت" value={ticket.note} onChange={(e) => setTicket({ ...ticket, note: e.target.value })} maxLength={300} />
          </div>
        )}

        {error && <p className="err" role="alert">{error}</p>}
        <div className={p.finish}>
          <button type="button" className={`${s.btn} ${p.finishBtn}`} disabled={busy || !ticket.lines.length} onClick={finish}>
            <Icon name="check" /> {busy ? "در حال ثبت…" : `ثبت فروش — ${faNum(total)} ${store.currency_label}`}
          </button>
          {ticket.lines.length > 0 && (
            <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={() => { setTicket(fresh()); setShort({}); setError(""); }}>
              فاکتور خالی
            </button>
          )}
        </div>
      </aside>

      {ticket.lines.length > 0 && (
        <button type="button" className={p.mobileBar} onClick={() => ticketRef.current?.scrollIntoView({ behavior: "smooth" })}>
          <span className="num">{faNum(pieces)} عدد</span>
          <b className="num">{faNum(total)} {store.currency_label}</b>
          <span>پرداخت <Icon name="chev" /></span>
        </button>
      )}

      {done && (
        <Modal
          title="فروش ثبت شد"
          onClose={nextSale}
          footer={
            <>
              <button type="button" className={s.btn} onClick={nextSale} autoFocus>فروش بعدی</button>
              <a href={`/panel/pos/sales/${done.sale.id}/print`} target="_blank" rel="noopener" className={`${s.btn} ${s.btnGhost}`}>چاپ فاکتور</a>
            </>
          }
        >
          <div className={p.doneBox}>
            <span className={p.doneIcon}><Icon name="check" /></span>
            <b className="num" dir="ltr">#{toFaDigits(done.sale.number)}</b>
            <span className="num">{faNum(done.sale.total)} {store.currency_label}</span>
            <small>{payText(done.sale)}</small>
            {done.change !== null && done.change > 0 && <small>باقی‌مانده برای پس دادن به مشتری: <b className="num">{faNum(done.change)}</b></small>}
          </div>
        </Modal>
      )}
    </div>
  );
}
