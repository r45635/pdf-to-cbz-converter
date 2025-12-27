import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow larger file uploads (50MB)
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
  // External packages for server-side rendering
  serverExternalPackages: ['canvas', 'sharp', 'pdfjs-dist'],
  // Empty turbopack config to satisfy Next.js 16
  turbopack: {},
};

export default nextConfig;
