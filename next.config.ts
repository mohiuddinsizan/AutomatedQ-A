import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Questions carry up to 3 photos and a voice note. Photos are shrunk in the
    // browser first, so real requests are usually well under 3 MB.
    serverActions: {
      bodySizeLimit: "12mb",
      // Lets forms work when the site is shared through a Cloudflare quick tunnel.
      allowedOrigins: ["*.trycloudflare.com"],
    },
  },
};

export default nextConfig;
