import { Receipt } from "@/components/panel/pos/Receipt";

export const metadata = { title: "چاپ فاکتور فروش" };

export default async function PrintPage({ params }: { params: Promise<{ id: string }> }) {
  return <Receipt id={(await params).id} />;
}
