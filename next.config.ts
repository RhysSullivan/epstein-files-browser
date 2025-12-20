import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable static export for SSG
  output: "export",
  
  // Disable image optimization for static export
  images: {
    unoptimized: true,
  },
  
  // Trailing slash for better static hosting compatibility
  trailingSlash: true,
};

export default nextConfig;
