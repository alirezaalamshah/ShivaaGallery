"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { CartBadge } from "./cart/CartBadge";
import { Icon, type IconName } from "./Icon";
import styles from "./BottomNav.module.css";

const ITEMS: { href: string; label: string; icon: IconName; match: (p: string) => boolean }[] = [
  { href: "/", label: "خانه", icon: "home", match: (p) => p === "/" },
  { href: "/categories", label: "دسته‌ها", icon: "grid", match: (p) => p.startsWith("/categories") || p.startsWith("/c/") },
  { href: "/search", label: "جستجو", icon: "search", match: (p) => p.startsWith("/search") },
  { href: "/account", label: "حساب من", icon: "user", match: (p) => p.startsWith("/account") },
  { href: "/cart", label: "سبد خرید", icon: "bag", match: (p) => p.startsWith("/cart") || p.startsWith("/checkout") },
];

export function BottomNav() {
  const path = usePathname();
  return (
    <nav className={styles.bnav} aria-label="ناوبری پایین">
      {ITEMS.map((item) => {
        const on = item.match(path);
        return (
          <Link key={item.href} href={item.href} className={on ? styles.on : undefined} aria-current={on ? "page" : undefined}>
            <span className={styles.ico}>
              <Icon name={item.icon} />
              {item.href === "/cart" && <CartBadge />}
            </span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
