import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { contentSecurityPolicy, documentSecurityHeaders, isTvDocument } from "../lib/security/csp";

const nonce = "test-nonce";

describe("content security policy", () => {
  it("leaves the TV page frameable and sends no frame option", () => {
    assert.equal(isTvDocument("/tv"), true);
    assert.equal(isTvDocument("/tv/extra"), true);
    assert.equal(isTvDocument("/remote"), false);
    const tv = contentSecurityPolicy({ pathname: "/tv", nonce, development: false });
    const headers = documentSecurityHeaders({ pathname: "/tv", nonce, development: false });
    assert.match(tv, /frame-ancestors \*/);
    assert.equal(tv.includes("frame-ancestors 'none'"), false);
    assert.equal(
      headers.some((header) => header.key.toLowerCase() === "x-frame-options"),
      false,
    );
    assert.equal(headers.some((header) => header.key === "Referrer-Policy" && header.value === "no-referrer"), true);
  });

  it("blocks framing everywhere else and allows the Supabase browser calls", () => {
    const remote = contentSecurityPolicy({ pathname: "/remote", nonce, development: false });
    assert.match(remote, /frame-ancestors 'none'/);
    assert.match(remote, /connect-src 'self' https:\/\/\*\.supabase\.co wss:\/\/\*\.supabase\.co/);
    assert.match(remote, /img-src 'self' blob: data: https:\/\/\*\.supabase\.co/);
    assert.match(remote, /worker-src 'self'/);
    assert.match(remote, /style-src 'self' 'unsafe-inline'/);
    assert.equal(remote.includes("style-src 'self' 'nonce-"), false);
    assert.match(remote, new RegExp(`script-src 'self' 'nonce-${nonce}' 'unsafe-inline' 'strict-dynamic'`));
    assert.match(remote, /upgrade-insecure-requests/);
    assert.equal(remote.includes("unsafe-eval"), false);
  });

  it("keeps the local dev server on http and allows the dev overlay", () => {
    const dev = contentSecurityPolicy({ pathname: "/", nonce, development: true });
    assert.match(dev, /unsafe-eval/);
    assert.equal(dev.includes("upgrade-insecure-requests"), false);
    assert.match(dev, /frame-ancestors 'none'/);
  });
});
