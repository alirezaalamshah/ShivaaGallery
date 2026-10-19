import { OrderDetail } from "@/components/panel/Orders";

export const metadata = { title: "سفارش" };

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  return <OrderDetail id={(await params).id} />;
}
