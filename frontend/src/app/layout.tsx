import type { Metadata, Viewport } from "next";
import type { CSSProperties } from "react";

import { AuthProvider } from "@/components/auth/AuthProvider";
import { BottomNav } from "@/components/BottomNav";
import { CartProvider } from "@/components/cart/CartProvider";
import { ToastProvider } from "@/components/Toast";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { ScrollReveal } from "@/components/ScrollReveal";
import { SiteChrome } from "@/components/SiteChrome";
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
  return { themeColor: store.color_background, viewportFit: "cover", width: "device-width", initialScale: 1 };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [store, categories] = await Promise.all([api.store(), api.categories()]);
  const theme = {
    "--ink": store.color_ink,
    "--accent": store.color_accent,
    "--ground": store.color_background,
  } as CSSProperties;

  return (
    <html lang="fa" dir="rtl" style={theme}>
      <body>
        <StoreProvider store={store}>
          <AuthProvider>
          <CartProvider>
            <ToastProvider>
              <SiteChrome
                header={<Header store={store} categories={categories} />}
                footer={<Footer store={store} categories={categories} />}
                nav={<BottomNav />}
              >
                {children}
              </SiteChrome>
              <ScrollReveal />
            </ToastProvider>
          </CartProvider>
          </AuthProvider>
        </StoreProvider>
      </body>
    </html>
  );
}
