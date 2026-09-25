import type { NextConfig } from "next";

const isStagingDeployment = process.env.GARAGE_DEPLOYMENT_ENV === "staging";

const nextConfig: NextConfig = {
  logging: process.env.NODE_ENV === "development" ? { incomingRequests: false } : undefined,
  allowedDevOrigins: ["127.0.0.1"],
  transpilePackages: [
    "@garage-link/auth",
    "@garage-link/billing",
    "@garage-link/config",
    "@garage-link/database",
    "@garage-link/ui",
  ],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "llink.tech",
        pathname: "/l-link-logo.png",
      },
      {
        protocol: "https",
        hostname: "aftercare-link.jp",
        pathname: "/brand/aftercare-link/aftercare-link-logo.png",
      },
      {
        protocol: "https",
        hostname: "turnkey-link.jp",
        pathname: "/brand/turnkey-link-logo-horizontal.png",
      },
    ],
  },
  async headers() {
    if (!isStagingDeployment) return [];
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Robots-Tag",
            value: "noindex, nofollow, noarchive",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
