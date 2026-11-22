import type { NextConfig } from "next";
import { SITE_ARCHIVE_ASSET_EXTENSIONS, siteArchiveBase } from "./lib/site-archive";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://bqyfplifeyvkilkoneph.supabase.co";
const supabaseHost = new URL(supabaseUrl).hostname;

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // The preview is opened at 127.0.0.1. Next only allows localhost by default,
  // and a blocked dev socket keeps the page from hydrating.
  allowedDevOrigins: ["127.0.0.1"],
  async rewrites() {
    return {
      beforeFiles: [],
      afterFiles: [
        {
          source: `/archive/:asset(.+\\.(?:${SITE_ARCHIVE_ASSET_EXTENSIONS.join("|")}))`,
          destination: `${siteArchiveBase(supabaseUrl)}/:asset`,
        },
      ],
      fallback: [],
    };
  },
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
