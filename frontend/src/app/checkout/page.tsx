import type { Metadata } from "next";

import { Checkout } from "@/components/checkout/Checkout";

export const metadata: Metadata = { title: "تسویه‌حساب", robots: { index: false } };

export default function CheckoutPage() {
  return <Checkout />;
}
