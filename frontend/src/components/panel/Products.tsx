"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Icon } from "@/components/Icon";
import { ProductMedia } from "@/components/ProductMedia";
import { useStore } from "@/components/StoreProvider";
import { navStart } from "@/components/NavProgress";
import { faNum } from "@/lib/format";

import { adminCall, refreshSite, useAdmin } from "./hooks";
import type { AdminCategory, AdminProductRow, Paged } from "./types";
import { Card, Empty, PageHead, Switch } from "./ui";
import s from "./panel.module.css";

/** Categories as "parent › child" labels, in tree order, for select boxes. */
export function categoryOptions(cats: AdminCategory[]) {
  const out: { id: number; label: string }[] = [];
  const walk = (parent: number | null, prefix: string) => {
    cats.filter((c) => c.parent === parent).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, "fa")).forEach((c) => {
      out.push({ id: c.id, label: prefix + c.name });
      walk(c.id, `${prefix}${c.name} › `);
    });
  };
  walk(null, "");
  return out;
}

export function ProductsList() {
  const router = useRouter();
  const params = useSearchParams();
  const store = useStore();
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [active, setActive] = useState("");
  const [stock, setStock] = useState(params.get("stock") ?? "");
  const [page, setPage] = useState(1);
  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  const qs = new URLSearchParams({ page: String(page), ...(search && { search }), ...(category && { category }), ...(active && { active }), ...(stock && { stock }) });
  const { data, setData, loading } = useAdmin<Paged<AdminProductRow>>(`/products?${qs}`);
  const { data: cats } = useAdmin<AdminCategory[]>("/categories");

  const patch = async (row: AdminProductRow, change: Partial<AdminProductRow>) => {
    setData((d) => d && { ...d, results: d.results.map((r) => (r.id === row.id ? { ...r, ...change } : r)) });
    try {
      await adminCall(`/products/${row.id}`, { method: "PATCH", body: change });
      refreshSite();
    } catch {
      setData((d) => d && { ...d, results: d.results.map((r) => (r.id === row.id ? row : r)) });
    }
  };

  return (
    <>
      <PageHead title="محصولات" sub={data ? `${faNum(data.count)} محصول` : undefined}>
        <Link href="/panel/products/new" className={s.btn}><Icon name="plus" /> محصول جدید</Link>
      </PageHead>
      <Card>
        <div className={s.toolbar}>
          <label className={s.search}>
            <Icon name="search" />
            <span className="sr-only">جستجو</span>
            <input id="product-search" className="input" placeholder="نام محصول یا کد انبار" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          </label>
          <select id="product-cat" className="input" style={{ width: "auto" }} value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }} aria-label="دسته">
            <option value="">همه‌ی دسته‌ها</option>
            {cats && categoryOptions(cats).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <select id="product-active" className="input" style={{ width: "auto" }} value={active} onChange={(e) => { setActive(e.target.value); setPage(1); }} aria-label="نمایش">
            <option value="">نمایش: همه</option>
            <option value="true">در سایت</option>
            <option value="false">پنهان</option>
          </select>
          <button type="button" className={s.tab} aria-pressed={stock === "out"} onClick={() => { setStock(stock ? "" : "out"); setPage(1); }}>دارای سایز تمام‌شده</button>
        </div>

        {data?.results.length ? (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr><th>محصول</th><th>قیمت ({store.currency_label})</th><th>موجودی</th><th>ویژه</th><th>در سایت</th><th /></tr>
              </thead>
              <tbody>
                {data.results.map((p) => (
                  <tr key={p.id} className={s.rowLink} onClick={(e) => { if (!(e.target as HTMLElement).closest("button,a")) { navStart(); router.push(`/panel/products/${p.id}`); } }}>
                    <td>
                      <span className={s.nameCell}>
                        <span className={s.thumb}><ProductMedia image={p.thumb} alt={p.name} sizes="46px" /></span>
                        <span>
                          <b>{p.name}</b>
                          <small>{p.category_name}</small>
                        </span>
                      </span>
                    </td>
                    <td className="num">
                      {faNum(p.price)}
                      {p.sale_count > 0 && <small className={s.danger} style={{ display: "block", fontSize: 11.5 }}>حراج در {faNum(p.sale_count)} تنوع</small>}
                    </td>
                    <td className="num">
                      {faNum(p.total_stock)} عدد
                      {p.out_count > 0 && <small className={s.danger} style={{ display: "block", fontSize: 11.5 }}>{faNum(p.out_count)} تنوع تمام‌شده</small>}
                      {p.variant_count === 0 && <small className={s.danger} style={{ display: "block", fontSize: 11.5 }}>رنگ و سایز ندارد</small>}
                    </td>
                    <td>
                      <button type="button" className="icon-btn" aria-pressed={p.is_featured} aria-label="محصول ویژه" onClick={() => patch(p, { is_featured: !p.is_featured })} style={{ color: p.is_featured ? "var(--accent-ink)" : "var(--faint)" }}>
                        <svg viewBox="0 0 24 24" width="20" height="20" fill={p.is_featured ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9Z" strokeLinejoin="round" /></svg>
                      </button>
                    </td>
                    <td><Switch checked={p.is_active} onChange={(v) => patch(p, { is_active: v })} label={`نمایش ${p.name} در سایت`} /></td>
                    <td><Link href={`/panel/products/${p.id}`} className={`${s.btn} ${s.btnGhost} ${s.btnSm}`}>ویرایش</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          !loading && (
            <Empty icon="grid" title="محصولی پیدا نشد">
              <Link href="/panel/products/new" className={s.btn}><Icon name="plus" /> افزودن اولین محصول</Link>
            </Empty>
          )
        )}
        {data && (data.next || data.previous) && (
          <div className={s.toolbar} style={{ justifyContent: "center", marginTop: 14, marginBottom: 0 }}>
            <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} disabled={!data.previous} onClick={() => setPage(page - 1)}>قبلی</button>
            <span className="muted num">صفحه‌ی {faNum(page)}</span>
            <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} disabled={!data.next} onClick={() => setPage(page + 1)}>بعدی</button>
          </div>
        )}
      </Card>
    </>
  );
}
