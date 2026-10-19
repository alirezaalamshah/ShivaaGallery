"use client";

import { usePathname } from "next/navigation";

/** Storefront header, footer and bottom nav — everywhere except the admin panel, which has its own frame. */
export function SiteChrome({
  header,
  footer,
  nav,
  children,
}: {
  header: React.ReactNode;
  footer: React.ReactNode;
  nav: React.ReactNode;
  children: React.ReactNode;
}) {
  const inPanel = usePathname().startsWith("/panel");
  if (inPanel) return <>{children}</>;
  return (
    <>
      {header}
      <main id="main">{children}</main>
      {footer}
      {nav}
    </>
  );
}
