import { NextResponse, type NextRequest } from "next/server";
import { documentSecurityHeaders } from "@/lib/security/csp";

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const headers = documentSecurityHeaders({
    pathname: request.nextUrl.pathname,
    nonce,
    development: process.env.NODE_ENV === "development",
  });
  const policy = headers.find((header) => header.key === "Content-Security-Policy")?.value ?? "";
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  for (const header of headers) response.headers.set(header.key, header.value);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/|favicon.ico|sw.js|manifest.webmanifest|fonts/|icons/).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
