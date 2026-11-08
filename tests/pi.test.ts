import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { POST as heartbeat } from "../app/api/pi/heartbeat/route";
import { GET as commands } from "../app/api/pi/commands/route";
import { GET as systemGet, POST as systemPost } from "../app/api/remote/system/route";
import { POST as undo } from "../app/api/remote/undo/route";
import { executeTool } from "../lib/agent/tools";
import { SESSION_COOKIE, signSession } from "../lib/auth/session";
import { resetPiMemory } from "../lib/pi/memory";
import { saveHeartbeat } from "../lib/pi/store";
import { loadSystem } from "../lib/pi/system";
import { heartbeatAlert, redactLine, SILENT_AFTER_MS } from "../lib/pi/watch";

const now = new Date("2026-11-08T10:00:00.000Z");
const originalPi = process.env.PI_TOKEN;
const originalSession = process.env.SESSION_SECRET;

afterEach(() => {
  resetPiMemory();
  delete (globalThis as { __tvDashboardAgent?: unknown }).__tvDashboardAgent;
  restore("PI_TOKEN", originalPi);
  restore("SESSION_SECRET", originalSession);
});

describe("pi silence", () => {
  it("raises an alert at five minutes and keeps a fresh heartbeat quiet", () => {
    assert.equal(heartbeatAlert(null, now).silent, true);
    const fresh = new Date(now.getTime() - SILENT_AFTER_MS + 1000).toISOString();
    assert.equal(heartbeatAlert(fresh, now).silent, false);
    const due = new Date(now.getTime() - SILENT_AFTER_MS).toISOString();
    const alert = heartbeatAlert(due, now);
    assert.equal(alert.silent, true);
    assert.match(alert.text ?? "", /5 minute/);
    assert.equal(redactLine("cast https://tv.example/tv?token=supersecret failed Bearer supersecret").includes("supersecret"), false);
  });
});

describe("pi routes", () => {
  it("stores a heartbeat, hides the token, and delivers each command once", async () => {
    process.env.PI_TOKEN = "pi-test-token";
    process.env.SESSION_SECRET = "test-session-secret";
    const missing = await heartbeat(jsonRequest("/api/pi/heartbeat", {}));
    assert.equal(missing.status, 401);
    delete process.env.PI_TOKEN;
    const unconfigured = await heartbeat(jsonRequest("/api/pi/heartbeat", {}, "pi-test-token"));
    assert.equal(unconfigured.status, 503);
    process.env.PI_TOKEN = "pi-test-token";

    const saved = await heartbeat(
      jsonRequest("/api/pi/heartbeat", {
        receiver: "other",
        app: "Netflix",
        appId: "CA5E8412",
        lastCastAt: "2026-11-08T09:00:00.000Z",
        uptimeSeconds: 90,
        localIp: "192.168.1.20",
        version: "1",
        log: ["left Netflix alone", "https://tv.example/tv?token=supersecret"],
      }, "pi-test-token"),
    );
    assert.equal(saved.status, 200);
    resetPiMemory();
    const recorded = await saveHeartbeat(
      {
        receiver: "other",
        app: "Netflix",
        appId: "CA5E8412",
        lastCastAt: "2026-11-08T09:00:00.000Z",
        uptimeSeconds: 90,
        localIp: "192.168.1.20",
        version: "1",
        log: ["left Netflix alone", "https://tv.example/tv?token=supersecret"],
      },
      now,
    );
    assert.equal(recorded.ok, true);
    const view = await loadSystem(now);
    assert.equal(view.ok, true);
    if (!view.ok) return;
    assert.equal(view.alert, false);
    assert.equal(view.heartbeat?.receiver, "other");
    assert.equal(view.heartbeat?.app, "Netflix");
    assert.equal(view.lastCastAt, "2026-11-08T09:00:00.000Z");
    assert.equal(JSON.stringify(view).includes("supersecret"), false);

    const stale = await loadSystem(new Date(now.getTime() + SILENT_AFTER_MS));
    assert.equal(stale.ok, true);
    if (stale.ok) assert.equal(stale.alert, true);

    const queued = await systemPost(sessionRequest("/api/remote/system", { command: "cast_now" }));
    assert.equal(queued.status, 200);
    await systemPost(sessionRequest("/api/remote/system", { command: "restart_service" }));
    const first = await commands(jsonRequest("/api/pi/commands", undefined, "pi-test-token", "GET"));
    const body = (await first.json()) as { commands: { kind: string }[] };
    assert.deepEqual(body.commands.map((command) => command.kind), ["cast_now", "restart_service"]);
    const second = (await (await commands(jsonRequest("/api/pi/commands", undefined, "pi-test-token", "GET"))).json()) as {
      commands: unknown[];
    };
    assert.deepEqual(second.commands, []);

    const denied = await systemGet(new Request("http://local/api/remote/system"));
    assert.equal(denied.status, 401);
  });

  it("lists an assistant write and undo restores it", async () => {
    process.env.SESSION_SECRET = "test-session-secret";
    const { agentStore } = await import("../lib/agent/tools");
    const store = agentStore();
    assert.ok(store);
    const created = await executeTool(
      "upsert_card",
      { externalId: "note-pi", viewId: "vision", kind: "note", title: "Alpha", body: "Alpha" },
      { store, now },
    );
    assert.equal(created.ok, true);
    await executeTool(
      "upsert_card",
      { externalId: "note-pi", viewId: "vision", kind: "note", title: "Beta", body: "Beta" },
      { store, now },
    );
    const before = await loadSystem(now);
    assert.equal(before.ok, true);
    if (!before.ok) return;
    const write = before.writes.find((item) => item.canUndo);
    assert.ok(write);
    const undone = await undo(sessionRequest("/api/remote/undo", { id: write?.id }));
    assert.equal(undone.status, 200);
    const payload = (await undone.json()) as { ok: boolean };
    assert.equal(payload.ok, true);
    const title = (await store.cards()).find((card) => card.externalId === "note-pi")?.title;
    assert.equal(title, "Alpha");
    const after = await loadSystem(now);
    assert.equal(after.ok, true);
    if (after.ok) assert.equal(after.writes.some((item) => item.id === write?.id && item.canUndo), false);
  });
});

function jsonRequest(path: string, body: unknown, token?: string, method = "POST"): Request {
  const headers = new Headers();
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (body !== undefined) headers.set("content-type", "application/json");
  return new Request(`http://local${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function sessionRequest(path: string, body: unknown): Request {
  const headers = new Headers({ "content-type": "application/json" });
  headers.set("cookie", `${SESSION_COOKIE}=${signSession("test-session-secret", now.getTime())}`);
  return new Request(`http://local${path}`, { method: "POST", headers, body: JSON.stringify(body) });
}

function restore(name: "PI_TOKEN" | "SESSION_SECRET", value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
