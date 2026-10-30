"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Icon } from "@/components/Icon";
import { useStore } from "@/components/StoreProvider";
import { faDateTime, faNum, toFaDigits } from "@/lib/format";

import { useAdmin } from "./hooks";
import { Card, Empty, PageHead } from "./ui";
import s from "./panel.module.css";

type Customer = { id: number; phone: string; name: string; order_count: number; spent: number; last_order: string };

export function Customers() {
  const store = useStore();
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  const { data, loading } = useAdmin<Customer[]>(`/customers${search ? `?search=${encodeURIComponent(search)}` : ""}`);

  return (
    <>
      <PageHead title="مشتری‌ها" sub="مشتری‌هایی که از سایت سفارش داده‌اند. «خرید» فقط سفارش‌های پرداخت‌شده را می‌شمارد." />
      <Card>
        <div className={s.toolbar}>
          <label className={s.search}>
            <Icon name="search" />
            <span className="sr-only">جستجو</span>
            <input id="customer-search" className="input" placeholder="موبایل یا نام" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
        </div>
        {data?.length ? (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead><tr><th>مشتری</th><th>موبایل</th><th>سفارش‌ها</th><th>خرید ({store.currency_label})</th><th>آخرین سفارش</th></tr></thead>
              <tbody>
                {data.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name || "—"}</td>
                    <td className="num" dir="ltr"><a href={`tel:${c.phone}`}>{toFaDigits(c.phone)}</a></td>
                    <td><Link href={`/panel/orders?user=${c.id}`} className="link-more">{faNum(c.order_count)} سفارش</Link></td>
                    <td className="num">{faNum(c.spent)}</td>
                    <td className="muted">{faDateTime(c.last_order)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          !loading && <Empty icon="user" title={search ? "مشتری‌ای پیدا نشد" : "هنوز مشتری‌ای سفارش نداده"} />
        )}
      </Card>
    </>
  );
}
