import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";

export const metadata: Metadata = {
  title: "TM Hub",
  description: "Torn.com faction toolkit for The Masters",
};

export const viewport: Viewport = {
  viewportFit: "cover",
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
        <Script
          src="https://analityka.tri.ovh/script.js"
          data-website-id="c2fb3dc3-de09-432a-8332-d9ad51940c55"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
