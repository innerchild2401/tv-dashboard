import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { active } from "@/lib/agent/model";
import { MemoryStore } from "@/lib/agent/memory";
import { executeTool } from "@/lib/agent/tools";
import { availability } from "@/lib/state/availability";
import { sampleSnapshot } from "@/lib/state/sample";
import { buildTvState } from "@/lib/state/build";
import { projectHome } from "@/lib/views/household";

const noon = new Date("2026-11-08T10:00:00.000Z");

describe("home post-it board", () => {
  it("projects tasks, shopping, and messages as stickies with adaptive density", () => {
    const snapshot = sampleSnapshot(noon);
    const home = projectHome(snapshot, noon);
    assert.ok(home.stickies.some((sticky) => sticky.kind === "task" && sticky.kindLabel === "Task"));
    assert.ok(home.stickies.some((sticky) => sticky.kind === "shopping" && sticky.kindLabel === "Cumpărături"));
    assert.ok(home.stickies.some((sticky) => sticky.kind === "message" && sticky.kindLabel === "Mesaj"));
    assert.equal(home.emptyLabel, null);
    assert.ok(["roomy", "cozy", "packed"].includes(home.density));

    const packed = sampleSnapshot(noon);
    for (let index = 0; index < 14; index += 1) {
      packed.tasks.push({
        id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        text: `Task ${index}`,
        done: false,
        assigneeId: null,
        dueDate: null,
      });
    }
    assert.equal(projectHome(packed, noon).density, "packed");
  });

  it("skips Acasă when there are no open tasks, shopping, or messages", () => {
    const snapshot = sampleSnapshot(noon);
    snapshot.tasks = snapshot.tasks.map((task) => ({ ...task, done: true }));
    snapshot.shopping = [];
    snapshot.messages = [];
    assert.equal(availability(snapshot, noon).home.empty, true);
    snapshot.messages = [{ id: "m1", text: "Salut", author: null, color: "butter", createdAt: noon.toISOString() }];
    assert.equal(availability(snapshot, noon).home.empty, false);
  });

  it("renders the home view from the sample snapshot", () => {
    const state = buildTvState(sampleSnapshot(noon), noon, "home");
    assert.ok((state.home?.stickies.length ?? 0) > 0);
  });
});

describe("home agent tools", () => {
  it("upserts and deletes messages and documents Acasă tools in get_schema", async () => {
    const store = new MemoryStore();
    const created = await executeTool(
      "upsert_message",
      { externalId: "msg-cina", text: "Cina e la 19:00", author: "Alex", color: "peach" },
      { store, now: noon },
    );
    assert.equal(created.ok, true);
    const again = await executeTool(
      "upsert_message",
      { externalId: "msg-cina", text: "Cina e la 19:30", author: "Alex" },
      { store, now: noon },
    );
    assert.equal(again.ok, true);
    assert.equal(active(await store.messages()).length, 1);
    assert.equal(active(await store.messages())[0]?.text, "Cina e la 19:30");
    assert.equal(active(await store.messages())[0]?.color, "peach");

    const schema = await executeTool("get_schema", {}, { store, now: noon });
    assert.equal(schema.ok, true);
    const body = schema.schema as {
      home?: {
        viewId?: string;
        tools?: {
          upsert_task?: unknown;
          delete_task?: unknown;
          shopping_add?: unknown;
          shopping_check?: unknown;
          shopping_delete?: unknown;
          upsert_message?: unknown;
          delete_message?: unknown;
        };
      };
    };
    assert.equal(body.home?.viewId, "home");
    assert.ok(body.home?.tools?.upsert_task);
    assert.ok(body.home?.tools?.delete_task);
    assert.ok(body.home?.tools?.shopping_add);
    assert.ok(body.home?.tools?.shopping_check);
    assert.ok(body.home?.tools?.shopping_delete);
    assert.ok(body.home?.tools?.upsert_message);
    assert.ok(body.home?.tools?.delete_message);

    const removed = await executeTool("delete_message", { externalId: "msg-cina" }, { store, now: noon });
    assert.equal(removed.ok, true);
    assert.ok((await store.messages())[0]?.deletedAt);
  });

  it("deletes tasks and shopping items the assistant owns", async () => {
    const store = new MemoryStore();
    await executeTool("upsert_task", { externalId: "task-test", text: "Sună medicul" }, { store, now: noon });
    await executeTool("shopping_add", { items: [{ text: "Ouă", externalId: "shop-oua" }] }, { store, now: noon });
    const dropTask = await executeTool("delete_task", { externalId: "task-test" }, { store, now: noon });
    assert.equal(dropTask.ok, true);
    assert.ok((await store.tasks())[0]?.deletedAt);
    const dropShop = await executeTool("shopping_delete", { externalIds: ["shop-oua"] }, { store, now: noon });
    assert.equal(dropShop.ok, true);
    assert.ok((await store.shopping())[0]?.deletedAt);
  });
});
