import type { Metadata } from "next";

import { TextPage } from "@/components/TextPage";
import { api } from "@/lib/api";
import { defaultTerms } from "@/lib/legal";

export const metadata: Metadata = { title: "قوانین و مقررات" };

export default async function TermsPage() {
  const store = await api.store();
  return <TextPage title="قوانین و مقررات" latin="Terms" text={store.terms_text || defaultTerms(store)} />;
}
