import Link from "next/link";

import type { CategoryNode, Store } from "@/lib/types";

import { CartBadge } from "./cart/CartBadge";
import { HeaderShell } from "./HeaderShell";
import { Icon } from "./Icon";
import { Logo } from "./Logo";
import styles from "./Header.module.css";

export function Header({ store, categories }: { store: Store; categories: CategoryNode[] }) {
  return (
    <HeaderShell>
      <div className={`wrap ${styles.bar}`}>
        <Link href="/" aria-label={`${store.name}، صفحه‌ی اصلی`}>
          <Logo store={store} />
        </Link>
        <nav className={styles.nav} aria-label="دسته‌های اصلی">
          <Link href="/shop">تازه‌ها</Link>
          {categories.map((c) => (
            <Link key={c.id} href={`/c/${c.slug}`}>
              {c.name}
            </Link>
          ))}
          <Link href="/shop?on_sale=true" className={styles.sale}>
            حراج
          </Link>
        </nav>
        <div className={styles.tools}>
          <Link href="/search" className="icon-btn" aria-label="جستجو">
            <Icon name="search" />
          </Link>
          <Link href="/account" className={`icon-btn ${styles.desk}`} aria-label="حساب کاربری">
            <Icon name="user" />
          </Link>
          <Link href="/cart" className={`icon-btn ${styles.desk}`} aria-label="سبد خرید">
            <Icon name="bag" />
            <CartBadge />
          </Link>
        </div>
      </div>
    </HeaderShell>
  );
}
