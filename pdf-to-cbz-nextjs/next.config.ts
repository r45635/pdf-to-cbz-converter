import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output for Docker deployment
  output: 'standalone',
  // Allow larger file uploads (50MB)
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
  // Externalize native modules for Docker compatibility
  // These packages have native bindings that must not be bundled
  serverExternalPackages: ['pdfjs-dist', 'canvas', 'sharp'],
  // Empty turbopack config to satisfy Next.js 16
  turbopack: {},
  // Webpack config
  webpack: (config, { isServer }) => {
    // Disable canvas on client-side only (not available in browser)
    if (!isServer) {
      config.resolve.alias.canvas = false;
    }
    return config;
  },
};

export default nextConfig;
