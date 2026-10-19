import Link from "next/link";

import { toFaDigits } from "@/lib/format";
import type { CategoryNode, Store } from "@/lib/types";

import { BackToTop } from "./BackToTop";
import { Icon } from "./Icon";
import { Logo } from "./Logo";
import styles from "./Footer.module.css";

const DEVELOPER = { name: "هوشیوا", url: "https://houshiva.ir" };

export function Footer({ store, categories }: { store: Store; categories: CategoryNode[] }) {
  const year = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { year: "numeric" }).format(new Date());
  return (
    <footer className={styles.ftr}>
      <div className={styles.glow} aria-hidden="true" />
      <div className="wrap">
        <div className={styles.top} data-reveal>
          <p className={styles.word} aria-hidden="true">{store.name}</p>
          <svg className={styles.dots} viewBox="0 0 1200 24" preserveAspectRatio="none" aria-hidden="true">
            <path d="M0 12 Q 300 0 600 12 T 1200 12" />
          </svg>
        </div>

        <div className={styles.grid} data-reveal-group>
          <div className={styles.brand}>
            <Logo store={store} size={60} />
            {store.tagline && <p>{store.tagline}</p>}
            {store.instagram && (
              <a className={styles.insta} href={`https://instagram.com/${store.instagram}`} target="_blank" rel="noopener noreferrer">
                <span className={styles.instaIc}><Icon name="insta" /></span>
                <span>
                  <b>ما را در اینستاگرام دنبال کن</b>
                  <small dir="ltr">@{store.instagram}</small>
                </span>
                <Icon name="arrow" />
              </a>
            )}
          </div>

          <nav aria-label="دسته‌ها">
            <h2>خرید</h2>
            <ul>
              <li><Link href="/shop">تازه‌ها</Link></li>
              {categories.map((c) => (
                <li key={c.id}><Link href={`/c/${c.slug}`}>{c.name}</Link></li>
              ))}
              <li><Link href="/shop?on_sale=true" className={styles.sale}>حراج</Link></li>
            </ul>
          </nav>

          <nav aria-label="راهنما">
            <h2>راهنما</h2>
            <ul>
              <li><Link href="/track">پیگیری سفارش</Link></li>
              <li><Link href="/account">حساب من</Link></li>
              {store.returns.enabled && <li><Link href="/returns">قوانین مرجوعی</Link></li>}
              <li><Link href="/cart">سبد خرید</Link></li>
            </ul>
          </nav>

          <div>
            <h2>فروشگاه حضوری</h2>
            <ul className={styles.contact}>
              {store.address && (
                <li><Icon name="pin" /><span>{store.address}</span></li>
              )}
              {store.phone && (
                <li><Icon name="phone" /><a href={`tel:${store.phone}`} className="num" dir="ltr">{toFaDigits(store.phone)}</a></li>
              )}
              {store.landline && (
                <li><Icon name="phone" /><a href={`tel:${store.landline}`} className="num" dir="ltr">{toFaDigits(store.landline)}</a></li>
              )}
              {store.city && !store.address && (
                <li><Icon name="pin" /><span>{store.city}</span></li>
              )}
            </ul>
          </div>
        </div>

        <div className={styles.bottom}>
          <span>
            تمامی حقوق این وب‌سایت متعلق به <b className={styles.owner}>{store.name}</b> است. © {year}
          </span>
          <a className={styles.credit} href={DEVELOPER.url} target="_blank" rel="noopener">
            طراحی و توسعه: <b>{DEVELOPER.name}</b>
          </a>
          <BackToTop />
        </div>
      </div>
    </footer>
  );
}
