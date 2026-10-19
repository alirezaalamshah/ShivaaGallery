"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useAuth } from "@/components/auth/AuthProvider";
import { PhoneLogin } from "@/components/auth/PhoneLogin";
import { Icon } from "@/components/Icon";
import { ProductMedia } from "@/components/ProductMedia";
import { useStore } from "@/components/StoreProvider";
import { call } from "@/lib/client";
import { faDate, faNum, toFaDigits } from "@/lib/format";
import type { Address, OrderSummary } from "@/lib/types";

import styles from "./Account.module.css";

export function AccountView() {
  const { me, logout } = useAuth();
  const store = useStore();
  const [orders, setOrders] = useState<OrderSummary[] | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const signedIn = !!me?.authenticated && !me.is_staff;

  useEffect(() => {
    if (!signedIn) return;
    call<OrderSummary[]>("/orders").then(setOrders).catch(() => setOrders([]));
    call<Address[]>("/addresses").then(setAddresses).catch(() => {});
  }, [signedIn]);

  if (!me) return <div className={styles.page} aria-busy="true" />;

  if (me.is_staff) {
    return (
      <div className={styles.page}>
        <div className={styles.loginCard}>
          <h1>شما با حساب مدیر وارد شده‌اید</h1>
          <p>برای مدیریت فروشگاه به پنل بروید.</p>
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
          <h1 className="page-title">حساب من</h1>
          <span className={`${styles.phone} num`} dir="ltr">{toFaDigits(me.phone ?? "")}</span>
        </div>
        <button type="button" className="btn btn-ghost" onClick={logout}>خروج</button>
      </header>

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

      {addresses.length > 0 && (
        <section>
          <h2 className={styles.h2}>آدرس‌های ذخیره‌شده</h2>
          <ul className={styles.addresses}>
            {addresses.map((a) => (
              <li key={a.id}>
                <span>
                  <b>{a.receiver_name} · {a.province ? `${a.province}، ` : ""}{a.city}</b>
                  <small>{a.address}</small>
                </span>
                <button
                  type="button"
                  className={styles.rm}
                  aria-label="حذف آدرس"
                  onClick={async () => {
                    await call(`/addresses/${a.id}`, { method: "DELETE" });
                    setAddresses((list) => list.filter((x) => x.id !== a.id));
                  }}
                >
                  <Icon name="trash" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
