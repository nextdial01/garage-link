import type { NextConfig } from "next";

const isStagingDeployment = process.env.GARAGE_DEPLOYMENT_ENV === "staging";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@garage-link/auth",
    "@garage-link/billing",
    "@garage-link/config",
    "@garage-link/database",
    "@garage-link/ui",
  ],
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
