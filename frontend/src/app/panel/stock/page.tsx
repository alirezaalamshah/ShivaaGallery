import { Suspense } from "react";

import { Stock } from "@/components/panel/Stock";

export const metadata = { title: "موجودی انبار" };

export default function Page() {
  return (
    <Suspense>
      <Stock />
    </Suspense>
  );
}
