import { Suspense } from "react";

import { PanelLogin } from "@/components/panel/PanelLogin";

export const metadata = { title: "ورود" };

export default function PanelLoginPage() {
  return (
    <Suspense>
      <PanelLogin />
    </Suspense>
  );
}
