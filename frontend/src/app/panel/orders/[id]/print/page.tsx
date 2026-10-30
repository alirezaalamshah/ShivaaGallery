import { OrderPrint } from "@/components/panel/OrderPrint";

export const metadata = { title: "چاپ سفارش" };

export default async function PrintPage({ params }: { params: Promise<{ id: string }> }) {
  return <OrderPrint id={(await params).id} />;
}
