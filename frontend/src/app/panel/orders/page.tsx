import { Suspense } from "react";

import { OrdersList } from "@/components/panel/Orders";

export const metadata = { title: "سفارش‌ها" };

export default function OrdersPage() {
  return (
    <Suspense>
      <OrdersList />
    </Suspense>
  );
}
