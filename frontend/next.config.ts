import type { NextConfig } from "next";

// Sprint 2 #7: bundle analyzer behind ANALYZE=true env flag.
// Run via: `ANALYZE=true npm run build` — opens HTML reports under .next/analyze/.
// No-op in normal builds (the package is a devDependency).
const withBundleAnalyzer = process.env.ANALYZE === "true"
  ? require("@next/bundle-analyzer")({ enabled: true, openAnalyzer: false })
  : (cfg: NextConfig) => cfg;

const nextConfig: NextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
};

export default withBundleAnalyzer(nextConfig);
