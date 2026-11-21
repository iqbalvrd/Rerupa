import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `npm run build:check` builds into .next-check so it never overwrites the
  // .next folder a running `npm run dev` is serving from.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
