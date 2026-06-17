import type { Metadata } from "next";
import "./globals.css";

const metadataBase = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001");
  } catch {
    return new URL("http://localhost:3001");
  }
})();

export const metadata: Metadata = {
  metadataBase,
  title: "L-Link",
  description: "LINE外部ツールSaaS",
  icons: {
    icon: "/L-Link_logo_transparent.png",
    apple: "/L-Link_logo_transparent.png",
  },
  openGraph: {
    title: "L-Link",
    description: "LINE外部ツールSaaS",
    images: [
      {
        url: "/L-Link_logo_transparent.png",
        width: 2172,
        height: 724,
        alt: "L-Link",
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
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
