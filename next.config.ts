import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "static.portadafrente.com",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "unpkg.com",
        port: "",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
