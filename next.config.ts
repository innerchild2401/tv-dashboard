import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // DashCast loads /tv inside a frame. Do not send X-Frame-Options and do not
  // set a restrictive frame-ancestors policy on that route.
};

export default nextConfig;
