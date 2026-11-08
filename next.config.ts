import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // DashCast loads /tv inside a frame. Do not send X-Frame-Options.
  // proxy.ts sets the content security policy and omits frame-ancestors on /tv.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

export default nextConfig;
