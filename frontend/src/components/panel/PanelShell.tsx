"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useAuth } from "@/components/auth/AuthProvider";
import { Icon, type IconName } from "@/components/Icon";
import { useStore } from "@/components/StoreProvider";
import { faNum } from "@/lib/format";

import { canOpen, homeOf, isPanelUser } from "./access";
import { adminCall } from "./hooks";
import s from "./panel.module.css";

type Badges = { orders_open?: number; reviews_pending?: number; returns_open?: number };

const NAV: { group: string; items: { href: string; label: string; icon: IconName; badge?: keyof Badges }[] }[] = [
  { group: "فروش", items: [
    { href: "/panel", label: "داشبورد", icon: "home" },
    { href: "/panel/pos", label: "صندوق فروش حضوری", icon: "card" },
    { href: "/panel/orders", label: "سفارش‌های اینترنتی", icon: "bag", badge: "orders_open" },
    { href: "/panel/returns", label: "مرجوعی‌های اینترنتی", icon: "ret", badge: "returns_open" },
    { href: "/panel/stock", label: "موجودی انبار", icon: "grid" },
    { href: "/panel/customers", label: "مشتری‌ها", icon: "user" },
    { href: "/panel/reviews", label: "نظرات خریداران", icon: "heart", badge: "reviews_pending" },
  ] },
  { group: "حساب و کتاب", items: [
    { href: "/panel/reports", label: "سود و زیان و گزارش‌ها", icon: "chart" },
    { href: "/panel/expenses", label: "هزینه‌ها", icon: "wallet" },
  ] },
  { group: "کاتالوگ", items: [
    { href: "/panel/products", label: "محصولات", icon: "grid" },
    { href: "/panel/categories", label: "دسته‌ها", icon: "filter" },
    { href: "/panel/attributes", label: "رنگ و سایز", icon: "ruler" },
  ] },
  { group: "فروشگاه", items: [
    { href: "/panel/home", label: "صفحه‌ی اصلی و بنرها", icon: "image" },
    { href: "/panel/shipping", label: "روش‌های ارسال", icon: "truck" },
    { href: "/panel/discounts", label: "کدهای تخفیف", icon: "card" },
    { href: "/panel/team", label: "کاربران و دسترسی", icon: "lock" },
    { href: "/panel/settings", label: "تنظیمات فروشگاه", icon: "shield" },
  ] },
];

/** The phone's tab bar: the pages used all day. Everything else opens from «منو». */
const TABS: { href: string; label: string; icon: IconName; badge?: keyof Badges }[] = [
  { href: "/panel", label: "داشبورد", icon: "home" },
  { href: "/panel/pos", label: "صندوق", icon: "card" },
  { href: "/panel/orders", label: "سفارش‌ها", icon: "bag", badge: "orders_open" },
  { href: "/panel/products", label: "محصولات", icon: "grid" },
];

/** Menu pages in order; a user who may not open a page lands on the first one they may. */
export const MENU = NAV.flatMap((g) => g.items.map((it) => it.href));

export function PanelShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const store = useStore();
  const { me, logout } = useAuth();
  const [badges, setBadges] = useState<Badges>({});
  const role = me?.authenticated ? me.role : undefined;
  const allowed = canOpen(me, path);
  const home = homeOf(me, MENU);
  const isLogin = path === "/panel/login";
  const [menu, setMenu] = useState(false);
  const content = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isLogin || !me) return;
    if (!isPanelUser(me)) router.replace(`/panel/login?next=${encodeURIComponent(path)}`);
    else if (!allowed && home) router.replace(home);
  }, [me, isLogin, path, router, allowed, home]);

  useEffect(() => {
    if (!isPanelUser(me)) return;
    adminCall<Badges>("/badges").then(setBadges).catch(() => {});
  }, [me, path]);

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    addEventListener("keydown", onKey);
    document.documentElement.style.overflow = "hidden";
    return () => {
      removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = "";
    };
  }, [menu]);

  // On phones each table row is a card, and each card needs its column's title. Every list in the
  // panel gets this here, also the rows that arrive after the page has opened.
  useEffect(() => {
    const root = content.current;
    if (!root) return;
    const label = () => {
      for (const table of root.querySelectorAll("table")) {
        const titles = [...table.querySelectorAll("thead th")].map((th) => th.textContent?.trim() ?? "");
        for (const row of table.querySelectorAll("tbody tr")) {
          if (row.querySelector("[colspan]")) continue;
          [...row.children].forEach((cell, i) => {
            if (titles[i]) cell.setAttribute("data-label", titles[i]);
          });
        }
      }
    };
    label();
    const watch = new MutationObserver(label);
    watch.observe(root, { childList: true, subtree: true });
    return () => watch.disconnect();
  }, [path, me, allowed]);

  if (isLogin) return <>{children}</>;
  if (isPanelUser(me) && !home) {
    return (
      <div className={s.login}>
        <div className={s.loginCard}>
          <h1>هنوز به بخشی از پنل دسترسی ندارید</h1>
          <p className="muted">از مدیر فروشگاه بخواهید در «کاربران و دسترسی» برای شما دسترسی تعیین کند.</p>
          <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={async () => { await logout(); router.replace("/panel/login"); }}>خروج</button>
        </div>
      </div>
    );
  }
  if (!me || !allowed) return <div className={s.login} aria-busy="true" />;
  // Print pages are just the paper, without the panel around them.
  if (path.endsWith("/print")) return <>{children}</>;

  const active = (href: string) => (href === "/panel" ? path === "/panel" : path.startsWith(href));
  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((it) => canOpen(me, it.href)) })).filter((g) => g.items.length);

  return (
    <div className={s.shell}>
      <aside className={s.side}>
        <div className={s.brand}>
          {store.logo && (
            // eslint-disable-next-line @next/next/no-img-element -- tiny brand mark
            <img src={store.logo} alt="" />
          )}
          <span>
            <b>{store.name}</b>
            <small>{role === "admin" ? "پنل مدیریت" : "پنل فروشگاه"}</small>
          </span>
        </div>
        <div className={s.navs}>
          {groups.map((g) => (
            <nav key={g.group} aria-label={g.group} style={{ display: "contents" }}>
              <div className={s.navGroup}>{g.group}</div>
              {g.items.map((it) => (
                <Link key={it.href} href={it.href} className={`${s.navItem} ${active(it.href) ? s.navOn : ""}`} aria-current={active(it.href) ? "page" : undefined}>
                  <Icon name={it.icon} />
                  {it.label}
                  {it.badge && !!badges[it.badge] && <span className={`${s.navBadge} num`}>{faNum(badges[it.badge]!)}</span>}
                </Link>
              ))}
            </nav>
          ))}
        </div>
        <div className={s.sideFoot}>
          <a href="/" target="_blank" rel="noopener" className={s.navItem}>
            <Icon name="arrow" /> مشاهده‌ی سایت
          </a>
        </div>
      </aside>
      <div className={s.main}>
        <header className={s.topbar}>
          <div className={s.who}>
            <span className={s.avatar}>{(me.username ?? "م").charAt(0)}</span>
            <span>{me.name || me.username}</span>
            <button
              type="button"
              className={`${s.btn} ${s.btnGhost} ${s.btnSm}`}
              onClick={async () => {
                await logout();
                router.replace("/panel/login");
              }}
            >
              خروج
            </button>
          </div>
        </header>
        <div className={s.content} key={path} ref={content}>
          {children}
        </div>
      </div>
      {menu && (
        <div className={s.menuSheet} id="panel-menu" role="dialog" aria-modal="true" aria-label="منوی پنل">
          {groups.map((g) => (
            <nav key={g.group} aria-label={g.group}>
              <h2>{g.group}</h2>
              <div className={s.menuGrid}>
                {g.items.map((it) => (
                  <Link key={it.href} href={it.href} className={s.menuItem} aria-current={active(it.href) ? "page" : undefined} onClick={() => setMenu(false)}>
                    <Icon name={it.icon} />
                    {it.label}
                    {it.badge && !!badges[it.badge] && <span className={`${s.navBadge} num`}>{faNum(badges[it.badge]!)}</span>}
                  </Link>
                ))}
              </div>
            </nav>
          ))}
          <h2>فروشگاه آنلاین</h2>
          <div className={s.menuGrid}>
            <a href="/" target="_blank" rel="noopener" className={s.menuItem}><Icon name="arrow" /> مشاهده‌ی سایت</a>
          </div>
        </div>
      )}
      <nav className={s.bottomNav} aria-label="دسترسی سریع">
        {TABS.filter((t) => canOpen(me, t.href)).map((t) => (
          <Link key={t.href} href={t.href} className={s.bottomItem} aria-current={!menu && active(t.href) ? "page" : undefined} onClick={() => setMenu(false)}>
            <Icon name={t.icon} />
            {t.label}
            {t.badge && !!badges[t.badge] && <span className={`${s.navBadge} num`}>{faNum(badges[t.badge]!)}</span>}
          </Link>
        ))}
        <button type="button" className={s.bottomItem} aria-expanded={menu} aria-controls="panel-menu" onClick={() => setMenu(!menu)}>
          <Icon name={menu ? "close" : "menu"} />
          منو
        </button>
      </nav>
    </div>
  );
}
