import type { Metadata } from "next";

import { PanelShell } from "@/components/panel/PanelShell";

export const metadata: Metadata = { title: { default: "پنل مدیریت", template: "%s | پنل مدیریت" }, robots: { index: false, follow: false } };

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  // data-panel keeps the panel on the light theme whatever the storefront uses (see globals.css).
  return (
    <div data-panel style={{ display: "contents" }}>
      <PanelShell>{children}</PanelShell>
    </div>
  );
}
