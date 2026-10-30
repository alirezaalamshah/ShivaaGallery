import { Suspense } from "react";

import { Pos } from "@/components/panel/pos/Pos";

export const metadata = { title: "صندوق فروش حضوری" };

export default function Page() {
  return (
    <Suspense>
      <Pos />
    </Suspense>
  );
}
