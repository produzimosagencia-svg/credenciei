import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['192.168.15.123'],
  experimental: {
    // As fotos de presença são enviadas (comprimidas) via server action
    serverActions: { bodySizeLimit: '5mb' },
  },
};

export default nextConfig;
