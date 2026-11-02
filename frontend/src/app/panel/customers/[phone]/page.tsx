import { CustomerDetail } from "@/components/panel/Customers";

export const metadata = { title: "مشتری" };

export default async function CustomerPage({ params }: { params: Promise<{ phone: string }> }) {
  return <CustomerDetail phone={(await params).phone} />;
}
