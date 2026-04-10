import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",   // enables minimal Docker image (no node_modules at runtime)
  reactStrictMode: true,
};

export default nextConfig;
