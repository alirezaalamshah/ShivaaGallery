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
  birthday_discount?: boolean;
  /** Value of pieces taken back from earlier tickets. */
  returned_total: number;
  /** Negative: money handed back to the customer. */
  total: number;
  cash: number;
  card: number;
  transfer: number;
  void_reason: string;
  voided_at: string | null;
  item_count?: number;
  returned_count?: number;
  items?: { variant: number | null; product_name: string; color_name: string; size_label: string; sku: string; unit_price: number; qty: number; line_total: number }[];
  returns?: { from_sale: string; from_sale_id: number; product_name: string; color_name: string; size_label: string; sku: string; unit_refund: number; qty: number; line_total: number }[];
};

export type DayTotals = {
  count: number; total: number; cash: number; card: number; transfer: number; discount: number; returned: number;
  pieces: number; pieces_returned: number; voided: number;
};

/** An earlier ticket the customer can bring pieces back from. */
export type Returnable = {
  id: number;
  number: string;
  created_at: string;
  seller: string;
  customer_name: string;
  customer_phone: string;
  total: number;
  /** Why the seller may not take pieces back (too old, store policy), or null. */
  problem: string | null;
  items: { id: number; product_name: string; color_name: string; size_label: string; sku: string; qty: number; returnable: number; paid_unit: number }[];
};

/** A piece being taken back on the open ticket. */
export type BackLine = { item: number; fromSale: string; product: string; color: string; size: string; unit: number; qty: number; max: number };

export type Drawer = {
  day: string; opening_cash: number; cash_sales: number; cash_expenses: number; expected_cash: number;
  card_total: number; transfer_total: number; sale_count: number;
};

export type TillCloseRow = {
  day: string; opening_cash: number; cash_sales: number; cash_expenses: number; expected_cash: number; counted_cash: number; difference: number;
  card_total: number; counted_card: number | null; transfer_total: number; left_in_drawer: number; note: string; closed_by: string; closed_at: string;
};

/** A ticket that only takes pieces back is a return; one that also hands pieces out is an exchange. */
export const saleKind = (lines: number, back: number) => (back ? (lines ? "exchange" : "return") : "sale");

export const KIND_LABEL = { sale: "فروش", return: "مرجوعی", exchange: "تعویض" } as const;

/** Stock of 9999 is left over from an older panel and means "count unknown". */
export const UNKNOWN_STOCK = 9999;
