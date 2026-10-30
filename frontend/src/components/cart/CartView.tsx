"use client";

import Link from "next/link";

import { Icon } from "@/components/Icon";
import { ProductMedia } from "@/components/ProductMedia";
import { useStore } from "@/components/StoreProvider";
import { faNum } from "@/lib/format";

import { useCart } from "./CartProvider";
import styles from "./Cart.module.css";

export function CartView() {
  const cart = useCart();
  const { currency_label } = useStore();

  if (!cart.ready) return <div className={styles.page} aria-busy="true" />;

  if (!cart.lines.length) {
    return (
      <div className={`${styles.page} ${styles.empty}`}>
        <svg viewBox="0 0 90 90" aria-hidden="true" className={styles.ring}>
          {Array.from({ length: 28 }, (_, i) => {
            const a = (i / 28) * Math.PI * 2;
            const r = 1 + 1.6 * (0.5 + 0.5 * Math.sin(i * 0.9));
            return <circle key={i} cx={45 + Math.cos(a) * 38} cy={45 + Math.sin(a) * 38} r={r} fill="currentColor" />;
          })}
        </svg>
        <h1>سبدت خالی است</h1>
        <p>از تازه‌ها شروع کن.</p>
        <Link href="/shop" className="btn btn-ink">
          دیدن محصولات
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <h1 className="page-title">
        سبد خرید <small className="num">{faNum(cart.count)} کالا</small>
      </h1>
      {cart.issues > 0 && (
        <div className={styles.alert} role="alert">
          <span>موجودی {faNum(cart.issues)} کالا کمتر از سبد شماست.</span>
          <button type="button" className="btn btn-ink" onClick={cart.fix}>اصلاح سبد</button>
        </div>
      )}
      <ul className={styles.lines}>
        {cart.lines.map((l) => {
          const c = cart.check[l.variantId];
          const max = c ? Math.max(c.available, 0) : Infinity;
          return (
          <li key={l.variantId} className={`${styles.line} ${c && !c.ok ? styles.bad : ""}`}>
            <Link href={`/p/${l.slug}`} className={styles.thumb}>
              <ProductMedia image={l.image} alt={l.name} hex={l.colorHex} sizes="88px" />
            </Link>
            <div className={styles.meta}>
              <Link href={`/p/${l.slug}`}>
                <h2>{l.name}</h2>
              </Link>
              <span>
                رنگ {l.colorName} · سایز <span className="num">{l.size}</span>
              </span>
              {c && !c.ok && (
                <span className={styles.warn}>{c.available > 0 ? <>فقط <span className="num">{faNum(c.available)}</span> عدد موجود است</> : "این کالا تمام شد"}</span>
              )}
              {c?.ok && c.available <= 2 && <span className={styles.low}>آخرین موجودی</span>}
              <div className={styles.qty}>
                <button type="button" aria-label="یکی بیشتر" disabled={l.qty >= max} onClick={() => cart.setQty(l.variantId, l.qty + 1)}>
                  <Icon name="plus" />
                </button>
                <span className="num" aria-live="polite">{faNum(l.qty)}</span>
                <button type="button" aria-label="یکی کمتر" onClick={() => cart.setQty(l.variantId, l.qty - 1)}>
                  <Icon name="minus" />
                </button>
              </div>
            </div>
            <div className={styles.end}>
              <span className="num">{faNum(l.price * l.qty)}</span>
              <button type="button" className={styles.rm} aria-label={`حذف ${l.name}`} onClick={() => cart.remove(l.variantId)}>
                <Icon name="trash" />
              </button>
            </div>
          </li>
          );
        })}
      </ul>
      <div className={styles.foot}>
        <div className={styles.total}>
          <span>جمع سبد</span>
          <span className="num">
            {faNum(cart.subtotal)} {currency_label}
          </span>
        </div>
        {cart.issues > 0 ? (
          <button type="button" className="btn btn-ink" style={{ width: "100%", borderRadius: 14, marginTop: 14 }} onClick={cart.fix}>
            اول سبد را اصلاح کن
          </button>
        ) : (
          <Link href="/checkout" className="btn btn-ink" style={{ width: "100%", borderRadius: 14, marginTop: 14 }}>
            ادامه‌ی خرید <Icon name="arrow" />
          </Link>
        )}
        <p className={styles.hint}>هزینه‌ی ارسال و کد تخفیف در مرحله‌ی بعد حساب می‌شود.</p>
      </div>
    </div>
  );
}
