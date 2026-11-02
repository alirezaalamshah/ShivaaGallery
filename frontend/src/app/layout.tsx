import type { Metadata, Viewport } from "next";

import { AuthProvider } from "@/components/auth/AuthProvider";
import { BottomNav } from "@/components/BottomNav";
import { CartProvider } from "@/components/cart/CartProvider";
import { ToastProvider } from "@/components/Toast";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { NavProgress } from "@/components/NavProgress";
import { ScrollReveal } from "@/components/ScrollReveal";
import { AnnouncementBar } from "@/components/AnnouncementBar";
import { SiteChrome } from "@/components/SiteChrome";
import { SmoothScroll } from "@/components/SmoothScroll";
import { StoreProvider } from "@/components/StoreProvider";
import { api } from "@/lib/api";

import "./fonts/fonts.css";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const store = await api.store();
  return {
    title: { default: store.tagline ? `${store.name} | ${store.tagline}` : store.name, template: `%s | ${store.name}` },
    description: store.hero_text || store.tagline,
    icons: store.logo ? { icon: store.logo, apple: store.logo } : undefined,
    openGraph: { siteName: store.name, locale: "fa_IR", type: "website" },
  };
}

export async function generateViewport(): Promise<Viewport> {
  const store = await api.store();
  return { themeColor: store.theme === "night" ? "#0e0c0a" : "#e5d7c1", viewportFit: "cover", width: "device-width", initialScale: 1 };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [store, categories] = await Promise.all([api.store(), api.categories()]);
  return (
    <html lang="fa" dir="rtl" data-theme={store.theme}>
      <body>
        <StoreProvider store={store}>
          <AuthProvider>
          <CartProvider>
            <ToastProvider>
              <SiteChrome
                header={<><AnnouncementBar items={store.announcements ?? []} /><Header store={store} categories={categories} /></>}
                footer={<Footer store={store} categories={categories} />}
                nav={<BottomNav />}
              >
                {children}
              </SiteChrome>
              <NavProgress />
              <ScrollReveal />
              <SmoothScroll />
            </ToastProvider>
          </CartProvider>
          </AuthProvider>
        </StoreProvider>
      </body>
    </html>
  );
}
