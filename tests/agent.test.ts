import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { authorizeAgent } from "../lib/agent/auth";
import { agentStatus, handleAgentHttp } from "../lib/agent/http";
import { handleMcp } from "../lib/agent/mcp";
import { MemoryStore } from "../lib/agent/memory";
import { active } from "../lib/agent/model";
import { isBlockedAddress, readPublicImage } from "../lib/agent/network";
import { executeTool } from "../lib/agent/tools";
import { findAppointment } from "../lib/agent/when";
import { ensureMemory, memoryDeleteCard, memoryInsertCard } from "../lib/remote/memory";

const now = new Date("2026-11-08T08:00:00.000Z");
const originalToken = process.env.AGENT_TOKEN;

afterEach(() => {
  if (originalToken === undefined) delete process.env.AGENT_TOKEN;
  else process.env.AGENT_TOKEN = originalToken;
});

describe("assistant edits", () => {
  it("runs the daily routine twice without duplicates", async () => {
    const store = new MemoryStore();
    await routine(store);
    await routine(store);
    const [cards, events, tasks, shopping, recaps] = await Promise.all([
      store.cards(),
      store.events(),
      store.tasks(),
      store.shopping(),
      store.recaps(),
    ]);
    assert.equal(active(cards).length, 4);
    assert.equal(active(events).length, 1);
    assert.equal(active(tasks).length, 1);
    assert.equal(active(shopping).length, 1);
    assert.equal(active(recaps).length, 1);
    assert.equal(active(shopping)[0]?.qty, 1);
    assert.equal(active(cards).filter((card) => card.kind === "wins").length, 1);
  });

  it("keeps a manual edit when the assistant writes again", async () => {
    const store = new MemoryStore();
    const created = await executeTool(
      "upsert_card",
      { externalId: "affirmation-2026-11-08", viewId: "vision", kind: "affirmation", title: "Buna", body: "Ziua e a ta", color: "pink" },
      { store, now },
    );
    assert.equal(created.ok, true);
    const card = (await store.cards()).find((item) => item.externalId === "affirmation-2026-11-08");
    assert.ok(card);
    await store.putCard({ ...card, title: "Scris de mână", source: "manual", locked: true });
    const again = await executeTool(
      "upsert_card",
      { externalId: "affirmation-2026-11-08", viewId: "vision", kind: "affirmation", title: "Schimbat", body: "Alt text", color: "pink" },
      { store, now },
    );
    assert.equal(again.ok, false);
    assert.match(again.reason ?? "", /locked by a manual edit/);
    const saved = (await store.cards()).find((item) => item.externalId === "affirmation-2026-11-08");
    assert.equal(saved?.title, "Scris de mână");
    assert.equal(saved?.locked, true);
  });

  it("restores the previous card and refuses to undo over a manual edit", async () => {
    const store = new MemoryStore();
    await executeTool("upsert_card", card("note-1", "note", "Alpha"), { store, now });
    await executeTool("upsert_card", card("note-1", "note", "Beta"), { store, now });
    const undone = await executeTool("undo", {}, { store, now });
    assert.equal(undone.ok, true);
    assert.equal((await store.cards()).find((item) => item.externalId === "note-1")?.title, "Alpha");

    const locked = (await store.cards()).find((item) => item.externalId === "note-1");
    assert.ok(locked);
    await store.putCard({ ...locked, title: "De mână", source: "manual", locked: true });
    const blocked = await executeTool("undo", {}, { store, now });
    assert.equal(blocked.reason, "a manual edit is keeping this");
    assert.equal((await store.cards()).find((item) => item.externalId === "note-1")?.title, "De mână");
  });

  it("routes an inbox note, leaves an event without a time for review, and does not duplicate", async () => {
    const store = new MemoryStore();
    const bread = await capture(store, "Cumpără pâine");
    const routed = await executeTool("route_inbox_item", { id: bread }, { store, now });
    assert.equal(routed.ok, true);
    assert.equal(routed.status, "routed");
    assert.equal(active(await store.tasks()).length, 1);
    await executeTool("route_inbox_item", { id: bread }, { store, now });
    assert.equal(active(await store.tasks()).length, 1);

    const visit = await capture(store, "Medic 2026-11-09 15:30");
    const event = await executeTool("route_inbox_item", { id: visit }, { store, now });
    assert.equal(event.status, "routed");
    assert.equal(active(await store.events()).length, 1);

    const vague = await capture(store, "sună mama");
    const review = await executeTool("route_inbox_item", { id: vague, destination: "event" }, { store, now });
    assert.equal(review.ok, true);
    assert.equal(review.status, "needs_review");
    const saved = (await store.inbox()).find((item) => item.id === vague);
    assert.equal(saved?.status, "needs_review");
    assert.equal(active(await store.events()).length, 1);
  });

  it("refuses a win without evidence and strips HTML", async () => {
    const store = new MemoryStore();
    const refused = await executeTool(
      "upsert_card",
      { externalId: "wins-1", viewId: "vision", kind: "wins", data: { items: [{ text: "Am făcut" }] } },
      { store, now },
    );
    assert.equal(refused.ok, false);
    assert.match(refused.reason ?? "", /evidence/);
    assert.equal((await store.cards()).length, 0);

    const progress = await executeTool(
      "upsert_card",
      { externalId: "progress-1", viewId: "vision", kind: "progress", data: { label: "Liste", value: 1, max: 2, style: "ring" } },
      { store, now },
    );
    assert.equal(progress.ok, false);

    const task = await executeTool("upsert_task", { externalId: "task-html", text: "<b>Lapte</b>" }, { store, now });
    assert.equal(task.ok, true);
    assert.equal(active(await store.tasks())[0]?.text, "Lapte");
  });

  it("stops at 60 calls a minute and will not replace a manual priority", async () => {
    const store = new MemoryStore();
    for (let call = 0; call < 60; call += 1) {
      const result = await executeTool("get_schema", {}, { store, now });
      assert.equal(result.ok, true);
    }
    const blocked = await executeTool("get_schema", {}, { store, now });
    assert.equal(blocked.ok, false);
    assert.match(blocked.reason ?? "", /too many requests/);
    assert.deepEqual(agentStatus(blocked.reason), { status: 429, headers: { "Retry-After": "60" } });

    const fresh = new MemoryStore();
    await fresh.putPriority({
      id: "77777777-7777-4777-8777-777777777777",
      text: "A mea",
      reason: "aleasă de mână",
      dueAt: null,
      taskId: null,
      expiresAt: "2026-11-08T22:00:00.000Z",
      source: "manual",
      locked: true,
      externalId: null,
      deletedAt: null,
      updatedAt: now.toISOString(),
    });
    const priority = await executeTool("set_priority", { text: "Alta", reason: "due in 3 h, task not done" }, { store: fresh, now });
    assert.equal(priority.ok, false);
    assert.match(priority.reason ?? "", /manual priority/);
    assert.equal(active(await fresh.priorities())[0]?.text, "A mea");
  });

  it("pins for at most 30 minutes and leaves a phone lock alone", async () => {
    const store = new MemoryStore();
    const pin = await executeTool("pin_view", { viewId: "today", minutes: 30 }, { store, now });
    assert.equal(pin.ok, true);
    const control = await store.control();
    assert.equal(control.mode, "pinned");
    assert.equal(control.viewId, "today");
    const tooLong = await executeTool("pin_view", { viewId: "home", minutes: 31 }, { store, now });
    assert.match(tooLong.reason ?? "", /30 minutes/);
    await store.putControl({ mode: "locked", viewId: "home", pinnedUntil: null, dimmed: false });
    const held = await executeTool("pin_view", { viewId: "today", minutes: 5 }, { store, now });
    assert.equal(held.ok, false);
    assert.equal((await store.control()).mode, "locked");
  });
});

describe("agent transport", () => {
  it("requires the bearer token and serves the schema", async () => {
    delete process.env.AGENT_TOKEN;
    const missing = await handleAgentHttp(new Request("http://local/api/agent/get_schema", { method: "POST", body: "{}" }), "get_schema");
    assert.equal(missing.status, 503);
    process.env.AGENT_TOKEN = "test-agent-token";
    const denied = await handleAgentHttp(new Request("http://local/api/agent/get_schema", { method: "POST", body: "{}" }), "get_schema");
    assert.equal(denied.status, 401);
    assert.equal(authorizeAgent("test-agent-token").ok, true);
    const allowed = await handleAgentHttp(
      new Request("http://local/api/agent/get_schema", {
        method: "POST",
        headers: { authorization: "Bearer test-agent-token" },
        body: "{}",
      }),
      "get_schema",
    );
    assert.equal(allowed.status, 200);
    const body = (await allowed.json()) as { ok: boolean; schema: { palette: { id: string }[] } };
    assert.equal(body.ok, true);
    assert.ok(body.schema.palette.some((token) => token.id === "sand"));
    const unknown = await handleAgentHttp(
      new Request("http://local/api/agent/nope", {
        method: "POST",
        headers: { authorization: "Bearer test-agent-token" },
        body: "{}",
      }),
      "nope",
    );
    assert.equal(unknown.status, 404);
  });

  it("lists only tools on the MCP endpoint", async () => {
    process.env.AGENT_TOKEN = "test-agent-token";
    const denied = await handleMcp(new Request("http://local/mcp", { method: "POST", body: "{}" }));
    assert.equal(denied.status, 401);
    const listed = await handleMcp(
      new Request("http://local/mcp", {
        method: "POST",
        headers: {
          authorization: "Bearer test-agent-token",
          accept: "application/json, text/event-stream",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
          params: {},
        }),
      }),
    );
    assert.equal(listed.status, 200);
    const payload = JSON.parse(await mcpJson(listed)) as { result?: { tools?: { name: string }[] }; error?: { message?: string } };
    const names = payload.result?.tools?.map((tool) => tool.name) ?? [];
    assert.ok(names.includes("upsert_card"), payload.error?.message ?? JSON.stringify(payload));
    assert.ok(names.includes("upsert_spotlight"), payload.error?.message ?? JSON.stringify(payload));
    assert.ok(names.includes("delete_spotlight"));
    assert.ok(names.includes("route_inbox_item"));
    assert.ok(names.includes("undo"));
    assert.equal(names.includes("resources/list"), false);
  });
});

describe("image addresses and appointments", () => {
  it("blocks private addresses before fetching", async () => {
    assert.equal(isBlockedAddress("127.0.0.1"), true);
    assert.equal(isBlockedAddress("10.1.1.1"), true);
    assert.equal(isBlockedAddress("192.168.0.8"), true);
    assert.equal(isBlockedAddress("169.254.169.254"), true);
    assert.equal(isBlockedAddress("8.8.8.8"), false);
    let called = 0;
    const blocked = await readPublicImage("http://127.0.0.1/a.png", {
      fetch: async () => {
        called += 1;
        return new Response();
      },
    });
    assert.equal(blocked.ok, false);
    assert.equal(called, 0);
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]);
    const saved = await readPublicImage("https://cdn.example/a.png", {
      lookup: async () => ["8.8.8.8"],
      fetch: async () => new Response(png, { status: 200, headers: { "content-type": "image/png" } }),
    });
    assert.equal(saved.ok, true);
    const redirected = await readPublicImage("https://cdn.example/go", {
      lookup: async (host) => (host === "cdn.example" ? ["8.8.8.8"] : ["127.0.0.1"]),
      fetch: async () => new Response(null, { status: 302, headers: { location: "http://127.0.0.1/secret.png" } }),
    });
    assert.equal(redirected.ok, false);
  });

  it("finds a date and a time, and ignores a time on its own", () => {
    const visit = findAppointment("Medic 2026-11-09 15:30", now);
    assert.equal(visit?.start, "2026-11-09T13:30:00.000Z");
    const tomorrow = findAppointment("mâine la 18:00", now);
    assert.equal(tomorrow?.start, "2026-11-09T16:00:00.000Z");
    assert.equal(findAppointment("Cumpără pâine", now), null);
    assert.equal(findAppointment("sună la 15:30", now), null);
  });
});

describe("phone delete", () => {
  it("locks the card so a later assistant write cannot revive it", () => {
    const id = crypto.randomUUID();
    memoryInsertCard({
      id,
      kind: "note",
      title: "Notă",
      body: null,
      color: "mint",
      tilt: 0,
      grid: { col: 0, row: 0, colSpan: 1, rowSpan: 1 },
      expiresAt: null,
      pinned: false,
      source: "assistant",
      locked: false,
      data: { text: "Notă" },
      photoUrl: null,
    });
    assert.equal(memoryDeleteCard(id, now), true);
    const saved = ensureMemory().cards.find((item) => item.id === id);
    assert.equal(saved?.locked, true);
    assert.equal(saved?.source, "manual");
    assert.ok(saved?.deletedAt);
  });
});

async function mcpJson(response: Response): Promise<string> {
  const text = await response.text();
  const data = text
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .find((line) => line.startsWith("{"));
  return data ?? text;
}

async function routine(store: MemoryStore) {
  const state = await executeTool("get_dashboard_state", {}, { store, now });
  assert.equal(state.ok, true);
  const recap = await executeTool(
    "set_recap",
    { externalId: "recap-2026-11-08", text: "O zi liniștită.", highlights: ["Am închis lista"] },
    { store, now },
  );
  assert.equal(recap.ok, true);
  const priority = await executeTool(
    "set_priority",
    { externalId: "priority-2026-11-08", text: "Sună medicul", reason: "due in 3 h, task not done" },
    { store, now },
  );
  assert.equal(priority.ok, true);
  for (const entry of [
    card("affirmation-2026-11-08", "affirmation", "Ești aici"),
    {
      externalId: "wins-2026-11-08",
      viewId: "vision",
      kind: "wins",
      data: { items: [{ text: "Lista e gata", evidence: "task:done:list" }] },
    },
    { externalId: "word-2026-11-08", viewId: "vision", kind: "word", data: { word: "Calm" } },
  ]) {
    const saved = await executeTool("upsert_card", entry, { store, now });
    assert.equal(saved.ok, true, saved.reason);
  }
  const events = await executeTool(
    "upsert_events",
    { events: [{ externalId: "event-2026-11-08-walk", title: "Plimbare", start: "2026-11-08T16:00:00.000Z", end: "2026-11-08T17:00:00.000Z", person: "Alex" }] },
    { store, now },
  );
  assert.equal(events.ok, true, events.reason);
  const task = await executeTool("upsert_task", { externalId: "task-2026-11-08", text: "Sună medicul", assignee: "Alex" }, { store, now });
  assert.equal(task.ok, true, task.reason);
  const shopping = await executeTool("shopping_add", { items: [{ text: "Lapte", qty: 1, category: "Lactate" }] }, { store, now });
  assert.equal(shopping.ok, true, shopping.reason);
}

function card(externalId: string, kind: string, title: string) {
  return { externalId, viewId: "vision", kind, title, body: title };
}

async function capture(store: MemoryStore, text: string): Promise<string> {
  const id = crypto.randomUUID();
  await store.putInbox({ id, text, receivedAt: now.toISOString(), status: "new", routedTo: null, deletedAt: null });
  return id;
}
