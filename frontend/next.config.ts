import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

// Sprint 2 #7: bundle analyzer behind ANALYZE=true env flag.
// Run via: `ANALYZE=true npm run build` — opens HTML reports under .next/analyze/.
// No-op in normal builds (the package is a devDependency).
const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
  openAnalyzer: false,
});

const nextConfig: NextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
};

export default withBundleAnalyzer(nextConfig);
