import type { NextConfig } from "next";

const publicApi = new URL(process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000/api");
const internalApi = (process.env.INTERNAL_API_URL ?? publicApi.href).replace(/\/$/, "");
const backendOrigin = new URL(internalApi).origin;

// Shared hosting caps how many processes one account may start, and the build
// otherwise starts one per CPU of the whole server. `npm run build:server` sets
// this to 1 (see deploy/README.md); a normal build is unchanged.
const buildCpus = Number(process.env.NEXT_BUILD_CPUS) || 0;

const nextConfig: NextConfig = {
  ...(buildCpus && { experimental: { cpus: buildCpus, webpackBuildWorker: false } }),
  images: {
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
