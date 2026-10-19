import type { Metadata } from "next";

import { Listing, type SearchParams } from "@/components/listing/Listing";

export async function generateMetadata({ searchParams }: { searchParams: Promise<SearchParams> }): Promise<Metadata> {
  const sp = await searchParams;
  return { title: sp.on_sale ? "حراج" : "همه‌ی محصولات" };
}

export default async function ShopPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const sale = sp.on_sale === "true";
  return (
    <Listing
      title={sale ? "حراج" : "همه‌ی محصولات"}
      latin={sale ? "Sale" : "Shop"}
      searchParams={sp}
      basePath="/shop"
    />
  );
}
