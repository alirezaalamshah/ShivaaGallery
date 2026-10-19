import type { Metadata } from "next";

import { CartView } from "@/components/cart/CartView";

export const metadata: Metadata = { title: "سبد خرید", robots: { index: false } };

export default function CartPage() {
  return <CartView />;
}
