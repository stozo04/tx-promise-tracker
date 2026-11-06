import type { Metadata } from "next";
import { Figtree, Fraunces } from "next/font/google";

import { SiteFooter } from "@/components/site-footer";
import { ExternalLinksInNewTab } from "@/components/external-links";
import { SiteHeader } from "@/components/site-header";
import { ThemeProvider } from "@/components/theme-provider";
import { loadLedger } from "@/lib/queries";
import { INDEPENDENT_DISCLAIMER, SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";

import "./globals.css";

const figtree = Figtree({
  subsets: ["latin"],
  variable: "--font-figtree",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
});

export const metadata: Metadata = {
  metadataBase: process.env.NEXT_PUBLIC_SITE_URL
    ? new URL(process.env.NEXT_PUBLIC_SITE_URL)
    : undefined,
  title: {
    default: SITE_NAME,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  openGraph: {
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    type: "website",
  },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const ledger = await loadLedger();

  return (
    <html lang="en" className={`${figtree.variable} ${fraunces.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="flex min-h-full flex-col">
        <ThemeProvider>
          <ExternalLinksInNewTab />
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-card focus:px-4 focus:py-2"
          >
            Skip to content
          </a>
          <SiteHeader politicians={ledger.politicians.map((politician) => ({
            name: politician.name,
            slug: politician.slug,
            office: politician.office,
          }))} />
          <main id="main" className="flex-1">
            {children}
          </main>
          <SiteFooter />
          <p className="sr-only">{INDEPENDENT_DISCLAIMER}</p>
        </ThemeProvider>
      </body>
    </html>
  );
}
