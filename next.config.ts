import type { NextConfig } from "next";

const withPWA = require("next-pwa")({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  buildExcludes: [/middleware-manifest\.json$/],
  runtimeCaching: [
    {
      urlPattern: /^https?.*/,
      handler: "NetworkFirst",
      options: {
        cacheName: "offlineCache",
        expiration: {
          maxEntries: 200,
          maxAgeSeconds: 30 * 24 * 60 * 60,
        },
      },
    },
  ],
});

const nextConfig: NextConfig = {
  // Cloudflare Pages 静态导出（官方 Next.js Static HTML Export 预设）
  output: "export",
  images: {
    unoptimized: true,
  },
  // 与 Pages 路由行为对齐，避免 /focus 与 /focus/ 不一致
  trailingSlash: true,
};

export default withPWA(nextConfig);
