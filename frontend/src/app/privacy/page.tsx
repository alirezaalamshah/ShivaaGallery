import type { Metadata } from "next";

import { TextPage } from "@/components/TextPage";
import { api } from "@/lib/api";
import { defaultPrivacy } from "@/lib/legal";

export const metadata: Metadata = { title: "حریم خصوصی" };

export default async function PrivacyPage() {
  const store = await api.store();
  return <TextPage title="حریم خصوصی" latin="Privacy" text={store.privacy_text || defaultPrivacy(store)} />;
}
