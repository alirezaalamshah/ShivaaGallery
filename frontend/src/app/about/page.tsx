import type { Metadata } from "next";
import Link from "next/link";

import { TextPage } from "@/components/TextPage";
import { api } from "@/lib/api";

export const metadata: Metadata = { title: "درباره‌ی ما" };

export default async function AboutPage() {
  const store = await api.store();
  return (
    <TextPage
      title={store.about_title || `درباره‌ی ${store.name}`}
      latin="About"
      lead={store.tagline}
      text={store.about_text || `${store.name}${store.city ? `، فروشگاه پوشاک زنانه در ${store.city}` : ""}. مدل‌های سایت همان مدل‌های فروشگاه حضوری ما هستند.`}
    >
      <p>
        <Link href="/contact" className="btn btn-ink">تماس با ما</Link>
      </p>
    </TextPage>
  );
}
