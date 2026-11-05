import type { NextConfig } from "next";

const publicApi = new URL(process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000/api");
const internalApi = (process.env.INTERNAL_API_URL ?? publicApi.href).replace(/\/$/, "");
const backendOrigin = new URL(internalApi).origin;

// Shared hosting caps how many processes one account may start, and the build
// otherwise starts one per CPU of the whole server. `npm run build:server` sets
// this to 1 (see deploy/README.md); a normal build is unchanged.
const buildCpus = Number(process.env.NEXT_BUILD_CPUS) || 0;

const nextConfig: NextConfig = {
  // Do not turn on experimental.inlineCss: it puts every style in each page twice (home page
  // 156 KB -> 419 KB), and unlike a separate CSS file that copy is never kept by the browser.
  ...(buildCpus && { experimental: { cpus: buildCpus, webpackBuildWorker: false } }),
  images: {
    // Every photo is resized on the server the first time a size is asked for, which is heavy
    // on shared hosting. Fewer sizes mean fewer resizes and a smaller srcset in every page;
    // uploaded files never change (a new upload gets a new name), so a resized copy is kept a month.
    deviceSizes: [640, 828, 1080, 1200, 1920],
    imageSizes: [48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 60 * 60 * 24 * 30,
    remotePatterns: [
      {
        protocol: publicApi.protocol.replace(":", "") as "http" | "https",
        hostname: publicApi.hostname,
        port: publicApi.port,
        pathname: "/media/**",
      },
    ],
  },
  // The browser talks to Django through the site's own origin, so the session
  // cookie is first-party and CSRF protection works without CORS credentials.
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${internalApi}/:path*/` },
      { source: "/media/:path*", destination: `${backendOrigin}/media/:path*` },
    ];
  },
};

export default nextConfig;
