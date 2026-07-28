import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: process.env.GITHUB_ACTIONS ? "export" : undefined,
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
