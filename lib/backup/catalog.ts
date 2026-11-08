// Public tables, in an order that respects priorities.task_id → tasks.id.
// Schema, policies, the photos bucket, and the cron jobs come from
// supabase/migrations. This list is only the household data.

export const BACKUP_TABLES = [
  { name: "config", key: "id" },
  { name: "tasks", key: "id" },
  { name: "cards", key: "id" },
  { name: "spotlights", key: "id" },
  { name: "events", key: "id" },
  { name: "shopping_items", key: "id" },
  { name: "recaps", key: "id" },
  { name: "inbox_items", key: "id" },
  { name: "ideas", key: "id" },
  { name: "metrics", key: "id" },
  { name: "audit_log", key: "id" },
  { name: "integration_cache", key: "key" },
  { name: "display_control", key: "id" },
  { name: "pin_guard", key: "id" },
  { name: "pi_status", key: "id" },
  { name: "pi_commands", key: "id" },
  { name: "pi_log", key: "id" },
  { name: "priorities", key: "id" },
] as const;

export type BackupTableName = (typeof BACKUP_TABLES)[number]["name"];

export const INSERT_ORDER: BackupTableName[] = BACKUP_TABLES.map((table) => table.name);

export const DELETE_ORDER: BackupTableName[] = [
  "priorities",
  "pi_log",
  "pi_commands",
  "pi_status",
  "pin_guard",
  "display_control",
  "integration_cache",
  "audit_log",
  "metrics",
  "ideas",
  "inbox_items",
  "recaps",
  "shopping_items",
  "events",
  "spotlights",
  "cards",
  "tasks",
  "config",
];

export function tableKey(name: BackupTableName): "id" | "key" {
  const found = BACKUP_TABLES.find((table) => table.name === name);
  if (!found) throw new Error(`unknown table ${name}`);
  return found.key;
}

export const BACKUP_VERSION = 1;
export const PAGE_SIZE = 1000;
export const MAX_ROWS = 20_000;
