"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useAuth } from "@/components/auth/AuthProvider";
import { Icon, type IconName } from "@/components/Icon";
import { useStore } from "@/components/StoreProvider";
import { faNum } from "@/lib/format";

import { adminCall } from "./hooks";
import s from "./panel.module.css";

const NAV: { group: string; items: { href: string; label: string; icon: IconName }[] }[] = [
  { group: "فروش", items: [
    { href: "/panel", label: "داشبورد", icon: "home" },
    { href: "/panel/orders", label: "سفارش‌ها", icon: "bag" },
  ] },
  { group: "کاتالوگ", items: [
    { href: "/panel/products", label: "محصولات", icon: "grid" },
    { href: "/panel/categories", label: "دسته‌ها", icon: "filter" },
    { href: "/panel/attributes", label: "رنگ و سایز", icon: "ruler" },
    { href: "/panel/inventory", label: "انبار", icon: "ret" },
  ] },
  { group: "فروشگاه", items: [
    { href: "/panel/shipping", label: "روش‌های ارسال", icon: "truck" },
    { href: "/panel/discounts", label: "کدهای تخفیف", icon: "card" },
    { href: "/panel/settings", label: "تنظیمات فروشگاه", icon: "shield" },
  ] },
];

export function PanelShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const store = useStore();
  const { me, logout } = useAuth();
  const [openOrders, setOpenOrders] = useState<number | null>(null);
  const isLogin = path === "/panel/login";
  const navs = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isLogin || !me) return;
    if (!me.authenticated || !me.is_staff) router.replace(`/panel/login?next=${encodeURIComponent(path)}`);
  }, [me, isLogin, path, router]);

  useEffect(() => {
    if (!me?.is_staff) return;
    adminCall<{ orders_open: number }>("/dashboard").then((d) => setOpenOrders(d.orders_open)).catch(() => {});
  }, [me, path]);

  // On phones the menu is one row that scrolls sideways; keep the open page in view.
  useEffect(() => {
    const row = navs.current;
    const on = row?.querySelector<HTMLElement>("[aria-current=page]");
    if (!row || !on || row.scrollWidth <= row.clientWidth) return;
    row.scrollLeft += on.getBoundingClientRect().left - row.getBoundingClientRect().left - (row.clientWidth - on.offsetWidth) / 2;
  }, [path, me]);

  if (isLogin) return <>{children}</>;
  if (!me?.is_staff) return <div className={s.login} aria-busy="true" />;

  const active = (href: string) => (href === "/panel" ? path === "/panel" : path.startsWith(href));

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
            <small>پنل مدیریت</small>
          </span>
        </div>
        <div className={s.navs} ref={navs}>
          {NAV.map((g) => (
            <nav key={g.group} aria-label={g.group} style={{ display: "contents" }}>
              <div className={s.navGroup}>{g.group}</div>
              {g.items.map((it) => (
                <Link key={it.href} href={it.href} className={`${s.navItem} ${active(it.href) ? s.navOn : ""}`} aria-current={active(it.href) ? "page" : undefined}>
                  <Icon name={it.icon} />
                  {it.label}
                  {it.href === "/panel/orders" && !!openOrders && <span className={`${s.navBadge} num`}>{faNum(openOrders)}</span>}
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
        <div className={s.content} key={path}>
          {children}
        </div>
      </div>
    </div>
  );
}
