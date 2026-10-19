import type { Metadata } from "next";

import { AccountView } from "@/components/account/AccountView";

export const metadata: Metadata = { title: "حساب من", robots: { index: false } };

export default function AccountPage() {
  return <AccountView />;
}
