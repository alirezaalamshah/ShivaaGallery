export type Store = {
  name: string;
  name_latin: string;
  tagline: string;
  logo: string | null;
  hero_title: string;
  hero_text: string;
  color_ink: string;
  color_accent: string;
  color_background: string;
  phone: string;
  instagram: string;
  city: string;
  address: string;
  currency_label: string;
  returns: { enabled: boolean; type: "refund" | "exchange"; days: number; policy: string };
};

export type Color = { id: number; name: string; hex: string };
export type CategoryBrief = { id: number; name: string; slug: string };

export type CategoryNode = CategoryBrief & {
  description: string;
  image: string | null;
  product_count: number;
  children: CategoryNode[];
};

export type ProductSummary = {
  id: number;
  slug: string;
  name: string;
  category: CategoryBrief;
  price: number;
  sale_price: number | null;
  current_price: number;
  discount_percent: number;
  image: string | null;
  colors: Color[];
  in_stock: boolean;
  is_featured: boolean;
  created_at: string;
};

export type Variant = {
  id: number;
  sku: string;
  color: number;
  size_id: number;
  size: string;
  price: number;
  in_stock: boolean;
  low_stock: boolean;
};

export type SizeGuide = { columns?: string[]; rows?: string[][]; note?: string };

export type ProductDetail = ProductSummary & {
  description: string;
  details: string[];
  images: { image: string; color: number | null; alt: string }[];
  variants: Variant[];
  sizes: { id: number; label: string }[];
  size_guide: SizeGuide;
  breadcrumbs: CategoryBrief[];
};

export type Page<T> = { count: number; next: string | null; previous: string | null; results: T[] };

export type Facets = {
  colors: Color[];
  size_systems: { id: number; name: string; sizes: { id: number; label: string }[] }[];
};
