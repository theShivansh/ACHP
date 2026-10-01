import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",   // enables minimal Docker image (no node_modules at runtime)
  reactStrictMode: true,
  // React <ViewTransition> (the claim-text morph is wired in P3, animated in P7).
  experimental: { viewTransition: true },
  // The recorded samples are read from disk at request time (lib/runs/fixtures.ts), so the standalone build must carry them.
  outputFileTracingIncludes: { '/**': ['./fixtures/runs/*.jsonl'] },
};

export default nextConfig;
