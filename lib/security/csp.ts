// Content-Security-Policy for the TV page and the phone.
// DashCast loads /tv inside a frame, so that route must not set
// frame-ancestors and the app must not send X-Frame-Options.
// A nonce in script-src makes modern browsers ignore 'unsafe-inline'.
// The fallback stays for the older Chromecast webview, which does not.

const SUPABASE_HTTPS = "https://*.supabase.co";
const SUPABASE_WSS = "wss://*.supabase.co";

export function isTvDocument(pathname: string): boolean {
  return pathname === "/tv" || pathname.startsWith("/tv/");
}

export function contentSecurityPolicy(options: { pathname: string; nonce: string; development: boolean }): string {
  const script = [
    "'self'",
    `'nonce-${options.nonce}'`,
    "'unsafe-inline'",
    "'strict-dynamic'",
    ...(options.development ? ["'unsafe-eval'"] : []),
  ];
  const directives = [
    "default-src 'self'",
    `script-src ${script.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "style-src-attr 'unsafe-inline'",
    `img-src 'self' blob: data: ${SUPABASE_HTTPS}`,
    "font-src 'self'",
    `connect-src 'self' ${SUPABASE_HTTPS} ${SUPABASE_WSS}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-src 'none'",
  ];
  // /tv must stay embeddable for DashCast iframe (force=false). Explicit allow-all
  // documents the contract; other routes stay unframeable.
  if (isTvDocument(options.pathname)) directives.push("frame-ancestors *");
  else directives.push("frame-ancestors 'none'");
  if (!options.development) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

export function documentSecurityHeaders(options: {
  pathname: string;
  nonce: string;
  development: boolean;
}): { key: string; value: string }[] {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(options) },
    { key: "Referrer-Policy", value: "no-referrer" },
    { key: "X-Content-Type-Options", value: "nosniff" },
  ];
}
