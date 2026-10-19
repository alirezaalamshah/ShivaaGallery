import { ProductEditor } from "@/components/panel/ProductEditor";

export const metadata = { title: "ویرایش محصول" };

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  return <ProductEditor id={(await params).id} />;
}
