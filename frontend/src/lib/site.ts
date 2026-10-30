/** The storefront's public address, for links that leave the site (sitemap, robots). */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3100").replace(/\/$/, "");
