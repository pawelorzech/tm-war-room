import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TM Hub",
  description: "Torn.com faction toolkit for The Masters",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full dark">
      <body className="min-h-full bg-bg-primary text-text-primary">
        {children}
      </body>
    </html>
  );
}
