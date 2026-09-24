import type { NextConfig } from "next";

// Static export so the app can live on GitHub Pages: https://yadavs8.github.io/studio5-po-tracker/
const nextConfig: NextConfig = {
  output: "export",
  basePath: "/studio5-po-tracker",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
