import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@garage-link/auth",
    "@garage-link/billing",
    "@garage-link/config",
    "@garage-link/database",
    "@garage-link/ui",
  ],
};

export default nextConfig;
