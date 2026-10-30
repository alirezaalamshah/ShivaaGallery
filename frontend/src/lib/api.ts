import { notFound } from "next/navigation";

import type { CategoryNode, Facets, Page, ProductDetail, ProductSummary, Store } from "./types";

/** Server components call the API directly; the browser uses the public URL. */
export const API_URL =
  (typeof window === "undefined" ? process.env.INTERNAL_API_URL : undefined) ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://127.0.0.1:8000/api";

type Query = Record<string, string | number | boolean | undefined | null>;

export function toQuery(params: Query = {}) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") qs.set(key, String(value));
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}

async function get<T>(path: string, revalidate = 60): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { next: { revalidate } });
  if (res.status === 404) notFound();
  if (!res.ok) throw new Error(`API ${res.status} for ${path}`);
  return res.json() as Promise<T>;
}

export const api = {
  store: () => get<Store>("/store/", 300),
  categories: () => get<CategoryNode[]>("/categories/", 300),
  facets: () => get<Facets>("/facets/", 300),
  products: (params: Query = {}) => get<Page<ProductSummary>>(`/products/${toQuery(params)}`),
  product: (slug: string) => get<ProductDetail>(`/products/${encodeURIComponent(slug)}/`),
  related: (slug: string) => get<ProductSummary[]>(`/products/${encodeURIComponent(slug)}/related/`),
};

export function findCategory(nodes: CategoryNode[], slug: string): CategoryNode | undefined {
  for (const node of nodes) {
    if (node.slug === slug) return node;
    const hit = findCategory(node.children, slug);
    if (hit) return hit;
  }
}
