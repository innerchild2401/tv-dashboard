import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BACKUP_TABLES, DELETE_ORDER, INSERT_ORDER } from "../lib/backup/catalog";
import { contentTypeForPhoto, parseArgs, parseEnvFile, projectRefFromUrl, restoreAllowed, safePhotoPath } from "../lib/backup/files";

const TABLES = [
  "config",
  "tasks",
  "cards",
  "spotlights",
  "events",
  "shopping_items",
  "messages",
  "recaps",
  "inbox_items",
  "ideas",
  "metrics",
  "audit_log",
  "integration_cache",
  "display_control",
  "pin_guard",
  "pi_status",
  "pi_commands",
  "pi_log",
  "priorities",
];

describe("backup catalog", () => {
  it("covers the public tables and loads tasks before priorities", () => {
    assert.deepEqual(
      BACKUP_TABLES.map((table) => table.name),
      TABLES,
    );
    assert.deepEqual([...DELETE_ORDER].sort(), [...TABLES].sort());
    assert.deepEqual([...INSERT_ORDER].sort(), [...TABLES].sort());
    assert.ok(DELETE_ORDER.indexOf("priorities") < DELETE_ORDER.indexOf("tasks"));
    assert.ok(INSERT_ORDER.indexOf("tasks") < INSERT_ORDER.indexOf("priorities"));
    assert.equal(BACKUP_TABLES.find((table) => table.name === "integration_cache")?.key, "key");
  });
});

describe("backup files", () => {
  it("reads an env file without treating comments as values", () => {
    const values = parseEnvFile("# secret\nNEXT_PUBLIC_SUPABASE_URL=https://abc123def456.supabase.co\nREMOTE_PIN=\"1234\"\n\n");
    assert.deepEqual(values, {
      NEXT_PUBLIC_SUPABASE_URL: "https://abc123def456.supabase.co",
      REMOTE_PIN: "1234",
    });
    assert.equal(projectRefFromUrl(values.NEXT_PUBLIC_SUPABASE_URL ?? ""), "abc123def456");
    assert.equal(projectRefFromUrl("https://example.com"), null);
  });

  it("refuses to wipe the source project unless asked", () => {
    assert.equal(restoreAllowed("abc123def456", "zzz123def456", false), true);
    assert.equal(restoreAllowed("abc123def456", "abc123def456", false), false);
    assert.equal(restoreAllowed("abc123def456", "abc123def456", true), true);
  });

  it("keeps photo paths inside the backup folder", () => {
    assert.equal(safePhotoPath("phone/11111111-1111-4111-8111-111111111111.jpg"), true);
    assert.equal(contentTypeForPhoto("agent/11111111-1111-4111-8111-111111111111.png"), "image/png");
    assert.equal(safePhotoPath("../.env.local"), false);
    assert.equal(safePhotoPath("/etc/passwd"), false);
    assert.equal(safePhotoPath("phone/note.txt"), false);
    const args = parseArgs(["--yes", "--from", "backups/latest", "--replace"]);
    assert.equal(args.get("yes"), true);
    assert.equal(args.get("from"), "backups/latest");
    assert.equal(args.get("replace"), true);
  });
});
