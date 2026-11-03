"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { type Me, useAuth } from "@/components/auth/AuthProvider";
import { PhoneLogin } from "@/components/auth/PhoneLogin";
import { Icon } from "@/components/Icon";
import { DateInput } from "@/components/panel/DateInput";
import { isoDay } from "@/components/panel/dates";
import { ProductCard } from "@/components/ProductCard";
import { ProductMedia } from "@/components/ProductMedia";
import { useStore } from "@/components/StoreProvider";
import { useToast } from "@/components/Toast";
import { call } from "@/lib/client";
import { faDate, faNum, toFaDigits } from "@/lib/format";
import type { Address, OrderSummary, ProductSummary } from "@/lib/types";

import { AddressForm } from "./AddressForm";
import styles from "./Account.module.css";

export function AccountView() {
  const { me, setMe, logout } = useAuth();
  const store = useStore();
  const [orders, setOrders] = useState<OrderSummary[] | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [favorites, setFavorites] = useState<ProductSummary[]>([]);
  const [removing, setRemoving] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [editName, setEditName] = useState(false);
  const toast = useToast();
  const signedIn = me?.role === "customer";

  useEffect(() => {
    if (!signedIn) return;
    call<OrderSummary[]>("/orders").then(setOrders).catch(() => setOrders([]));
    call<Address[]>("/addresses").then(setAddresses).catch(() => {});
    call<ProductSummary[]>("/favorites").then(setFavorites).catch(() => {});
  }, [signedIn]);

  if (!me) return <div className={styles.page} aria-busy="true" />;

  if (me.role === "admin" || me.role === "staff") {
    const admin = me.role === "admin";
    return (
      <div className={styles.page}>
        <div className={styles.loginCard}>
          <h1>{admin ? "شما با حساب مدیر وارد شده‌اید" : "شما با حساب کاربر پنل وارد شده‌اید"}</h1>
          <p>{admin ? "برای مدیریت فروشگاه به پنل بروید." : "برای کار با پنل فروشگاه به پنل بروید."}</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link href="/panel" className="btn btn-ink">ورود به پنل</Link>
            <button type="button" className="btn btn-ghost" onClick={logout}>خروج</button>
          </div>
        </div>
      </div>
    );
  }

  if (!signedIn) {
    return (
      <div className={styles.page}>
        <div className={styles.loginCard}>
          <div className={styles.seal} aria-hidden="true">
            <span className={styles.ring} />
            {store.logo ? (
              // eslint-disable-next-line @next/next/no-img-element -- small brand mark
              <img src={store.logo} alt="" />
            ) : (
              <span className={styles.mono}>{store.name.charAt(0)}</span>
            )}
          </div>
          <h1>ورود به حساب</h1>
          <p className={styles.sub}>کد تأیید به شماره‌ات پیامک می‌شود.</p>
          <PhoneLogin stacked />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div>
          <span className="latin">My account</span>
          <h1 className="page-title">{me.name || "حساب من"}</h1>
          <span className={`${styles.phone} num`} dir="ltr">{toFaDigits(me.phone ?? "")}</span>
          {!editName && (
            <button type="button" className={styles.linkBtn} onClick={() => setEditName(true)}>
              {me.name ? "ویرایش نام" : "نامت را اضافه کن"}
            </button>
          )}
        </div>
        <button type="button" className="btn btn-ghost" onClick={logout}>خروج</button>
      </header>

      {editName && <NameForm me={me} onDone={(m) => { if (m) { setMe(m); toast({ text: "نام ذخیره شد" }); } setEditName(false); }} />}

      {(me.birthday || store.birthday_discount > 0) && <BirthdayCard me={me} percent={store.birthday_discount} onSaved={(m) => { setMe(m); toast({ text: "تاریخ تولدت ثبت شد" }); }} />}

      <section>
        <h2 className={styles.h2}>سفارش‌ها</h2>
        {orders === null ? (
          <div className={styles.skeleton} />
        ) : orders.length === 0 ? (
          <div className={styles.empty}>
            <p>هنوز سفارشی ثبت نکرده‌ای.</p>
            <Link href="/shop" className="btn btn-ink">دیدن محصولات</Link>
          </div>
        ) : (
          <ul className={styles.orders}>
            {orders.map((o, i) => (
              <li key={o.number} style={{ "--i": i } as React.CSSProperties}>
                <Link href={`/account/orders/${o.number}`} className={styles.order}>
                  <span className={styles.th}>
                    <ProductMedia image={o.first_image} alt={`سفارش ${o.number}`} sizes="56px" />
                  </span>
                  <span className={styles.meta}>
                    <b className="num" dir="ltr">#{toFaDigits(o.number)}</b>
                    <small>{faDate(o.created_at)}، <span className="num">{faNum(o.item_count)}</span> قلم</small>
                  </span>
                  <span className={styles.end}>
                    <span className="pill" data-status={o.status}>{o.status_label}</span>
                    <span className="num">{faNum(o.total)} {store.currency_label}</span>
                  </span>
                  <Icon name="chev" className={styles.chev} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id="favorites">
        <h2 className={styles.h2}>علاقه‌مندی‌ها</h2>
        {favorites.length ? (
          <div className={`grid ${styles.favGrid}`}>
            {favorites.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        ) : (
          <p className={styles.sub}>با زدن <Icon name="heart" className={styles.inlineIcon} /> در صفحه‌ی هر محصول، آن را این‌جا نگه دار.</p>
        )}
      </section>

      <section>
        <div className={styles.secHead}>
          <h2 className={styles.h2}>آدرس‌های ذخیره‌شده</h2>
          {editing === null && (
            <button type="button" className={styles.linkBtn} onClick={() => setEditing("new")}>
              <Icon name="plus" /> آدرس جدید
            </button>
          )}
        </div>
        {editing === "new" && (
          <AddressForm
            onSaved={(a) => { setAddresses((list) => [a, ...list]); setEditing(null); toast({ text: "آدرس ذخیره شد" }); }}
            onCancel={() => setEditing(null)}
          />
        )}
        {addresses.length === 0 && editing !== "new" && <p className={styles.sub}>آدرسی ذخیره نکرده‌ای. آدرس‌هایی که در خرید وارد کنی این‌جا نگه داشته می‌شوند.</p>}
        <ul className={styles.addresses}>
          {addresses.map((a) =>
            editing === a.id ? (
              <li key={a.id} className={styles.editing}>
                <AddressForm
                  address={a}
                  onSaved={(saved) => { setAddresses((list) => list.map((x) => (x.id === a.id ? saved : x))); setEditing(null); toast({ text: "آدرس ذخیره شد" }); }}
                  onCancel={() => setEditing(null)}
                />
              </li>
            ) : (
              <li key={a.id}>
                <span>
                  <b>{a.receiver_name} · {a.province ? `${a.province}، ` : ""}{a.city}</b>
                  <small>{a.address}{a.postal_code && <> · کد پستی <span className="num">{toFaDigits(a.postal_code)}</span></>}</small>
                </span>
                {removing === a.id ? (
                  <span className={styles.confirm}>
                    حذف شود؟
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={async () => {
                        try {
                          await call(`/addresses/${a.id}`, { method: "DELETE" });
                          setAddresses((list) => list.filter((x) => x.id !== a.id));
                        } catch (e) {
                          toast({ text: e instanceof Error ? e.message : "حذف نشد." });
                        }
                        setRemoving(null);
                      }}
                    >
                      بله
                    </button>
                    <button type="button" className="btn btn-ghost" onClick={() => setRemoving(null)}>نه</button>
                  </span>
                ) : (
                  <span className={styles.rowBtns}>
                    <button type="button" className={styles.linkBtn} onClick={() => setEditing(a.id)}>ویرایش</button>
                    <button type="button" className={styles.rm} aria-label="حذف آدرس" onClick={() => setRemoving(a.id)}>
                      <Icon name="trash" />
                    </button>
                  </span>
                )}
              </li>
            ),
          )}
        </ul>
      </section>
    </div>
  );
}

/** The customer gives their birthday once, for the birthday-week discount; after that it only shows. */
function BirthdayCard({ me, percent, onSaved }: { me: Me; percent: number; onSaved: (me: Me) => void }) {
  const [day, setDay] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      onSaved(await call<Me>("/auth/profile", { method: "PATCH", body: { birthday: day } }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "ذخیره نشد.");
    } finally {
      setBusy(false);
    }
  };
  if (me.birthday) {
    return (
      <section className={styles.birthday}>
        <span className={styles.cake} aria-hidden="true">🎂</span>
        <div>
          <b>تولدت: {faDate(`${me.birthday}T12:00:00`)}</b>
          <small>{percent > 0 ? `از ۳ روز قبل تا ۳ روز بعد از تولدت، ${faNum(percent)}٪ تخفیف تولد خودکار روی خریدت می‌آید.` : "برای تغییر تاریخ تولد با فروشگاه تماس بگیر."}</small>
        </div>
      </section>
    );
  }
  return (
    <section className={styles.birthday}>
      <span className={styles.cake} aria-hidden="true">🎂</span>
      <div>
        <b>تاریخ تولدت را ثبت کن و در هفته‌ی تولدت {faNum(percent)}٪ تخفیف بگیر</b>
        <small>فقط یک بار ثبت می‌شود و بعد قابل تغییر نیست؛ پس با دقت انتخاب کن.</small>
        <div className={styles.birthdayRow}>
          <DateInput value={day} onChange={setDay} max={isoDay(new Date())} placeholder="روز تولد" label="تاریخ تولد" />
          <button type="button" className="btn btn-ink" disabled={!day || busy} onClick={save}>{busy ? "در حال ثبت…" : "ثبت"}</button>
        </div>
        {error && <p className="err" role="alert">{error}</p>}
      </div>
    </section>
  );
}

function NameForm({ me, onDone }: { me: Me; onDone: (me: Me | null) => void }) {
  const [first, setFirst] = useState(me.first_name ?? "");
  const [last, setLast] = useState(me.last_name ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      onDone(await call<Me>("/auth/profile", { method: "PATCH", body: { first_name: first, last_name: last } }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "ذخیره نشد.");
      setBusy(false);
    }
  };
  return (
    <form className={styles.form} onSubmit={save}>
      <div className="row2">
        <label className="field">
          <span className="label">نام</span>
          <input className="input" autoComplete="given-name" value={first} onChange={(e) => setFirst(e.target.value)} maxLength={150} autoFocus />
        </label>
        <label className="field">
          <span className="label">نام خانوادگی</span>
          <input className="input" autoComplete="family-name" value={last} onChange={(e) => setLast(e.target.value)} maxLength={150} />
        </label>
      </div>
      {error && <p className="err" role="alert">{error}</p>}
      <div className={styles.formActions}>
        <button type="submit" className="btn btn-ink" disabled={busy}>{busy ? "در حال ذخیره…" : "ذخیره"}</button>
        <button type="button" className="btn btn-ghost" onClick={() => onDone(null)}>انصراف</button>
      </div>
    </form>
  );
}
