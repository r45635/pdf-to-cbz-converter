import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow larger file uploads (50MB)
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
  // External packages for server-side rendering
  serverExternalPackages: ['canvas', 'sharp', 'pdfjs-dist', '@napi-rs/canvas', 'unpdf'],
  // Empty turbopack config to satisfy Next.js 16
  turbopack: {},
  // Webpack config for pdfjs worker
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    return config;
  },
};

export default nextConfig;
