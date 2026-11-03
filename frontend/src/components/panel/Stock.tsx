"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Icon } from "@/components/Icon";
import { ProductMedia } from "@/components/ProductMedia";
import { useToast } from "@/components/Toast";
import { faNum } from "@/lib/format";

import { adminCall, refreshSite, useAdmin } from "./hooks";
import { useCan } from "./access";
import type { Paged } from "./types";
import { Card, Empty, PageHead, Pager } from "./ui";
import s from "./panel.module.css";

type Row = {
  id: number;
  product_id: number;
  product: string;
  product_active: boolean;
  color_name: string;
  color_hex: string;
  size_label: string;
  sku: string;
  price: number;
  stock: number;
  thumb: string | null;
};


const LEGACY_STOCK = 9999;

/** Rows of one page grouped under their product, keeping the API's order. */
function byProduct(rows: Row[]) {
  const groups: { id: number; name: string; active: boolean; thumb: string | null; rows: Row[] }[] = [];
  for (const r of rows) {
    const last = groups[groups.length - 1];
    if (last?.id === r.product_id) last.rows.push(r);
    else groups.push({ id: r.product_id, name: r.product, active: r.product_active, thumb: r.thumb, rows: [r] });
  }
  return groups;
}

/**
 * Stock is shared by the shop and the site. New pieces are added here; in-store sales are
 * recorded at the till (/panel/pos), so the site never sells a piece that is already gone.
 */
export function Stock() {
  const toast = useToast();
  const params = useSearchParams();
  const [low, setLow] = useState(params.get("stock") === "low");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<number | null>(null);
  const can = useCan();
  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  const qs = new URLSearchParams({ page: String(page), ...(search && { search }), ...(low && { stock: "low" }) });
  const { data, setData, loading } = useAdmin<Paged<Row>>(`/variants?${qs}`);

  const receive = async (row: Row) => {
    setBusy(row.id);
    try {
      const fresh = await adminCall<Row>(`/variants/${row.id}/move`, { method: "POST", body: { kind: "receive", qty: 1 } });
      setData((d) => (d ? { ...d, results: d.results.map((r) => (r.id === row.id ? fresh : r)) } : d));
      toast({ text: `یک عدد ${row.product}، ${row.color_name}، سایز ${row.size_label} به موجودی اضافه شد` });
      refreshSite();
    } catch (e) {
      toast({ text: e instanceof Error ? e.message : "ثبت نشد." });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHead title="موجودی انبار" sub="موجودی مغازه و سایت یکی است. جنس تازه را این‌جا اضافه کنید. فروش مغازه را در صندوق ثبت کنید تا سایت آن را نفروشد.">
        {can("pos.sell") && <Link href="/panel/pos" className={s.btn}><Icon name="card" /> صندوق فروش</Link>}
        {can("stock.history") && <Link href="/panel/inventory" className={`${s.btn} ${s.btnGhost}`}>دفتر موجودی</Link>}
      </PageHead>
      <Card>
        <div className={s.toolbar}>
          <div className={s.tabs} role="group" aria-label="نمایش">
            <button type="button" className={s.tab} aria-pressed={!low} onClick={() => { setLow(false); setPage(1); }}>همه</button>
            <button type="button" className={s.tab} aria-pressed={low} onClick={() => { setLow(true); setPage(1); }}>رو به اتمام و تمام‌شده</button>
          </div>
          <label className={s.search}>
            <Icon name="search" />
            <span className="sr-only">جستجو</span>
            <input id="stock-search" className="input" placeholder="نام محصول، رنگ یا سایز" value={q} autoFocus onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          </label>
        </div>

        {data?.results.length ? (
          <div className={s.stockList}>
            {byProduct(data.results).map((g) => (
              <section key={g.id} className={s.stockGroup}>
                <header>
                  <span className={s.thumb}><ProductMedia image={g.thumb} alt={g.name} sizes="46px" /></span>
                  {can("products.view") ? <Link href={`/panel/products/${g.id}`}><b>{g.name}</b></Link> : <b>{g.name}</b>}
                  {!g.active && <small className="muted">(در سایت نمایش داده نمی‌شود)</small>}
                </header>
                <ul>
                  {g.rows.map((r) => {
                    const unknown = r.stock >= LEGACY_STOCK;
                    return (
                      <li key={r.id}>
                        <span className={s.stockWhat}>
                          <i style={{ background: r.color_hex }} />
                          {r.color_name}، سایز <b className="num">{r.size_label}</b>
                        </span>
                        <span className={`${s.stockCount} num ${r.stock === 0 ? s.danger : ""}`}>
                          {unknown ? "؟" : r.stock === 0 ? "تمام شد" : `${faNum(r.stock)} عدد`}
                        </span>
                        <span className={s.stockBtns}>
                          {can("stock.edit") && (
                          <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} disabled={busy === r.id} onClick={() => receive(r)} aria-label={`یک عدد به ${r.product} ${r.color_name} سایز ${r.size_label} اضافه کن`}>
                            <Icon name="plus" /> ۱
                          </button>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          !loading && <Empty icon="grid" title={search ? "چیزی پیدا نشد" : "رنگ و سایزی ثبت نشده"} />
        )}

        {data && <Pager page={page} pages={data.pages} onChange={setPage} />}
        <p className="hint" style={{ marginTop: 14 }}>
          «+۱» یک عدد اضافه می‌کند. برای عوض کردن چند عدد با هم یا تعریف رنگ و سایز جدید، محصول را باز کنید. فروش مغازه را در صندوق ثبت کنید تا فاکتور و گزارش روزانه داشته باشد. همه‌ی تغییرها در دفتر موجودی ثبت می‌شوند.
        </p>
      </Card>
    </>
  );
}
