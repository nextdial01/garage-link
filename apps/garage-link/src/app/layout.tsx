import type { Metadata } from "next";
import { GarageAnalytics } from "@/components/analytics/GarageAnalytics";
import "./globals.css";

const metadataBase = new URL("https://garage-link.tech");

export const metadata: Metadata = {
  metadataBase,
  verification: {
    google: "JBNIm9scPumEg0iyblwGmf9salq9Ch-tBLdFGQe6KlU",
  },
  title: {
    default: "GARAGE LINK",
    template: "%s | GARAGE LINK",
  },
  description:
    "中古車販売店・バイクショップ・整備工場の在庫、顧客、商談、見積、請求、整備をひとつにまとめる店舗管理ツールです。",
  applicationName: "GARAGE LINK",
  icons: {
    icon: [
      {
        url: "/search-icon.svg",
        type: "image/svg+xml",
        sizes: "64x64",
      },
    ],
  },
  openGraph: {
    title: "GARAGE LINK",
    description:
      "中古車販売店・バイクショップ・整備工場の在庫、顧客、商談、見積、請求、整備をひとつにまとめる店舗管理ツールです。",
    siteName: "GARAGE LINK",
    type: "website",
    url: "/",
    images: [
      {
        url: "/branding/garage-link-logo.png",
        width: 1058,
        height: 444,
        alt: "GARAGE LINK",
      },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        {children}
        <GarageAnalytics />
      </body>
    </html>
  );
}
