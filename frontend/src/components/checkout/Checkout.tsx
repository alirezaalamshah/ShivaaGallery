"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "@/components/auth/AuthProvider";
import { PhoneLogin } from "@/components/auth/PhoneLogin";
import { useCart } from "@/components/cart/CartProvider";
import { Icon } from "@/components/Icon";
import { ProductMedia } from "@/components/ProductMedia";
import { useStore } from "@/components/StoreProvider";
import { navStart } from "@/components/NavProgress";
import { ApiError, call, fieldErrors } from "@/lib/client";
import { faNum, latinCode, signed, toEnDigits, toFaDigits } from "@/lib/format";
import { PROVINCE_NAMES, PROVINCES, provinceOf } from "@/lib/iran";
import type { Address, Order, Quote, ShippingMethod } from "@/lib/types";

import styles from "./Checkout.module.css";

type Form = { receiver_name: string; receiver_phone: string; province: string; city: string; address: string; postal_code: string; note: string };

const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

export function Checkout() {
  const store = useStore();
  const cart = useCart();
  const { me } = useAuth();
  const router = useRouter();
  const signedIn = me?.role === "customer";

  const [methods, setMethods] = useState<ShippingMethod[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addressId, setAddressId] = useState<number | "new">("new");
  const [form, setForm] = useState<Form>({ receiver_name: "", receiver_phone: "", province: provinceOf(store.city), city: store.city || "", address: "", postal_code: "", note: "" });
  const [customCity, setCustomCity] = useState(false);
  const [shipping, setShipping] = useState<number | null>(null);
  const [codeInput, setCodeInput] = useState("");
  const [code, setCode] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState("");
  const [placing, setPlacing] = useState(false);
  const [sumOpen, setSumOpen] = useState(false);
  const refs = { login: useRef<HTMLElement>(null), address: useRef<HTMLElement>(null), shipping: useRef<HTMLElement>(null) };
  // One key per checkout visit: a retried request gets back the same order instead of placing a second one.
  const clientKey = useRef(newKey());

  const lines = useMemo(() => cart.lines.map((l) => ({ variant: l.variantId, qty: l.qty })), [cart.lines]);
  const chosen = addressId === "new" ? form : addresses.find((a) => a.id === addressId) ?? form;
  const city = chosen.city.trim();
  const method = methods.find((m) => m.id === shipping);
  const needsPostal = !!method?.needs_postal_code;

  useEffect(() => {
    call<ShippingMethod[]>("/shipping-methods").then(setMethods).catch(() => setBanner("روش‌های ارسال دریافت نشد. صفحه را دوباره باز کن."));
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    call<Address[]>("/addresses").then((list) => {
      setAddresses(list);
      if (list.length) setAddressId(list[0].id);
    }).catch(() => {});
  }, [signedIn]);

  // Pick the first method that serves the chosen city, and drop one that no longer does.
  useEffect(() => {
    const ok = (m: ShippingMethod) => !m.only_city || m.only_city === city;
    const current = methods.find((m) => m.id === shipping);
    if (!current || !ok(current)) setShipping(methods.find(ok)?.id ?? null);
  }, [methods, city, shipping]);

  const refreshQuote = useCallback(async () => {
    if (!lines.length) return;
    try {
      const q = await call<Quote>("/checkout/quote", { method: "POST", body: { lines, city, shipping_method: shipping, discount_code: code } });
      setQuote(q);
      // The cart changed and the code no longer applies: say so instead of quietly dropping the discount.
      if (code && q.discount_error) {
        setCode("");
        setErrors((er) => ({ ...er, discount_code: `کد ${code} حذف شد: ${q.discount_error}` }));
      }
    } catch {
      /* the summary keeps the last good numbers */
    }
  }, [lines, city, shipping, code]);

  useEffect(() => {
    const t = setTimeout(refreshQuote, 200);
    return () => clearTimeout(t);
  }, [refreshQuote]);

  const unavailable = cart.lines.filter((l) => cart.check[l.variantId] && !cart.check[l.variantId].ok);
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const digits = (n: number) => toEnDigits(e.target.value).replace(/\D/g, "").slice(0, n);
    setForm({ ...form, [k]: k === "postal_code" ? digits(10) : k === "receiver_phone" ? digits(11) : e.target.value });
    setErrors((er) => ({ ...er, [k]: "" }));
  };

  const applyCode = async () => {
    const c = codeInput.trim().toUpperCase();
    if (!c) return;
    const q = await call<Quote>("/checkout/quote", { method: "POST", body: { lines, city, shipping_method: shipping, discount_code: c } }).catch(() => null);
    if (q?.discount_error) setErrors((er) => ({ ...er, discount_code: q.discount_error! }));
    else if (q) {
      setCode(c);
      setQuote(q);
    }
  };

  const focus = (ref: React.RefObject<HTMLElement | null>) => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    ref.current?.classList.remove("shake");
    void ref.current?.offsetWidth;
    ref.current?.classList.add("shake");
  };

  const place = async () => {
    setBanner("");
    if (!signedIn) return focus(refs.login);
    if (unavailable.length) return setBanner("اول موجودی سبد را اصلاح کن.");
    if (!shipping) return focus(refs.shipping);
    const errs: Record<string, string> = {};
    const receiverPhone = chosen.receiver_phone ?? "";
    if (chosen.receiver_name.trim().length < 3) errs.receiver_name = "نام تحویل‌گیرنده را کامل بنویس.";
    if (receiverPhone && !/^09\d{9}$/.test(receiverPhone)) errs.receiver_phone = "شماره موبایل باید ۱۱ رقم باشد و با ۰۹ شروع شود.";
    if (addressId === "new" && !form.province) errs.province = "استان را انتخاب کن.";
    if (!city) errs.city = "شهر را انتخاب کن.";
    if (chosen.address.trim().length < 10) errs.address = "آدرس را کامل‌تر بنویس (خیابان، کوچه، پلاک).";
    if (needsPostal && !chosen.postal_code) errs.postal_code = `برای ارسال با ${method?.name} کد پستی لازم است.`;
    else if (chosen.postal_code && chosen.postal_code.length !== 10) errs.postal_code = "کد پستی باید ۱۰ رقم باشد.";
    if (Object.keys(errs).length) {
      setErrors(errs);
      // A saved address is missing something: open it in the form, already filled in, so only the gap needs typing.
      if (addressId !== "new") {
        const province = chosen.province || provinceOf(chosen.city);
        setForm({ ...form, ...chosen, receiver_phone: receiverPhone, note: form.note, province });
        setCustomCity(!!chosen.city && !(PROVINCES[province] ?? []).includes(chosen.city));
        setAddressId("new");
      }
      return focus(refs.address);
    }
    setPlacing(true);
    try {
      const order = await call<Order>("/orders", {
        method: "POST",
        body: {
          lines, ...chosen, receiver_phone: receiverPhone, note: form.note, shipping_method: shipping,
          discount_code: code, save_address: addressId === "new", client_key: clientKey.current,
        },
      });
      cart.clear();
      if (store.online_payment) {
        try {
          const { redirect } = await call<{ redirect: string }>("/payments/start", { method: "POST", body: { number: order.number } });
          window.location.assign(redirect);
          return;
        } catch {
          /* the order page offers the payment button again */
        }
      }
      navStart();
      router.push(`/account/orders/${order.number}?new=1`);
    } catch (e) {
      setErrors(fieldErrors(e));
      setBanner(e instanceof Error ? e.message : "ثبت سفارش ممکن نشد.");
      if (e instanceof ApiError && e.status === 409) refreshQuote();
      setPlacing(false);
    }
  };

  if (!cart.ready) return <div className={styles.page} aria-busy="true" />;
  if (!cart.lines.length) {
    return (
      <div className={`${styles.page} ${styles.empty}`}>
        <h1 className="page-title">سبد خرید خالی است</h1>
        <Link href="/shop" className="btn btn-ink">دیدن محصولات</Link>
      </div>
    );
  }

  const total = quote?.total ?? cart.subtotal;
  // What counts toward free shipping: the goods after any discount.
  const goods = quote ? quote.subtotal - quote.discount : cart.subtotal;

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <Link href="/cart" className="icon-btn" aria-label="بازگشت به سبد">
          <Icon name="back" />
        </Link>
        <h1>تسویه‌حساب</h1>
        <span className={styles.secure}>
          <Icon name="lock" /> اتصال امن
        </span>
      </header>

      {banner && <div className={styles.banner} role="alert">{banner}</div>}
      {unavailable.length > 0 && (
        <div className={styles.banner} role="alert">
          موجودی این کالاها کمتر از سبد شماست: {unavailable.map((l) => `${l.name} (${l.colorName}، سایز ${l.size})`).join("، ")}.{" "}
          <button type="button" className={styles.link} onClick={cart.fix}>اصلاح خودکار سبد</button>
        </div>
      )}

      <section ref={refs.login} className={`${styles.sec} ${signedIn ? styles.done : ""}`}>
        <h2><span className={styles.n}>{signedIn ? <Icon name="check" /> : "۱"}</span>ورود با کد پیامکی</h2>
        {signedIn ? (
          <p className={styles.verified}>
            <Icon name="check" /> وارد شدی با <b className="num" dir="ltr">{toFaDigits(me?.phone ?? "")}</b>
          </p>
        ) : me?.authenticated ? (
          <p className="err">با حساب مدیر یا فروشنده نمی‌شود خرید کرد. از پنل خارج شو و با شماره موبایل وارد شو.</p>
        ) : (
          <PhoneLogin compact />
        )}
      </section>

      <section ref={refs.address} className={styles.sec}>
        <h2><span className={styles.n}>{"۲"}</span>آدرس تحویل</h2>
        {addresses.length > 0 && (
          <div className={styles.opts} role="radiogroup" aria-label="آدرس‌های قبلی">
            {addresses.map((a) => (
              <label key={a.id} className={styles.opt}>
                <input type="radio" name="address" checked={addressId === a.id} onChange={() => setAddressId(a.id)} />
                <span className={styles.dot} />
                <span>
                  <b>{a.receiver_name} · {a.province ? `${a.province}، ` : ""}{a.city}</b>
                  <small>{a.address}</small>
                </span>
              </label>
            ))}
            <label className={styles.opt}>
              <input type="radio" name="address" checked={addressId === "new"} onChange={() => setAddressId("new")} />
              <span className={styles.dot} />
              <span><b>آدرس جدید</b></span>
            </label>
          </div>
        )}
        {addressId === "new" && (
          <div className={styles.fields}>
            <label className="field">
              <span className="label">نام تحویل‌گیرنده</span>
              <input id="co-name" className="input" autoComplete="name" value={form.receiver_name} onChange={set("receiver_name")} aria-invalid={!!errors.receiver_name} placeholder="مثلاً مریم احمدی" />
              {errors.receiver_name && <span className="err">{errors.receiver_name}</span>}
            </label>
            <label className="field">
              <span className="label">موبایل تحویل‌گیرنده (اختیاری)</span>
              <input id="co-rphone" className="input ltr num" inputMode="tel" autoComplete="tel" value={toFaDigits(form.receiver_phone)} onChange={set("receiver_phone")} aria-invalid={!!errors.receiver_phone} placeholder={me?.phone ? toFaDigits(me.phone) : "۰۹۱۲ ۰۰۰ ۰۰۰۰"} />
              {errors.receiver_phone ? <span className="err">{errors.receiver_phone}</span> : <span className="hint">اگر سفارش برای کس دیگری است، شماره‌ی او را بنویس تا مأمور ارسال با او تماس بگیرد.</span>}
            </label>
            <div className="row2">
              <label className="field">
                <span className="label">استان</span>
                <select
                  id="co-province"
                  className="input"
                  value={form.province}
                  aria-invalid={!!errors.province}
                  onChange={(e) => {
                    setForm({ ...form, province: e.target.value, city: "" });
                    setCustomCity(false);
                    setErrors((er) => ({ ...er, province: "", city: "" }));
                  }}
                >
                  <option value="">انتخاب استان</option>
                  {PROVINCE_NAMES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
                {errors.province && <span className="err">{errors.province}</span>}
              </label>
              <label className="field">
                <span className="label">شهر</span>
                <select
                  id="co-city"
                  className="input"
                  disabled={!form.province}
                  value={customCity ? "__other" : form.city}
                  aria-invalid={!!errors.city}
                  onChange={(e) => {
                    const other = e.target.value === "__other";
                    setCustomCity(other);
                    setForm({ ...form, city: other ? "" : e.target.value });
                    setErrors((er) => ({ ...er, city: "" }));
                  }}
                >
                  <option value="">{form.province ? "انتخاب شهر" : "اول استان را انتخاب کن"}</option>
                  {(PROVINCES[form.province] ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
                  {form.province && <option value="__other">شهر دیگر…</option>}
                </select>
                {errors.city && !customCity && <span className="err">{errors.city}</span>}
              </label>
            </div>
            {customCity && (
              <label className="field">
                <span className="label">نام شهر</span>
                <input id="co-city-other" className="input" value={form.city} onChange={set("city")} aria-invalid={!!errors.city} autoFocus />
                {errors.city && <span className="err">{errors.city}</span>}
              </label>
            )}
            <label className="field">
              <span className="label">آدرس کامل</span>
              <textarea id="co-address" className="input" autoComplete="street-address" value={form.address} onChange={set("address")} aria-invalid={!!errors.address} placeholder="خیابان، کوچه، پلاک، واحد" />
              {errors.address && <span className="err">{errors.address}</span>}
            </label>
            <div className="row2">
              <label className="field">
                <span className="label">کد پستی{needsPostal ? "" : " (اختیاری)"}</span>
                <input id="co-postal" className="input ltr num" inputMode="numeric" value={toFaDigits(form.postal_code)} onChange={set("postal_code")} aria-invalid={!!errors.postal_code} placeholder="۱۰ رقم" />
                {errors.postal_code && <span className="err">{errors.postal_code}</span>}
              </label>
            </div>
          </div>
        )}
        {addressId !== "new" && errors.postal_code && <p className="err">{errors.postal_code}</p>}
        <label className="field" style={{ marginTop: 12 }}>
          <span className="label">یادداشت برای فروشگاه (اختیاری)</span>
          <input id="co-note" className="input" value={form.note} onChange={set("note")} maxLength={300} placeholder="مثلاً ساعت مناسب تحویل" />
        </label>
      </section>

      <section ref={refs.shipping} className={`${styles.sec} ${shipping ? styles.done : ""}`}>
        <h2><span className={styles.n}>{shipping ? <Icon name="check" /> : "۳"}</span>روش ارسال</h2>
        <div className={styles.opts} role="radiogroup" aria-label="روش ارسال">
          {methods.map((m) => {
            const off = !!m.only_city && m.only_city !== city;
            const free = m.free_from !== null && goods >= m.free_from;
            const left = m.free_from !== null && !free ? m.free_from - goods : 0;
            return (
              <label key={m.id} className={`${styles.opt} ${off ? styles.off : ""}`}>
                <input type="radio" name="shipping" disabled={off} checked={shipping === m.id} onChange={() => setShipping(m.id)} />
                <span className={styles.dot} />
                <span>
                  <b>{m.name}</b>
                  <small>{off ? `فقط برای ${m.only_city}` : m.description}</small>
                  {!off && left > 0 && (
                    <small className={styles.freeHint}>با <span className="num">{faNum(left)}</span> {store.currency_label} خرید بیشتر، این روش رایگان می‌شود</small>
                  )}
                </span>
                {free && !off ? (
                  <span className={`${styles.fee} ${styles.free}`}>
                    <s className="num">{faNum(m.fee)}</s> رایگان
                  </span>
                ) : (
                  <span className={`${styles.fee} num`}>{faNum(m.fee)} {store.currency_label}</span>
                )}
              </label>
            );
          })}
        </div>
      </section>

      <section className={`${styles.sec} ${code ? styles.done : ""}`}>
        <h2><span className={styles.n}>{code ? <Icon name="check" /> : "٪"}</span>کد تخفیف <small>اختیاری</small></h2>
        {quote?.discount_kind === "birthday" && (
          <p className={styles.verified}>
            🎂 تولدت مبارک! <span className="num">{faNum(quote.discount)}</span> {store.currency_label} تخفیف تولد روی خریدت اعمال شد.
          </p>
        )}
        {quote?.discount_note && <p className="hint">{quote.discount_note}</p>}
        {code ? (
          quote?.discount_kind === "code" && (
            <p className={styles.verified}>
              <Icon name="check" /> کد <b dir="ltr">{code}</b> اعمال شد: <span className="num">{faNum(quote?.discount ?? 0)}</span> {store.currency_label} تخفیف
              <button type="button" className={styles.link} onClick={() => { setCode(""); setCodeInput(""); }}>حذف</button>
            </p>
          )
        ) : (
          <>
            <div className={styles.inline}>
              <input
                id="co-code"
                className={`input ltr ${styles.code}`}
                value={codeInput}
                onChange={(e) => { setCodeInput(latinCode(e.target.value)); setErrors((er) => ({ ...er, discount_code: "" })); }}
                onKeyDown={(e) => e.key === "Enter" && applyCode()}
                placeholder="CODE"
                aria-label="کد تخفیف"
                aria-describedby="co-code-hint"
                aria-invalid={!!errors.discount_code}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                maxLength={30}
              />
              <button type="button" className="btn btn-ink" onClick={applyCode}>اعمال</button>
            </div>
            <p id="co-code-hint" className="hint">کد با حروف بزرگ انگلیسی نوشته می‌شود؛ هر طور تایپ کنید، خودش درست می‌شود.</p>
            {errors.discount_code && <p className="err">{errors.discount_code}</p>}
          </>
        )}
      </section>

      <section className={styles.sec}>
        <h2><span className={styles.n}><Icon name="card" /></span>پرداخت</h2>
        <div className={styles.payNote}>
          <Icon name="card" />
          {store.online_payment ? (
            <span>با زدن دکمه‌ی پرداخت به درگاه امن بانکی می‌روی و با همه‌ی کارت‌های عضو شتاب می‌توانی پرداخت کنی. سفارش بعد از پرداخت موفق قطعی می‌شود.</span>
          ) : (
            <span>بعد از ثبت سفارش، فروشگاه برای هماهنگی پرداخت با شما تماس می‌گیرد. کالاهای سفارش تا آن موقع برایتان کنار گذاشته می‌شود.</span>
          )}
        </div>
        <p className="hint" style={{ marginTop: 10 }}>
          با ثبت سفارش، <Link href="/terms" style={{ textDecoration: "underline" }}>قوانین و مقررات</Link> فروشگاه را می‌پذیری.
        </p>
      </section>

      <div className={styles.foot}>
        <div className={styles.footIn}>
          <button type="button" className={styles.sumToggle} aria-expanded={sumOpen} onClick={() => setSumOpen(!sumOpen)}>
            <span>جمع کل (<span className="num">{faNum(cart.count)}</span> کالا) <Icon name="chev" /></span>
            <span className={`${styles.total} num`}>{faNum(total)} {store.currency_label}</span>
          </button>
          <div className={`${styles.sum} ${sumOpen ? styles.sumOn : ""}`}>
            <div>
              <ul className={styles.lines}>
                {cart.lines.map((l) => (
                  <li key={l.variantId}>
                    <span className={styles.th}><ProductMedia image={l.image} alt={l.name} hex={l.colorHex} sizes="44px" /></span>
                    <span><b>{l.name}</b><small>{l.colorName}، سایز <span className="num">{l.size}</span>، <span className="num">{faNum(l.qty)}</span> عدد</small></span>
                    <span className="num">{faNum(l.price * l.qty)}</span>
                  </li>
                ))}
              </ul>
              <div className={styles.row}><span>جمع کالاها</span><b className="num">{faNum(quote?.subtotal ?? cart.subtotal)}</b></div>
              <div className={styles.row}><span>هزینه‌ی ارسال</span><b className="num">{faNum(quote?.shipping_fee ?? 0)}</b></div>
              {!!quote?.discount && <div className={`${styles.row} ${styles.off}`}><span>{quote.discount_kind === "birthday" ? "تخفیف تولد" : "تخفیف"}</span><b className="num">{signed("−", quote.discount)}</b></div>}
            </div>
          </div>
          <button type="button" className={styles.place} onClick={place} disabled={placing || unavailable.length > 0}>
            <Icon name="lock" />
            {placing ? (
              store.online_payment ? "در حال انتقال به درگاه…" : "در حال ثبت…"
            ) : !signedIn ? (
              "اول وارد شو"
            ) : unavailable.length ? (
              "اول سبد را اصلاح کن"
            ) : (
              <>{store.online_payment ? "پرداخت" : "ثبت سفارش"} — <span className="num">{faNum(total)}</span> {store.currency_label}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
