export type Store = {
  name: string;
  name_latin: string;
  tagline: string;
  logo: string | null;
  hero_title: string;
  hero_text: string;
  about_title: string;
  about_text: string;
  /** A ready-made color theme; the admin panel always stays on "day". */
  theme: "day" | "night";
  phone: string;
  landline: string;
  instagram: string;
  city: string;
  address: string;
  currency_label: string;
  returns: { enabled: boolean; type: "refund" | "exchange"; days: number; policy: string };
  terms_text: string;
  privacy_text: string;
  working_hours: string;
  enamad_id: string;
  enamad_code: string;
  /** A payment gateway is connected; otherwise the store arranges payment by phone. */
  online_payment: boolean;
  /** Live text campaigns for the line above every page. */
  announcements: { id: number; title: string; text: string; link: string }[];
};

export type Banner = { id: number; title: string; text: string; image: string | null; link: string; button_label: string };

/** The admin's picks for the home page ring (empty: the site chooses) and the live banners. */
export type Home = { hero: ProductSummary[]; banners: Banner[] };

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
  /** The first photo marked for each color, keyed by color id. */
  color_images: Record<string, string>;
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
  regular_price: number;
  in_stock: boolean;
  low_stock: boolean;
  /** How many are left, only when it is a few. */
  left: number | null;
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

export type ShippingMethod = { id: number; name: string; description: string; fee: number; only_city: string; needs_postal_code: boolean };
export type Address = { id: number; receiver_name: string; receiver_phone: string; province: string; city: string; address: string; postal_code: string };

export type OrderStatus = "awaiting_payment" | "paid" | "processing" | "shipped" | "delivered" | "cancelled";

export type OrderItem = {
  id: number;
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
  receiver_phone?: string;
  phone: string;
  province?: string;
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
  payment_deadline: string | null;
  paid_at: string | null;
  /** Online payment is on and this order can still be paid. */
  can_pay: boolean;
  items: OrderItem[];
  events: { status: OrderStatus; label: string; note: string; created_at: string }[];
  returns?: ReturnRequest[];
  /** Only for shipped or delivered orders: whether a return can be asked for now. */
  return_window?: { deadline: string | null; can: boolean; problem: string | null } | null;
};

export type ReturnStatus = "pending" | "approved" | "rejected" | "completed";

export type ReturnRequest = {
  id: number;
  reason: string;
  reason_label: string;
  wants: "refund" | "exchange";
  wants_label: string;
  text: string;
  status: ReturnStatus;
  status_label: string;
  admin_note: string;
  created_at: string;
  updated_at: string;
  items: { item: number; product_name: string; color_name: string; size_label: string; image: string; qty: number }[];
};

export type Review = { id: number; rating: number; text: string; author: string; reply: string; created_at: string };

export type Reviews = {
  average: number | null;
  count: number;
  items: Review[];
  can_review: boolean;
  mine: (Review & { status: "pending" | "approved" | "rejected"; status_label: string }) | null;
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
