import Link from "next/link";

import type { CategoryNode, Store } from "@/lib/types";

import { Icon } from "./Icon";
import { Logo } from "./Logo";
import styles from "./Footer.module.css";

export function Footer({ store, categories }: { store: Store; categories: CategoryNode[] }) {
  const year = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { year: "numeric" }).format(new Date());
  return (
    <footer className={styles.ftr}>
      <div className="wrap">
        <div className={styles.grid}>
          <div className={styles.brand}>
            <Logo store={store} size={64} />
            {store.tagline && <p>{store.tagline}</p>}
          </div>
          <div>
            <h2>خرید</h2>
            <ul>
              {categories.map((c) => (
                <li key={c.id}>
                  <Link href={`/c/${c.slug}`}>{c.name}</Link>
                </li>
              ))}
              <li>
                <Link href="/shop?on_sale=true">حراج</Link>
              </li>
            </ul>
          </div>
          <div>
            <h2>راهنما</h2>
            <ul>
              <li>
                <Link href="/track">پیگیری سفارش</Link>
              </li>
              {store.returns.enabled && (
                <li>
                  <Link href="/returns">قوانین مرجوعی</Link>
                </li>
              )}
              <li>
                <Link href="/account">حساب من</Link>
              </li>
            </ul>
          </div>
          <div>
            <h2>فروشگاه حضوری</h2>
            <ul className={styles.contact}>
              {store.address && (
                <li>
                  <Icon name="pin" />
                  <span>{store.address}</span>
                </li>
              )}
              {store.phone && (
                <li>
                  <Icon name="phone" />
                  <span className="num" dir="ltr">{store.phone}</span>
                </li>
              )}
              {store.instagram && (
                <li>
                  <Icon name="insta" />
                  <a href={`https://instagram.com/${store.instagram}`} target="_blank" rel="noopener noreferrer" dir="ltr">
                    @{store.instagram}
                  </a>
                </li>
              )}
            </ul>
          </div>
        </div>
        <div className={styles.bottom}>
          <span>
            © {year} {store.name}
          </span>
        </div>
      </div>
    </footer>
  );
}
