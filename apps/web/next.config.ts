import type { NextConfig } from "next";
import { securityHeaders } from "./lib/csp";

const nextConfig: NextConfig = {
  output: "standalone",   // enables minimal Docker image (no node_modules at runtime)
  reactStrictMode: true,
  // React <ViewTransition> (the claim-text morph is wired in P3, animated in P7).
  experimental: { viewTransition: true },
  // Files read from disk at request time (the paths are marked turbopackIgnore so the tracer does not pull in the
  // whole project): the recorded samples, the OG image's Newsreader and EVALUATION.md (the Method drawer's benchmark).
  outputFileTracingIncludes: {
    '/**': ['./fixtures/runs/*.jsonl', '../../EVALUATION.md'],
    '/case/[id]/opengraph-image*': ['./node_modules/@fontsource/newsreader/files/newsreader-latin-{500,600}-normal.woff'],
  },
  // CSP and friends on every route of a production build (dev keeps Next's eval-based HMR working).
  async headers() {
    if (process.env.NODE_ENV !== "production") return [];
    return [{ source: "/:path*", headers: securityHeaders(process.env.NEXT_PUBLIC_API_URL) }];
  },
};

export default nextConfig;
