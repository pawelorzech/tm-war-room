import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";

export const metadata: Metadata = {
  title: "TM Hub",
  description: "Torn.com faction toolkit for The Masters",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "TM Hub",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192" },
      { url: "/icons/icon-512.png", sizes: "512x512" },
    ],
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: "#0d1117",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full dark">
      <body className="min-h-full bg-bg-primary text-text-primary">
        <AppShell>{children}</AppShell>
        {/* F-12: SRI hash pinned. Recompute on Umami upgrade:
            curl -fsSL https://analityka.tri.ovh/script.js | openssl dgst -sha384 -binary | openssl base64 -A */}
        <Script
          src="https://analityka.tri.ovh/script.js"
          data-website-id="c2fb3dc3-de09-432a-8332-d9ad51940c55"
          strategy="lazyOnload"
          integrity="sha384-6PHtXKae10+dZuA/fcmjkSTDco+NPBE5fZ4eS/Em2lVIsS6FdDZIgs06MBJLEcSW"
          crossOrigin="anonymous"
        />
      </body>
    </html>
  );
}
