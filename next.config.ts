import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    baseURL: "http://localhost:1337",
    // baseURL: "https://dms-uat-api.poet-technologies.com",
  },
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: true,
  },
  typescript: {
    // !! WARN !!
    // Dangerously allow production builds to successfully complete even if
    // your project has type errors.
    // !! WARN !!
    ignoreBuildErrors: true,
  },
  /* config options here */
  // output: "export",
  experimental: {
    optimizePackageImports: ["@chakra-ui/react"],
  },
  reactStrictMode: false,
  devIndicators: false,
};

export default nextConfig;
