export type PosVariant = { id: number; sku: string; color: string; color_hex: string; size: string; price: number; regular_price: number; stock: number };

export type PosProduct = { id: number; name: string; image: string | null; active: boolean; variants: PosVariant[] };

export type Lookup = { exact: number | null; products: PosProduct[]; max_discount: number | null };

/** One line of the ticket being rung up. */
export type TicketLine = {
  variant: number;
  product: string;
  color: string;
  colorHex: string;
  size: string;
  sku: string;
  price: number;
  stock: number;
  image: string | null;
  qty: number;
};

export type Sale = {
  id: number;
  number: string;
  created_at: string;
  status: "completed" | "voided";
  status_label: string;
  seller: string;
  customer_name: string;
  customer_phone: string;
  note: string;
  subtotal: number;
  discount: number;
  total: number;
  cash: number;
  card: number;
  transfer: number;
  void_reason: string;
  voided_at: string | null;
  item_count?: number;
  items?: { variant: number | null; product_name: string; color_name: string; size_label: string; sku: string; unit_price: number; qty: number; line_total: number }[];
};

export type DayTotals = { count: number; total: number; cash: number; card: number; transfer: number; discount: number; pieces: number; voided: number };

/** Stock of 9999 is left over from an older panel and means "count unknown". */
export const UNKNOWN_STOCK = 9999;
