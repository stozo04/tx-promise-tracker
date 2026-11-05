import type { NextConfig } from "next";

const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : "bqyfplifeyvkilkoneph.supabase.co";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // The preview is opened at 127.0.0.1. Next only allows localhost by default,
  // and a blocked dev socket keeps the page from hydrating.
  allowedDevOrigins: ["127.0.0.1"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: supabaseHost,
        pathname: "/storage/v1/object/public/tx-campaign-archives/**",
      },
    ],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
