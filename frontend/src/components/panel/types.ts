import type { Order, OrderStatus } from "@/lib/types";

export type AdminOrderRow = {
  id: number;
  number: string;
  receiver_name: string;
  phone: string;
  city: string;
  total: number;
  status: OrderStatus;
  status_label: string;
  item_count: number;
  shipping_name: string;
  created_at: string;
};

export type AdminOrder = Order & {
  id: number;
  user: number;
  admin_note: string;
  next_statuses: { value: OrderStatus; label: string }[];
  /** Amounts are in rial, as the gateway charged them. */
  payments: { status: "pending" | "paid" | "failed"; status_label: string; amount: number; ref_id: string; card: string; created_at: string }[];
  /** How many orders this customer has placed in all. */
  customer_orders: number;
};

export type AdminColor = { id: number; name: string; hex: string; sort: number; in_use: boolean };
export type AdminSize = { id?: number; label: string; sort?: number };
export type AdminSizeSystem = { id: number; name: string; sizes: AdminSize[] };

export type AdminCategory = {
  id: number;
  parent: number | null;
  name: string;
  slug: string;
  description: string;
  image: string | null;
  size_system: number | null;
  size_guide: { columns?: string[]; rows?: string[][]; note?: string };
  sort: number;
  is_active: boolean;
  product_count: number;
};

export type AdminImage = { id: number; image: string; color: number | null; alt: string; sort: number };

export type AdminVariant = {
  id: number;
  color: number;
  color_name: string;
  color_hex: string;
  size: number;
  size_label: string;
  sku: string;
  price_override: number | null;
  sale_price: number | null;
  regular_price: number;
  price: number;
  stock: number;
  is_active: boolean;
};

export type AdminProduct = {
  id: number;
  name: string;
  slug: string;
  category: number;
  description: string;
  details: string[];
  price: number;
  is_active: boolean;
  is_featured: boolean;
  created_at: string;
  images: AdminImage[];
  variants: AdminVariant[];
};

export type AdminProductRow = {
  id: number;
  name: string;
  slug: string;
  category: number;
  category_name: string;
  price: number;
  sale_count: number;
  is_active: boolean;
  is_featured: boolean;
  thumb: string | null;
  total_stock: number;
  variant_count: number;
  out_count: number;
  created_at: string;
};

export type Paged<T> = { count: number; next: string | null; previous: string | null; results: T[] };
