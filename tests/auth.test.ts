import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { authorizeTv, tokensMatch } from "../lib/auth/tv";

const originalToken = process.env.TV_TOKEN;
const originalNodeEnv = process.env.NODE_ENV;

function setNodeEnv(value: string | undefined) {
  (process.env as Record<string, string | undefined>).NODE_ENV = value;
}

afterEach(() => {
  if (originalToken === undefined) delete process.env.TV_TOKEN;
  else process.env.TV_TOKEN = originalToken;
  setNodeEnv(originalNodeEnv);
});

describe("TV token", () => {
  it("compares equal strings and rejects different ones", () => {
    assert.equal(tokensMatch("alpha", "alpha"), true);
    assert.equal(tokensMatch("alpha", "beta"), false);
  });

  it("stays open in development until a token is set", () => {
    delete process.env.TV_TOKEN;
    setNodeEnv("development");
    assert.deepEqual(authorizeTv(""), { ok: true, mode: "open" });
  });

  it("refuses production when the token is empty", () => {
    delete process.env.TV_TOKEN;
    setNodeEnv("production");
    const result = authorizeTv("");
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 503);
  });

  it("enforces a configured token", () => {
    process.env.TV_TOKEN = "local-test-token";
    setNodeEnv("production");
    assert.equal(authorizeTv("local-test-token").ok, true);
    const rejected = authorizeTv("other");
    assert.equal(rejected.ok, false);
    if (!rejected.ok) assert.equal(rejected.status, 401);
  });
});
