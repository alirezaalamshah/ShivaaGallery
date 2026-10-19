import type { Metadata } from "next";

import { Listing, type SearchParams } from "@/components/listing/Listing";
import { SearchBox } from "@/components/SearchBox";

export const metadata: Metadata = { title: "جستجو", robots: { index: false } };

export default async function SearchPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const q = typeof sp.search === "string" ? sp.search.trim() : "";
  return (
    <>
      <div className="wrap" style={{ paddingTop: 24 }}>
        <SearchBox initial={q} />
      </div>
      {q && <Listing title={`نتیجه‌ی «${q}»`} searchParams={sp} basePath="/search" />}
    </>
  );
}
