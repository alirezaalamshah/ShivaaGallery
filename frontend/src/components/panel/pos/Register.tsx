"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "@/components/auth/AuthProvider";
import { Icon } from "@/components/Icon";
import { useStore } from "@/components/StoreProvider";
import { useToast } from "@/components/Toast";
import { ApiError } from "@/lib/client";
import { faDate, faNum, signed, toEnDigits, toFaDigits } from "@/lib/format";

import { useCan } from "../access";
import { DateInput } from "../DateInput";
import { isoDay } from "../dates";
import { adminCall, refreshSite } from "../hooks";
import { MoneyInput, Modal } from "../ui";
import s from "../panel.module.css";
import p from "./pos.module.css";
import {
  type BackLine, KIND_LABEL, type Lookup, type PosProduct, type PosVariant, type Returnable, type Sale, saleKind, type TicketLine, UNKNOWN_STOCK,
} from "./types";

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
  /** Pieces the customer brought back from earlier tickets. */
  back: BackLine[];
  discount: number;
  discountMode: "amount" | "percent";
  discountInput: number | null;
  pay: Pay;
  split: { cash: number | null; card: number | null; transfer: number | null };
  received: number | null;
  customerName: string;
  customerPhone: string;
  /** The customer's birthday, written down once when the shop does not have it yet. */
  customerBirthday: string;
  /** Use the customer's birthday discount instead of a typed one. */
  birthday: boolean;
  note: string;
  key: string;
};

type Known = {
  name: string;
  purchases: number;
  last_purchase: string | null;
  active: boolean;
  birthday: string | null;
  birthday_offer: { percent: number; max: number | null; day: string; used: boolean } | null;
};

const EMPTY: Omit<Ticket, "key"> = {
  lines: [],
  back: [],
  discount: 0,
  discountMode: "amount",
  discountInput: null,
  pay: "cash",
  split: { cash: null, card: null, transfer: null },
  received: null,
  customerName: "",
  customerPhone: "",
  customerBirthday: "",
  birthday: false,
  note: "",
};

const fresh = (): Ticket => ({ ...EMPTY, key: newKey() });

/** "نقد ۲۰۰٬۰۰۰ · کارت‌خوان …"; money handed back reads "پس دادن نقد …". */
export const payText = (sale: Pick<Sale, "cash" | "card" | "transfer">) => {
  const part = (n: number, label: string) => n && (n < 0 ? `پس دادن ${label} ${faNum(-n)}` : `${label} ${faNum(n)}`);
  return [part(sale.cash, "نقد"), part(sale.card, "کارت‌خوان"), part(sale.transfer, "کارت به کارت")].filter(Boolean).join(" · ") || "بدون پرداخت";
};

const stockText = (n: number) => (n >= UNKNOWN_STOCK ? "؟" : n === 0 ? "تمام" : `${faNum(n)} عدد`);

/** What a product card shows at a glance: its price (or price range), any sale, and how many are left. */
function summary(product: PosProduct) {
  const live = product.variants.filter((v) => v.stock > 0);
  const prices = (live.length ? live : product.variants).map((v) => v.price);
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  const onSale = product.variants.some((v) => v.stock > 0 && v.price < v.regular_price);
  const regular = product.variants.find((v) => v.price === low && v.price < v.regular_price)?.regular_price ?? null;
  const counted = product.variants.filter((v) => v.stock < UNKNOWN_STOCK);
  const stock = counted.reduce((n, v) => n + v.stock, 0);
  return { low, high, onSale, regular, stock, unknown: counted.length < product.variants.length, samePrice: low === high };
}

/**
 * Ring up one in-store sale, return or exchange. The open ticket survives a page refresh, per person,
 * in this browser. `returning` opens on the return step: find the earlier ticket first.
 */
export function Register({ returning = false }: { returning?: boolean }) {
  const { me } = useAuth();
  const store = useStore();
  const toast = useToast();
  const storageKey = `pos:ticket:${me?.username ?? ""}`;
  const [ticket, setTicket] = useState<Ticket>(fresh);
  const [loaded, setLoaded] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PosProduct[]>([]);
  const [maxDiscount, setMaxDiscount] = useState<number | null>(null);
  const canReturn = useCan()("pos.return");
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [short, setShort] = useState<Record<number, number>>({});
  const [done, setDone] = useState<{ sale: Sale; change: number | null } | null>(null);
  const [showCustomer, setShowCustomer] = useState(false);
  const [picking, setPicking] = useState(false);
  const [known, setKnown] = useState<Known | null>(null);
  const [askClear, setAskClear] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const ticketRef = useRef<HTMLElement>(null);

  // Keep the open ticket across refreshes.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (saved && Array.isArray(saved.lines)) setTicket({ ...fresh(), ...saved, back: Array.isArray(saved.back) ? saved.back : [] });
    } catch {
      /* nothing saved, or storage blocked */
    }
    setLoaded(true);
  }, [storageKey]);
  useEffect(() => {
    if (loaded && returning) setPicking(true);
  }, [loaded, returning]);
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

  // Recognise a returning customer as soon as their mobile is typed. The name the till filled in
  // follows the number; a name the seller typed is left alone.
  const phone = toEnDigits(ticket.customerPhone);
  const filledName = useRef("");
  useEffect(() => {
    const fill = (name: string) => {
      const before = filledName.current;
      filledName.current = name;
      // A new number starts without the last customer's birthday discount or birthday.
      setTicket((t) => ({ ...(t.customerName && t.customerName !== before ? t : { ...t, customerName: name }), birthday: false, customerBirthday: "" }));
    };
    if (!/^09\d{9}$/.test(phone)) {
      setKnown(null);
      fill("");
      return;
    }
    let live = true;
    adminCall<Known & { found: boolean }>(`/pos/customer?phone=${phone}`)
      .then((c) => {
        if (!live) return;
        setKnown(c.found ? c : null);
        fill(c.found ? c.name : "");
      })
      .catch(() => live && setKnown(null));
    return () => {
      live = false;
    };
  }, [phone]);

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
  const backPieces = ticket.back.reduce((n, l) => n + l.qty, 0);
  const returned = ticket.back.reduce((n, l) => n + l.unit * l.qty, 0);
  const offer = known?.birthday_offer && !known.birthday_offer.used ? known.birthday_offer : null;
  const birthday = ticket.birthday && !!offer;
  const discount = birthday
    ? Math.min(Math.floor((subtotal * offer!.percent) / 100), offer!.max ?? Infinity)
    : Math.min(
        subtotal,
        ticket.discountMode === "percent" ? Math.round((subtotal * Math.min(100, ticket.discountInput ?? 0)) / 100) : ticket.discountInput ?? 0,
      );
  const total = subtotal - discount - returned;
  const refund = total < 0;
  // Money handed back goes out one way only; "several ways" is for taking money in.
  const pay: Pay = refund && ticket.pay === "split" ? "cash" : ticket.pay;
  const overLimit = !birthday && maxDiscount !== null && discount * 100 > subtotal * maxDiscount;
  const payments =
    pay === "split"
      ? { cash: ticket.split.cash ?? 0, card: ticket.split.card ?? 0, transfer: ticket.split.transfer ?? 0 }
      : { cash: 0, card: 0, transfer: 0, [pay]: total };
  const paid = payments.cash + payments.card + payments.transfer;
  const change = pay === "cash" && !refund && ticket.received ? ticket.received - total : null;
  const empty = !ticket.lines.length && !ticket.back.length;
  const kind = saleKind(ticket.lines.length, ticket.back.length);

  const problems = [
    empty && "کالایی در فاکتور نیست.",
    known && !known.active && "این مشتری غیرفعال شده است و به او فروخته نمی‌شود.",
    overLimit && `تخفیف شما حداکثر ${faNum(maxDiscount!)}٪ است.`,
    pay === "split" && paid !== total && `جمع پرداخت‌ها ${faNum(paid)} است؛ باید ${faNum(total)} باشد.`,
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
          returns: ticket.back.map((l) => ({ item: l.item, qty: l.qty })),
          discount: birthday ? 0 : discount,
          birthday_discount: birthday,
          ...payments,
          customer_name: ticket.customerName,
          customer_phone: toEnDigits(ticket.customerPhone),
          customer_birthday: ticket.customerBirthday || null,
          note: ticket.note,
          client_key: ticket.key,
        },
      });
      setDone({ sale, change });
      setTicket(fresh());
      setShort({});
      setShowCustomer(false);
      setKnown(null);
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

  const addBack = (sale: Returnable, picked: Record<number, number>) => {
    setError("");
    setTicket((t) => {
      let back = [...t.back];
      for (const item of sale.items) {
        const qty = picked[item.id] ?? 0;
        if (!qty) continue;
        const line: BackLine = {
          item: item.id, fromSale: sale.number, product: item.product_name, color: item.color_name, size: item.size_label,
          unit: item.paid_unit, qty, max: item.returnable,
        };
        back = back.some((b) => b.item === item.id) ? back.map((b) => (b.item === item.id ? line : b)) : [...back, line];
      }
      return {
        ...t, back,
        customerPhone: t.customerPhone || sale.customer_phone,
        customerName: t.customerName || sale.customer_name,
        note: t.note || `مرجوعی/تعویض فاکتور ${sale.number}`,
      };
    });
    setPicking(false);
  };

  const setBackQty = (item: number, qty: number) =>
    setTicket((t) => ({ ...t, back: qty <= 0 ? t.back.filter((b) => b.item !== item) : t.back.map((b) => (b.item === item ? { ...b, qty: Math.min(qty, b.max) } : b)) }));

  useEffect(() => {
    if (!askClear) return;
    const t = setTimeout(() => setAskClear(false), 3000);
    return () => clearTimeout(t);
  }, [askClear]);

  const clearTicket = () => {
    if (!askClear) {
      setAskClear(true);
      return;
    }
    setAskClear(false);
    setTicket(fresh());
    setShort({});
    setError("");
    setKnown(null);
  };

  const nextSale = () => {
    setDone(null);
    if (returning) setPicking(true);
    else searchRef.current?.focus();
  };
  const doneKind = done ? saleKind(done.sale.items?.length ?? 0, done.sale.returns?.length ?? (done.sale.returned_total ? 1 : 0)) : "sale";

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
            const sum = summary(product);
            return (
              <article key={product.id} className={p.product}>
                <header>
                  {product.image ? (
                    // eslint-disable-next-line @next/next/no-img-element -- small thumbnail
                    <img src={product.image} alt="" />
                  ) : (
                    <span className={p.noImg} />
                  )}
                  <span className={p.productHead}>
                    <b>{product.name}</b>
                    <span className={`${p.price} ${sum.onSale ? p.priceSale : ""}`}>
                      <b className="num">{sum.samePrice ? faNum(sum.low) : `${faNum(sum.low)} تا ${faNum(sum.high)}`}</b>
                      <small>{store.currency_label}</small>
                      {sum.samePrice && sum.regular && <s className="num">{faNum(sum.regular)}</s>}
                    </span>
                    <small className={p.productMeta}>
                      {sum.unknown && !sum.stock ? "موجودی نامشخص" : `موجودی ${faNum(sum.stock)} عدد`} · {faNum(colors.length)} رنگ
                      {!product.active && " · در سایت نمایش داده نمی‌شود"}
                    </small>
                  </span>
                  {sum.onSale && <span className={p.saleTag}>تخفیف</span>}
                </header>
                {colors.map(([color, hex]) => (
                  <div key={color} className={p.colorRow}>
                    <span className={p.colorName}><i style={{ background: hex }} />{color}</span>
                    <span className={p.sizes}>
                      {product.variants.filter((v) => v.color === color).map((v) => {
                        const inTicket = ticket.lines.find((l) => l.variant === v.id)?.qty ?? 0;
                        const sale = v.price < v.regular_price;
                        return (
                          <button
                            key={v.id}
                            type="button"
                            className={`${p.size} ${inTicket ? p.sizeIn : ""} ${v.stock > 0 && v.stock <= 2 ? p.sizeLow : ""}`}
                            disabled={v.stock === 0}
                            onClick={() => add(product, v)}
                            title={`${faNum(v.price)} ${store.currency_label}${sale ? ` (قیمت اصلی ${faNum(v.regular_price)})` : ""}`}
                            aria-label={`${product.name} ${color} سایز ${v.size}، ${faNum(v.price)} ${store.currency_label}${sale ? "، تخفیف‌دار" : ""}، موجودی ${stockText(v.stock)}`}
                          >
                            <b className="num">{v.size}</b>
                            {/* One price for the whole product sits in the header; a size that differs shows its own. */}
                            {(!sum.samePrice || sale) && <span className={`${p.sizePrice} ${sale ? p.priceSale : ""} num`}>{faNum(v.price)}</span>}
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
        <h2>
          {kind === "sale" ? "فاکتور فروش" : `فاکتور ${KIND_LABEL[kind]}`} <small className="num">{pieces ? `${faNum(pieces)} عدد` : ""}</small>
          {returning && (
            <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm} ${p.backBtn}`} onClick={() => setPicking(true)}>
              <Icon name="ret" /> {ticket.back.length ? "کالای پس‌آورده‌ی دیگر" : "مرجوعی یا تعویض"}
            </button>
          )}
          {!empty && (
            <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm} ${p.clearBtn} ${askClear ? p.clearAsk : ""}`} onClick={clearTicket}>
              <Icon name="trash" /> {askClear ? "خالی شود؟" : "خالی کردن"}
            </button>
          )}
        </h2>
        {kind !== "sale" && (
          <ol className={p.exchangeSteps}>
            <li className={p.stepDone}>کالای پس‌آورده انتخاب شد ({faNum(backPieces)} عدد)</li>
            <li className={kind === "exchange" ? p.stepDone : undefined}>
              {kind === "exchange"
                ? `کالای جایگزین اضافه شد (${faNum(pieces)} عدد)`
                : "تعویض است؟ کالای جایگزین را از فهرست کالاها اضافه کنید. فقط پس می‌دهد؟ همین‌طور ثبت کنید."}
            </li>
            <li>
              {refund
                ? `${faNum(-total)} ${store.currency_label} به مشتری پس بدهید و ثبت کنید.`
                : total > 0
                  ? `مابه‌التفاوت ${faNum(total)} ${store.currency_label} را بگیرید و ثبت کنید.`
                  : "پولی رد و بدل نمی‌شود؛ ثبت کنید."}
            </li>
          </ol>
        )}
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
          !ticket.back.length && (
            <p className={p.emptyTicket}>
              <Icon name="bag" />
              کالا را از فهرست انتخاب کنید یا کد آن را اسکن کنید.
              {canReturn && (
                <small>
                  {returning
                    ? "برای پس گرفتن یا عوض کردن کالای فروخته‌شده، «مرجوعی یا تعویض» را بزنید."
                    : "برای پس گرفتن یا عوض کردن کالای فروخته‌شده، تب «مرجوعی و تعویض» را باز کنید."}
                </small>
              )}
            </p>
          )
        )}

        {ticket.back.length > 0 && (
          <>
            <h3 className={p.backHead}>مشتری پس می‌دهد <small className="num">{faNum(backPieces)} عدد</small></h3>
            <ul className={`${p.lines} ${p.backLines}`}>
              {ticket.back.map((l) => (
                <li key={l.item}>
                  <span className={p.lineWhat}>
                    <b>{l.product}</b>
                    <small>{l.color}، سایز <span className="num">{l.size}</span> · فاکتور <span className="num" dir="ltr">{toFaDigits(l.fromSale)}</span></small>
                  </span>
                  <span className={p.qty}>
                    <button type="button" aria-label="یکی کمتر" onClick={() => setBackQty(l.item, l.qty - 1)}><Icon name={l.qty === 1 ? "trash" : "minus"} /></button>
                    <b className="num">{faNum(l.qty)}</b>
                    <button type="button" aria-label="یکی بیشتر" disabled={l.qty >= l.max} onClick={() => setBackQty(l.item, l.qty + 1)}><Icon name="plus" /></button>
                  </span>
                  <span className={`${p.linePrice} num`}>{signed("−", l.unit * l.qty)}</span>
                </li>
              ))}
            </ul>
          </>
        )}

        <div className={p.sums}>
          <div><span>{kind === "sale" ? "جمع کالاها" : "جمع کالاهای جایگزین"}</span><b className="num">{faNum(subtotal)}</b></div>
          {/* A limit of zero means this seller may not give a discount. */}
          {maxDiscount !== 0 && !birthday && (
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
          )}
          {discount > 0 && <div className={p.minor}><span>{birthday ? `تخفیف تولد (${faNum(offer!.percent)}٪)` : "مبلغ تخفیف"}</span><span className="num">{signed("−", discount)}</span></div>}
          {!!maxDiscount && !birthday && <div className={`${p.minor} ${overLimit ? p.warn : ""}`}><span>سقف تخفیف شما</span><span className="num">{faNum(maxDiscount)}٪</span></div>}
          {returned > 0 && <div className={p.minor}><span>کالاهای پس‌گرفته</span><span className="num">{signed("−", returned)}</span></div>}
          <div className={`${p.total} ${refund ? p.refund : ""}`}>
            <span>{refund ? "پرداخت به مشتری" : kind === "sale" ? "مبلغ قابل پرداخت" : "مابه‌التفاوت قابل دریافت"}</span>
            <b className="num">{faNum(Math.abs(total))} <small>{store.currency_label}</small></b>
          </div>
        </div>

        {total !== 0 && (
          <div className={p.payTabs} role="radiogroup" aria-label={refund ? "روش پس دادن پول" : "روش پرداخت"}>
            {PAY.filter((m) => !refund || m.value !== "split").map((m) => (
              <button key={m.value} type="button" role="radio" aria-checked={pay === m.value} onClick={() => setTicket({ ...ticket, pay: m.value })}>
                {m.label}
              </button>
            ))}
          </div>
        )}
        {total === 0 && !empty && <p className={p.minor}>{kind === "exchange" ? "تعویض هم‌قیمت است؛ " : ""}پولی رد و بدل نمی‌شود.</p>}

        {pay === "cash" && !refund && total > 0 && (
          <label className={p.payField}>
            <span>مبلغ دریافتی از مشتری</span>
            <MoneyInput id="pos-received" value={ticket.received} onChange={(v) => setTicket({ ...ticket, received: v })} placeholder="اختیاری" />
            {change !== null && change >= 0 && <span className={p.change}>باقی‌مانده برای پس دادن: <b className="num">{faNum(change)}</b></span>}
          </label>
        )}
        {pay === "split" && (
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

        <div className={p.customer}>
          <span className={p.customerHead}>مشتری <small>موبایل را بنویسید تا این خرید در پرونده‌ی مشتری بیاید</small></span>
          <div className={p.customerRow}>
            <input className="input ltr num" inputMode="tel" aria-label="موبایل مشتری" placeholder="موبایل ۰۹…" value={toFaDigits(ticket.customerPhone)} onChange={(e) => setTicket({ ...ticket, customerPhone: toEnDigits(e.target.value) })} />
            <input className="input" aria-label="نام مشتری" placeholder="نام (اختیاری)" value={ticket.customerName} onChange={(e) => setTicket({ ...ticket, customerName: e.target.value })} maxLength={80} />
          </div>
          {known && !known.active && (
            <p className={p.blocked} role="alert">این مشتری غیرفعال شده است و به او فروخته نمی‌شود.</p>
          )}
          {known?.birthday_offer && known.active && (
            <div className={p.birthday}>
              <span>
                🎂 <b>هفته‌ی تولد مشتری</b>
                <small>تولد: {faDate(`${known.birthday_offer.day}T12:00:00`)}{known.birthday_offer.used ? " · تخفیف تولد امسال استفاده شده" : ""}</small>
              </span>
              {!known.birthday_offer.used && (
                <button type="button" className={`${s.btn} ${s.btnSm} ${ticket.birthday ? "" : s.btnGhost}`} aria-pressed={ticket.birthday} onClick={() => setTicket({ ...ticket, birthday: !ticket.birthday })}>
                  {ticket.birthday ? "تخفیف تولد اعمال شد" : `اعمال تخفیف تولد (${faNum(known.birthday_offer.percent)}٪)`}
                </button>
              )}
            </div>
          )}
          {/^09\d{9}$/.test(phone) && !known?.birthday && (
            <label className={p.birthdayField}>
              <span>تاریخ تولد <small>اختیاری، فقط یک بار ثبت می‌شود</small></span>
              <DateInput value={ticket.customerBirthday} max={isoDay(new Date())} clearable placeholder="روز تولد مشتری" onChange={(v) => setTicket({ ...ticket, customerBirthday: v })} />
            </label>
          )}
          {known && (
            <small className={p.known}>
              <Icon name="check" /> مشتری آشنا{known.name ? `: ${known.name}` : ""} · {faNum(known.purchases)} خرید قبلی{known.last_purchase ? `، آخرین در ${faDate(known.last_purchase)}` : ""}
            </small>
          )}
        </div>

        <button type="button" className={p.more} aria-expanded={showCustomer || !!ticket.note} onClick={() => setShowCustomer(!showCustomer)}>
          یادداشت (اختیاری) <Icon name="chev" />
        </button>
        {(showCustomer || !!ticket.note) && (
          <input className="input" placeholder="یادداشت" value={ticket.note} onChange={(e) => setTicket({ ...ticket, note: e.target.value })} maxLength={300} />
        )}

        {error && <p className="err" role="alert">{error}</p>}
        <div className={p.finish}>
          <button type="button" className={`${s.btn} ${p.finishBtn}`} disabled={busy || empty} onClick={finish}>
            <Icon name="check" />{" "}
            {busy
              ? "در حال ثبت…"
              : kind === "sale"
                ? `ثبت فروش — ${faNum(total)} ${store.currency_label}`
                : refund
                  ? `ثبت ${KIND_LABEL[kind]} و پس دادن ${faNum(-total)} ${store.currency_label}`
                  : total
                    ? `ثبت ${KIND_LABEL[kind]} — دریافت ${faNum(total)} ${store.currency_label}`
                    : `ثبت ${KIND_LABEL[kind]}`}
          </button>
        </div>
      </aside>

      {!empty && (
        <div className={p.mobileBar}>
          <button type="button" className={`${p.mobileClear} ${askClear ? p.mobileClearAsk : ""}`} aria-label="خالی کردن فاکتور" onClick={clearTicket}>
            {askClear ? "خالی شود؟" : <Icon name="trash" />}
          </button>
          <button type="button" className={p.mobileGo} onClick={() => ticketRef.current?.scrollIntoView({ behavior: "smooth" })}>
            <span className="num">{faNum(pieces)} عدد{backPieces ? ` · ${faNum(backPieces)} پس‌گرفته` : ""}</span>
            <b className="num">{refund ? "پس دادن " : ""}{faNum(Math.abs(total))} {store.currency_label}</b>
            <span>پرداخت <Icon name="chev" /></span>
          </button>
        </div>
      )}

      {done && (
        <Modal
          title={`${KIND_LABEL[doneKind]} ثبت شد`}
          onClose={nextSale}
          footer={
            <>
              <button type="button" className={s.btn} onClick={nextSale} autoFocus>{returning ? "مرجوعی یا تعویض بعدی" : "فروش بعدی"}</button>
              <a href={`/panel/pos/sales/${done.sale.id}/print`} target="_blank" rel="noopener" className={`${s.btn} ${s.btnGhost}`}>چاپ فاکتور</a>
            </>
          }
        >
          <div className={p.doneBox}>
            <span className={p.doneIcon}><Icon name="check" /></span>
            <b className="num" dir="ltr">#{toFaDigits(done.sale.number)}</b>
            <span className="num">{done.sale.total < 0 ? `به مشتری پس بدهید: ${faNum(-done.sale.total)}` : faNum(done.sale.total)} {store.currency_label}</span>
            <small>{payText(done.sale)}</small>
            {done.change !== null && done.change > 0 && <small>باقی‌مانده برای پس دادن به مشتری: <b className="num">{faNum(done.change)}</b></small>}
          </div>
        </Modal>
      )}

      {picking && <ReturnPicker onClose={() => setPicking(false)} onPick={addBack} taken={ticket.back} />}
    </div>
  );
}

/** Find an earlier ticket by its number or the customer's mobile, and choose the pieces coming back. */
function ReturnPicker({ onClose, onPick, taken }: { onClose: () => void; onPick: (sale: Returnable, picked: Record<number, number>) => void; taken: BackLine[] }) {
  const store = useStore();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Returnable[] | null>(null);
  const [picked, setPicked] = useState<Record<number, number>>(() => Object.fromEntries(taken.map((b) => [b.item, b.qty])));

  useEffect(() => {
    const term = toEnDigits(q.trim());
    if (term.length < 4) {
      setRows(null);
      return;
    }
    let live = true;
    const t = setTimeout(() => {
      adminCall<Returnable[]>(`/pos/returnable?q=${encodeURIComponent(term)}`).then((r) => live && setRows(r)).catch(() => live && setRows([]));
    }, 300);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q]);

  return (
    <Modal title="مرجوعی یا تعویض" onClose={onClose} wide>
      <ol className={p.pickerSteps}>
        <li><b>فاکتور خرید را پیدا کنید:</b> شماره‌ی فاکتور یا موبایل مشتری را بنویسید.</li>
        <li><b>تعداد کالای پس‌آورده را بزنید</b> و «افزودن به فاکتور» را انتخاب کنید.</li>
        <li><b>تعویض است؟</b> کالای جایگزین را از فهرست کالاها به همان فاکتور اضافه کنید؛ مابه‌التفاوت خودکار حساب می‌شود.</li>
      </ol>
      <input className="input ltr num" placeholder="مثلاً S123456 یا ۰۹۱۲…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      {rows && !rows.length && <p className="muted">فاکتوری پیدا نشد.</p>}
      <div className={p.returnList}>
        {rows?.map((sale) => {
          const chosen = sale.items.some((i) => picked[i.id]);
          return (
            <article key={sale.id} className={p.returnSale}>
              <header>
                <b className="num" dir="ltr">#{toFaDigits(sale.number)}</b>
                <span>{faDate(sale.created_at)} · {sale.seller}</span>
                {(sale.customer_name || sale.customer_phone) && <span>{sale.customer_name} <span className="num" dir="ltr">{toFaDigits(sale.customer_phone)}</span></span>}
              </header>
              {sale.problem && <p className="err">{sale.problem}</p>}
              <ul className={p.lines}>
                {sale.items.map((i) => {
                  const n = picked[i.id] ?? 0;
                  return (
                    <li key={i.id} className={!i.returnable ? p.voided : undefined}>
                      <span className={p.lineWhat}>
                        <b>{i.product_name}</b>
                        <small>
                          {i.color_name}، سایز <span className="num">{i.size_label}</span> · هر عدد {faNum(i.paid_unit)} {store.currency_label}
                          {i.returnable < i.qty && ` · ${faNum(i.qty - i.returnable)} عدد قبلاً پس گرفته شده`}
                        </small>
                      </span>
                      {i.returnable > 0 && !sale.problem ? (
                        <span className={p.qty}>
                          <button type="button" aria-label="یکی کمتر" disabled={!n} onClick={() => setPicked({ ...picked, [i.id]: n - 1 })}><Icon name="minus" /></button>
                          <b className="num">{faNum(n)}</b>
                          <button type="button" aria-label="یکی بیشتر" disabled={n >= i.returnable} onClick={() => setPicked({ ...picked, [i.id]: n + 1 })}><Icon name="plus" /></button>
                        </span>
                      ) : (
                        <small className="muted">{i.returnable ? "" : "همه پس گرفته شده"}</small>
                      )}
                    </li>
                  );
                })}
              </ul>
              <button type="button" className={s.btn} disabled={!chosen || !!sale.problem} onClick={() => onPick(sale, picked)}>
                افزودن به فاکتور
              </button>
            </article>
          );
        })}
      </div>
    </Modal>
  );
}
