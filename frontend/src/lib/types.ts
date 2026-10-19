export type Store = {
  name: string;
  name_latin: string;
  tagline: string;
  logo: string | null;
  hero_title: string;
  hero_text: string;
  about_title: string;
  about_text: string;
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
  cover: string | null;
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

export type ShippingMethod = { id: number; name: string; description: string; fee: number; only_city: string };
export type Address = { id: number; receiver_name: string; city: string; address: string; postal_code: string };

export type OrderStatus = "awaiting_payment" | "paid" | "processing" | "shipped" | "delivered" | "cancelled";

export type OrderItem = {
  product_slug: string;
  product_name: string;
  color_name: string;
  size_label: string;
  sku: string;
  image: string;
  unit_price: number;
  qty: number;
  line_total: number;
};

export type Order = {
  number: string;
  status: OrderStatus;
  status_label: string;
  created_at: string;
  receiver_name: string;
  phone: string;
  city: string;
  address?: string;
  postal_code?: string;
  note?: string;
  shipping_name: string;
  shipping_fee: number;
  subtotal: number;
  discount_code: string;
  discount_amount: number;
  total: number;
  tracking_code: string;
  items: OrderItem[];
  events: { status: OrderStatus; label: string; note: string; created_at: string }[];
};

export type OrderSummary = Pick<Order, "number" | "status" | "status_label" | "created_at" | "total"> & {
  item_count: number;
  first_image: string | null;
};

export type Quote = {
  lines: { variant: number; qty: number; available: number; unit_price: number; ok: boolean }[];
  subtotal: number;
  shipping_fee: number;
  discount: number;
  total: number;
  discount_error?: string | null;
};
