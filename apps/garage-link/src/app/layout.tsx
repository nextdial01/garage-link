import type { Metadata } from "next";
import { GarageAnalytics } from "@/components/analytics/GarageAnalytics";
import { BRAND } from "@/lib/brand";
import "./globals.css";

const metadataBase = new URL(BRAND.canonicalUrl);
const isStagingDeployment = process.env.GARAGE_DEPLOYMENT_ENV === "staging";

export const metadata: Metadata = {
  metadataBase,
  verification: {
    google: "JBNIm9scPumEg0iyblwGmf9salq9Ch-tBLdFGQe6KlU",
  },
  title: {
    default: BRAND.serviceName,
    template: `%s | ${BRAND.serviceName}`,
  },
  description: BRAND.description,
  applicationName: BRAND.serviceName,
  manifest: "/manifest.webmanifest",
  robots: isStagingDeployment
    ? {
        index: false,
        follow: false,
        noarchive: true,
        nosnippet: true,
      }
    : { index: true, follow: true },
  icons: {
    icon: [
      {
        url: BRAND.assets.favicon,
        type: "image/png",
        sizes: "64x64",
      },
      { url: "/favicon.ico", sizes: "any", type: "image/x-icon" },
    ],
    apple: [{ url: BRAND.assets.appleTouchIcon, sizes: "180x180", type: "image/png" }],
  },
  alternates: { canonical: "/" },
  openGraph: {
    title: BRAND.serviceName,
    description: BRAND.description,
    siteName: BRAND.serviceName,
    locale: "ja_JP",
    type: "website",
    url: "/",
    images: [
      {
        url: BRAND.assets.ogImage,
        width: 1200,
        height: 630,
        alt: BRAND.serviceName,
      },
    ],
  },
  twitter: { card: "summary_large_image", title: BRAND.serviceName, description: BRAND.description, images: [BRAND.assets.ogImage] },
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
        {process.env.VERCEL === "1" ? <GarageAnalytics /> : null}
      </body>
    </html>
  );
}
