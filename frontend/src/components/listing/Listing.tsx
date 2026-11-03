import Link from "next/link";

import { ProductCard } from "@/components/ProductCard";
import { api, toQuery } from "@/lib/api";
import { faNum } from "@/lib/format";
import { pageWindow } from "@/lib/paging";
import type { CategoryNode } from "@/lib/types";

import { FilterBar } from "./FilterBar";
import styles from "./Listing.module.css";

export type SearchParams = Record<string, string | string[] | undefined>;

const FILTER_KEYS = ["color", "size", "min_price", "max_price", "in_stock", "on_sale", "ordering", "search", "page"] as const;

export function readFilters(sp: SearchParams) {
  const out: Record<string, string> = {};
  for (const key of FILTER_KEYS) {
    const v = sp[key];
    const s = Array.isArray(v) ? v[0] : v;
    if (s) out[key] = s;
  }
  return out;
}

export async function Listing({
  title,
  latin,
  intro,
  category,
  siblings,
  searchParams,
  basePath,
}: {
  title: string;
  latin?: string;
  intro?: string;
  category?: CategoryNode;
  siblings?: CategoryNode[];
  searchParams: SearchParams;
  basePath: string;
}) {
  const filters = readFilters(searchParams);
  const [page, facets] = await Promise.all([
    api.products({ ...filters, category: category?.slug }),
    api.facets(),
  ]);
  const current = Number(filters.page ?? 1);
  const pages = page.pages;
  const pageHref = (n: number) => `${basePath}${toQuery({ ...filters, page: n > 1 ? n : undefined })}`;

  return (
    <div className={`wrap ${styles.page}`}>
      <header className={styles.head}>
        {latin && <span className="latin">{latin}</span>}
        <h1 className="page-title">{title}</h1>
        {intro && <p>{intro}</p>}
      </header>

      {siblings && siblings.length > 0 && (
        <nav className="chips" aria-label="زیردسته‌ها">
          {siblings.map((c) => (
            <Link key={c.id} href={`/c/${c.slug}`} className="chip" aria-current={c.slug === category?.slug ? "page" : undefined}>
              {c.name}
              <span className="num" style={{ opacity: 0.6 }}>{faNum(c.product_count)}</span>
            </Link>
          ))}
        </nav>
      )}

      <FilterBar facets={facets} count={page.count} />

      {page.results.length ? (
        <div className="grid" data-reveal-group>
          {page.results.map((p, i) => (
            <ProductCard key={p.id} product={p} priority={i < 2} />
          ))}
        </div>
      ) : (
        <div className={styles.empty}>
          <h2>محصولی با این فیلترها پیدا نشد</h2>
          <p>چند فیلتر را بردار یا همه‌ی محصولات را ببین.</p>
          <Link href={basePath} className="btn btn-ink">
            حذف فیلترها
          </Link>
        </div>
      )}

      {pages > 1 && (
        <nav className={styles.pager} aria-label="صفحه‌ها">
          {pageWindow(current, pages).map((n, i) =>
            n === null ? (
              <span key={`gap-${i}`} className={styles.gap}>…</span>
            ) : (
              <Link key={n} href={pageHref(n)} className="chip num" aria-current={n === current ? "page" : undefined}>
                {faNum(n)}
              </Link>
            ),
          )}
        </nav>
      )}
    </div>
  );
}
