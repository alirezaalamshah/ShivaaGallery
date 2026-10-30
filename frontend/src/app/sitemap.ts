import type { MetadataRoute } from "next";

import { API_URL, api } from "@/lib/api";
import { SITE_URL } from "@/lib/site";
import type { CategoryNode, Page, ProductSummary } from "@/lib/types";

export const revalidate = 3600;

function flatten(nodes: CategoryNode[]): CategoryNode[] {
  return nodes.flatMap((n) => [n, ...flatten(n.children)]);
}

/** Every product page, read from the API a page at a time. */
async function allProducts() {
  const out: ProductSummary[] = [];
  for (let page = 1; page <= 50; page++) {
    const res = await fetch(`${API_URL}/products/?page=${page}`, { next: { revalidate } });
    if (!res.ok) break;
    const data = (await res.json()) as Page<ProductSummary>;
    out.push(...data.results);
    if (!data.next) break;
  }
  return out;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [categories, products] = await Promise.all([api.categories(), allProducts()]);
  const pages = ["", "/shop", "/categories", "/about", "/contact", "/terms", "/privacy", "/returns", "/track"];
  return [
    ...pages.map((p) => ({ url: `${SITE_URL}${p}`, changeFrequency: "weekly" as const, priority: p ? 0.5 : 1 })),
    ...flatten(categories).map((c) => ({ url: `${SITE_URL}/c/${encodeURIComponent(c.slug)}`, changeFrequency: "daily" as const, priority: 0.8 })),
    ...products.map((p) => ({ url: `${SITE_URL}/p/${encodeURIComponent(p.slug)}`, lastModified: p.created_at, changeFrequency: "weekly" as const, priority: 0.7 })),
  ];
}
