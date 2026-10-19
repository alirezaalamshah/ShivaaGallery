import type { Metadata } from "next";
import { Suspense } from "react";

import { MyOrder } from "@/components/orders/MyOrder";

export const metadata: Metadata = { title: "جزئیات سفارش", robots: { index: false } };

export default async function OrderPage({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  return (
    <Suspense>
      <MyOrder number={decodeURIComponent(number)} />
    </Suspense>
  );
}
