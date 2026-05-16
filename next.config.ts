import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin Turbopack to this project — there is an unrelated package-lock.json
  // in the parent directory which would otherwise be auto-selected.
  turbopack: {
    root: path.resolve(__dirname),
  },
  async redirects() {
    return [
      // Sidebar trimmed in Phase 9A polish: Search folded into Home,
      // Earnings folded into Profile. Preserve any links/bookmarks
      // pointing at the old routes.
      { source: "/search", destination: "/discover", permanent: true },
      { source: "/earnings", destination: "/profile", permanent: true },
    ];
  },
};

export default nextConfig;
