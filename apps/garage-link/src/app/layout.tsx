import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GARAGE LINK",
  description: "中古車・バイク販売店向け業務管理SaaS",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
