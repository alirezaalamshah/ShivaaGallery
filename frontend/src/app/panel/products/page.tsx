import { Suspense } from "react";

import { ProductsList } from "@/components/panel/Products";

export const metadata = { title: "محصولات" };

export default function ProductsPage() {
  return (
    <Suspense>
      <ProductsList />
    </Suspense>
  );
}
