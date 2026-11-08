import type { Json } from "@/lib/db/database.types";
import { createServiceClient, databaseConfigured } from "@/lib/db/server";
import { ro } from "@/i18n/ro";
import { cardSchema, configSchema } from "@/lib/schemas";
import { isPhotoPath, signPhotoMap, verifyStoredPhoto } from "@/lib/photos/access";
import type { PinGuard } from "@/lib/auth/pin";
import type { Destination } from "@/lib/remote/capture";
import { isViewId } from "@/lib/remote/config";
import { ROTATE_CONTROL, type DisplayControl } from "@/lib/remote/hold";
import { cleanInboxText, type ShoppingWrite, type TaskWrite } from "@/lib/remote/lists";
import {
  memoryCapture,
  memoryCards,
  memoryClearPriority,
  memoryConfig,
  memoryControl,
  memoryDeleteCard,
  memoryDeleteInbox,
  memoryDeleteShopping,
  memoryDeleteTask,
  memoryGuard,
  memoryInbox,
  memoryInsertCard,
  memoryInsertShopping,
  memoryInsertTask,
  memorySavePhoto,
  memorySetPriority,
  memoryShopping,
  memoryTasks,
  memoryUpdateCard,
  memoryUpdateShopping,
  memoryUpdateTask,
  memoryWriteConfig,
  memoryWriteControl,
  memoryWriteGuard,
} from "@/lib/remote/memory";
import type { EditableCard, InboxRow } from "@/lib/remote/types";
import type { DashboardConfig } from "@/lib/state/types";
import type { ImageKind } from "@/lib/photos/sniff";

function devMemory(): boolean {
  return !databaseConfigured() && process.env.NODE_ENV !== "production";
}

function blocked(): { ok: false; reason: string } | null {
  if (databaseConfigured() || devMemory()) return null;
  return { ok: false, reason: ro.remote.unavailable };
}

export async function readControl(): Promise<DisplayControl> {
  try {
    if (databaseConfigured()) return await dbControl();
    if (devMemory()) return memoryControl();
  } catch {
    return ROTATE_CONTROL;
  }
  return ROTATE_CONTROL;
}

export async function writeControl(control: DisplayControl): Promise<{ ok: true } | { ok: false; reason: string }> {
  const block = blocked();
  if (block) return block;
  try {
    if (databaseConfigured()) {
      const supabase = createServiceClient();
      const { error } = await supabase.from("display_control").upsert({
        id: 1,
        mode: control.mode,
        view_id: control.viewId,
        pinned_until: control.pinnedUntil,
        dimmed: control.dimmed,
      });
      if (error) return { ok: false, reason: ro.remote.unavailable };
      return { ok: true };
    }
    memoryWriteControl(control);
    return { ok: true };
  } catch {
    return { ok: false, reason: ro.remote.unavailable };
  }
}

export async function readGuard(): Promise<PinGuard> {
  if (databaseConfigured()) return dbGuard();
  if (devMemory()) return memoryGuard();
  return { failures: 0, lockedUntil: null };
}

export async function writeGuard(guard: PinGuard): Promise<void> {
  if (databaseConfigured()) {
    const supabase = createServiceClient();
    const { error } = await supabase.from("pin_guard").upsert({
      id: 1,
      failures: guard.failures,
      locked_until: guard.lockedUntil,
    });
    if (error) throw new Error("pin guard");
    return;
  }
  if (devMemory()) memoryWriteGuard(guard);
}

export async function readConfig(): Promise<DashboardConfig | null> {
  if (!databaseConfigured()) return devMemory() ? memoryConfig() : null;
  const supabase = createServiceClient();
  const { data, error } = await supabase.from("config").select("*").eq("id", 1).maybeSingle();
  if (error || !data) return null;
  const parsed = configSchema.safeParse({
    theme: data.theme,
    people: data.people,
    views: data.views,
    profiles: data.profiles,
    quietHours: data.quiet_hours,
    location: data.location,
    rules: data.rules,
  });
  return parsed.success ? parsed.data : null;
}

export async function writeConfig(config: DashboardConfig): Promise<{ ok: true } | { ok: false; reason: string }> {
  const block = blocked();
  if (block) return block;
  if (!databaseConfigured()) {
    memoryWriteConfig(config);
    return { ok: true };
  }
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("config")
    .update({
      theme: config.theme as unknown as Json,
      people: config.people as unknown as Json,
      views: config.views as unknown as Json,
      profiles: config.profiles as unknown as Json,
      quiet_hours: config.quietHours as unknown as Json,
      location: config.location as unknown as Json,
      rules: config.rules as unknown as Json,
    })
    .eq("id", 1);
  if (error) return { ok: false, reason: ro.remote.unavailable };
  return { ok: true };
}

export async function listCards(): Promise<EditableCard[]> {
  if (!databaseConfigured()) return devMemory() ? memoryCards() : [];
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("cards")
    .select("id, view_id, kind, title, body, color, tilt, grid_col, grid_row, grid_col_span, grid_row_span, expires_at, pinned, source, locked, data")
    .eq("view_id", "vision")
    .is("deleted_at", null);
  if (error || !data) return [];
  const paths = data.flatMap((row) => (isRecord(row.data) && typeof row.data.storagePath === "string" ? [row.data.storagePath] : []));
  const signed = await signPhotoMap(paths);
  return data.flatMap((row) => {
    const card = rowToCard(row, signed);
    return card ? [card] : [];
  });
}

export async function insertCard(card: EditableCard): Promise<{ ok: true } | { ok: false; reason: string }> {
  const block = blocked();
  if (block) return block;
  const photo = await acceptPhoto(card.data.storagePath, undefined);
  if (!photo.ok) return photo;
  if (!databaseConfigured()) {
    memoryInsertCard(card);
    return { ok: true };
  }
  const supabase = createServiceClient();
  const { error } = await supabase.from("cards").insert(cardRow(card));
  if (error) return { ok: false, reason: ro.remote.invalid };
  return { ok: true };
}

export async function updateCard(card: EditableCard): Promise<{ ok: true } | { ok: false; reason: string }> {
  const block = blocked();
  if (block) return block;
  const existing = await cardPath(card.id);
  if (existing === undefined) return { ok: false, reason: ro.remote.missing };
  const photo = await acceptPhoto(card.data.storagePath, existing);
  if (!photo.ok) return photo;
  if (!databaseConfigured()) {
    return memoryUpdateCard(card) ? { ok: true } : { ok: false, reason: ro.remote.missing };
  }
  const supabase = createServiceClient();
  const { error } = await supabase.from("cards").update(cardRow(card)).eq("id", card.id).is("deleted_at", null);
  if (error) return { ok: false, reason: ro.remote.invalid };
  return { ok: true };
}

export async function deleteCard(id: string, now: Date): Promise<{ ok: true } | { ok: false; reason: string }> {
  const block = blocked();
  if (block) return block;
  if (!databaseConfigured()) {
    return memoryDeleteCard(id, now) ? { ok: true } : { ok: false, reason: ro.remote.missing };
  }
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("cards")
    .update({ deleted_at: now.toISOString(), source: "manual", locked: true })
    .eq("id", id)
    .is("deleted_at", null);
  if (error) return { ok: false, reason: ro.remote.unavailable };
  return { ok: true };
}

export async function rememberPhoto(path: string, bytes: Uint8Array, type: ImageKind): Promise<boolean> {
  if (databaseConfigured()) return false;
  if (!devMemory()) return false;
  memorySavePhoto(path, bytes, type);
  return true;
}

export async function listTasks(): Promise<{ id: string; value: TaskWrite }[]> {
  if (!databaseConfigured()) {
    return devMemory() ? memoryTasks().map((task) => ({ id: task.id, value: task })) : [];
  }
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("tasks")
    .select("id, text, done, assignee_id, due_date")
    .is("deleted_at", null);
  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id,
    value: { text: row.text, done: row.done, assigneeId: row.assignee_id, dueDate: row.due_date },
  }));
}

export async function insertTask(value: TaskWrite): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  const block = blocked();
  if (block) return block;
  const id = crypto.randomUUID();
  if (!databaseConfigured()) {
    memoryInsertTask({ id, ...value, source: "manual", locked: true, deletedAt: null });
    return { ok: true, id };
  }
  const supabase = createServiceClient();
  const { error } = await supabase.from("tasks").insert({
    id,
    text: value.text,
    done: value.done,
    assignee_id: value.assigneeId,
    due_date: value.dueDate,
    source: "manual",
    locked: true,
  });
  if (error) return { ok: false, reason: ro.remote.invalid };
  return { ok: true, id };
}

export async function patchTask(id: string, value: TaskWrite): Promise<{ ok: true } | { ok: false; reason: string }> {
  const block = blocked();
  if (block) return block;
  if (!databaseConfigured()) {
    return memoryUpdateTask(id, value) ? { ok: true } : { ok: false, reason: ro.remote.missing };
  }
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("tasks")
    .update({
      text: value.text,
      done: value.done,
      assignee_id: value.assigneeId,
      due_date: value.dueDate,
      source: "manual",
      locked: true,
    })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id");
  if (error) return { ok: false, reason: ro.remote.unavailable };
  if (!data || data.length === 0) return { ok: false, reason: ro.remote.missing };
  return { ok: true };
}

export async function removeTask(id: string, now: Date): Promise<{ ok: true } | { ok: false; reason: string }> {
  return softDelete("tasks", id, now, memoryDeleteTask);
}

export async function listShopping(): Promise<{ id: string; value: ShoppingWrite }[]> {
  if (!databaseConfigured()) {
    return devMemory() ? memoryShopping().map((item) => ({ id: item.id, value: item })) : [];
  }
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("shopping_items")
    .select("id, text, qty, unit, category, checked")
    .is("deleted_at", null);
  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id,
    value: {
      text: row.text,
      qty: Number(row.qty),
      unit: row.unit,
      category: row.category,
      checked: row.checked,
    },
  }));
}

export async function insertShopping(value: ShoppingWrite): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  const block = blocked();
  if (block) return block;
  const id = crypto.randomUUID();
  if (!databaseConfigured()) {
    memoryInsertShopping({ id, ...value, source: "manual", locked: true, deletedAt: null });
    return { ok: true, id };
  }
  const supabase = createServiceClient();
  const { error } = await supabase.from("shopping_items").insert({
    id,
    text: value.text,
    qty: value.qty,
    unit: value.unit,
    category: value.category,
    checked: value.checked,
    source: "manual",
    locked: true,
  });
  if (error) return { ok: false, reason: ro.remote.invalid };
  return { ok: true, id };
}

export async function patchShopping(id: string, value: ShoppingWrite): Promise<{ ok: true } | { ok: false; reason: string }> {
  const block = blocked();
  if (block) return block;
  if (!databaseConfigured()) {
    return memoryUpdateShopping(id, value) ? { ok: true } : { ok: false, reason: ro.remote.missing };
  }
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("shopping_items")
    .update({
      text: value.text,
      qty: value.qty,
      unit: value.unit,
      category: value.category,
      checked: value.checked,
      source: "manual",
      locked: true,
    })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id");
  if (error) return { ok: false, reason: ro.remote.unavailable };
  if (!data || data.length === 0) return { ok: false, reason: ro.remote.missing };
  return { ok: true };
}

export async function removeShopping(id: string, now: Date): Promise<{ ok: true } | { ok: false; reason: string }> {
  return softDelete("shopping_items", id, now, memoryDeleteShopping);
}

export async function listInbox(): Promise<InboxRow[]> {
  if (!databaseConfigured()) return devMemory() ? memoryInbox() : [];
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("inbox_items")
    .select("id, text, received_at, status, routed_to")
    .is("deleted_at", null)
    .order("received_at", { ascending: false })
    .limit(50);
  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id,
    text: row.text,
    receivedAt: row.received_at,
    status: row.status,
    routedTo: routed(row.routed_to),
  }));
}

export async function captureItem(
  text: string,
  destination: Destination,
  now: Date,
): Promise<{ ok: true; item: InboxRow } | { ok: false; reason: string }> {
  const block = blocked();
  if (block) return block;
  const clean = cleanInboxText(text);
  if (!clean) return { ok: false, reason: ro.remote.invalid };
  if (destination === "shopping" && clean.length > 200) return { ok: false, reason: ro.remote.tooLong };
  if (!databaseConfigured()) return { ok: true, item: memoryCapture(clean, destination, now) };

  const supabase = createServiceClient();
  let routedTo: InboxRow["routedTo"] = null;
  let status: InboxRow["status"] = "new";
  if (destination === "task") {
    const id = crypto.randomUUID();
    const { error } = await supabase.from("tasks").insert({
      id,
      text: clean,
      done: false,
      source: "manual",
      locked: true,
    });
    if (error) return { ok: false, reason: ro.remote.unavailable };
    routedTo = { type: "task", id };
    status = "routed";
  } else if (destination === "shopping") {
    const id = crypto.randomUUID();
    const { error } = await supabase.from("shopping_items").insert({
      id,
      text: clean,
      qty: 1,
      checked: false,
      source: "manual",
      locked: true,
    });
    if (error) return { ok: false, reason: ro.remote.unavailable };
    routedTo = { type: "shopping", id };
    status = "routed";
  } else if (destination === "idea") {
    const id = crypto.randomUUID();
    const { error } = await supabase.from("ideas").insert({
      id,
      text: clean,
      tags: [],
      source: "manual",
      locked: true,
    });
    if (error) return { ok: false, reason: ro.remote.unavailable };
    routedTo = { type: "idea", id };
    status = "routed";
  }
  const id = crypto.randomUUID();
  const receivedAt = now.toISOString();
  const { error } = await supabase.from("inbox_items").insert({
    id,
    text: clean,
    received_at: receivedAt,
    status,
    routed_to: routedTo as unknown as Json,
    source: "manual",
  });
  if (error) return { ok: false, reason: ro.remote.unavailable };
  return { ok: true, item: { id, text: clean, receivedAt, status, routedTo } };
}

export async function removeInbox(id: string, now: Date): Promise<{ ok: true } | { ok: false; reason: string }> {
  return softDelete("inbox_items", id, now, memoryDeleteInbox);
}

export async function setManualPriority(
  value: { text: string; reason: string; dueAt: string | null; expiresAt: string },
  now: Date,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const block = blocked();
  if (block) return block;
  if (!databaseConfigured()) {
    memorySetPriority(value, now);
    return { ok: true };
  }
  const supabase = createServiceClient();
  const { error } = await supabase.from("priorities").insert({
    text: value.text,
    reason: value.reason,
    due_at: value.dueAt,
    expires_at: value.expiresAt,
    source: "manual",
    locked: true,
  });
  if (error) return { ok: false, reason: ro.remote.invalid };
  return { ok: true };
}

export async function clearLivePriority(now: Date): Promise<{ ok: true } | { ok: false; reason: string }> {
  const block = blocked();
  if (block) return block;
  if (!databaseConfigured()) {
    memoryClearPriority(now);
    return { ok: true };
  }
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("priorities")
    .update({ deleted_at: now.toISOString() })
    .is("deleted_at", null)
    .gt("expires_at", now.toISOString());
  if (error) return { ok: false, reason: ro.remote.unavailable };
  return { ok: true };
}

export async function peopleIds(): Promise<string[]> {
  const config = await readConfig();
  return config?.people.map((person) => person.id) ?? [];
}

async function dbControl(): Promise<DisplayControl> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("display_control")
    .select("mode, view_id, pinned_until, dimmed")
    .eq("id", 1)
    .maybeSingle();
  if (error || !data) return ROTATE_CONTROL;
  if (data.mode !== "rotate" && data.mode !== "paused" && data.mode !== "pinned" && data.mode !== "locked") {
    return ROTATE_CONTROL;
  }
  return {
    mode: data.mode,
    viewId: data.view_id && isViewId(data.view_id) ? data.view_id : null,
    pinnedUntil: data.pinned_until,
    dimmed: data.dimmed,
  };
}

async function dbGuard(): Promise<PinGuard> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.from("pin_guard").select("failures, locked_until").eq("id", 1).maybeSingle();
  if (error) throw new Error("pin guard");
  if (!data) return { failures: 0, lockedUntil: null };
  return { failures: data.failures, lockedUntil: data.locked_until };
}

async function softDelete(
  table: "tasks" | "shopping_items" | "inbox_items",
  id: string,
  now: Date,
  memoryDelete: (id: string, now: Date) => boolean,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const block = blocked();
  if (block) return block;
  if (!databaseConfigured()) {
    return memoryDelete(id, now) ? { ok: true } : { ok: false, reason: ro.remote.missing };
  }
  const supabase = createServiceClient();
  const deletedAt = now.toISOString();
  const result =
    table === "inbox_items"
      ? await supabase.from(table).update({ deleted_at: deletedAt }).eq("id", id).is("deleted_at", null)
      : await supabase.from(table).update({ deleted_at: deletedAt, source: "manual", locked: true }).eq("id", id).is("deleted_at", null);
  const { error } = result;
  if (error) return { ok: false, reason: ro.remote.unavailable };
  return { ok: true };
}

async function cardPath(id: string): Promise<string | null | undefined> {
  if (!databaseConfigured()) {
    const card = memoryCards().find((item) => item.id === id);
    if (!card) return undefined;
    return typeof card.data.storagePath === "string" ? card.data.storagePath : null;
  }
  const supabase = createServiceClient();
  const { data, error } = await supabase.from("cards").select("data").eq("id", id).is("deleted_at", null).maybeSingle();
  if (error || !data) return undefined;
  if (!isRecord(data.data)) return null;
  return typeof data.data.storagePath === "string" ? data.data.storagePath : null;
}

async function acceptPhoto(path: unknown, previous: string | null | undefined): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (typeof path !== "string" || !path) return { ok: true };
  if (path === previous) return { ok: true };
  if (!isPhotoPath(path)) return { ok: false, reason: ro.remote.badPhoto };
  const ok = await verifyStoredPhoto(path);
  return ok ? { ok: true } : { ok: false, reason: ro.remote.badPhoto };
}

function cardRow(card: EditableCard) {
  return {
    id: card.id,
    view_id: "vision",
    kind: card.kind,
    title: card.title,
    body: card.body,
    color: card.color,
    tilt: card.tilt,
    grid_col: card.grid.col,
    grid_row: card.grid.row,
    grid_col_span: card.grid.colSpan,
    grid_row_span: card.grid.rowSpan,
    expires_at: card.expiresAt,
    pinned: card.pinned,
    source: card.source,
    locked: card.locked,
    data: card.data as unknown as Json,
  };
}

function rowToCard(
  row: {
    id: string;
    kind: EditableCard["kind"];
    title: string | null;
    body: string | null;
    color: string;
    tilt: number;
    grid_col: number;
    grid_row: number;
    grid_col_span: number;
    grid_row_span: number;
    expires_at: string | null;
    pinned: boolean;
    source: EditableCard["source"];
    locked: boolean;
    data: Json;
  },
  signed: Map<string, string>,
): EditableCard | null {
  const data = isRecord(row.data) ? row.data : {};
  const parsed = cardSchema.safeParse({
    id: row.id,
    viewId: "vision",
    kind: row.kind,
    title: row.title ?? undefined,
    body: row.body ?? undefined,
    color: row.color,
    tilt: Number(row.tilt),
    grid: { col: row.grid_col, row: row.grid_row, colSpan: row.grid_col_span, rowSpan: row.grid_row_span },
    expiresAt: row.expires_at ?? undefined,
    pinned: row.pinned,
    source: row.source,
    locked: row.locked,
    data,
  });
  if (!parsed.success) return null;
  const dataRecord = parsed.data.data as Record<string, unknown>;
  const path = typeof dataRecord.storagePath === "string" ? dataRecord.storagePath : "";
  return {
    id: parsed.data.id,
    kind: parsed.data.kind,
    title: parsed.data.title ?? null,
    body: parsed.data.body ?? null,
    color: parsed.data.color,
    tilt: parsed.data.tilt,
    grid: parsed.data.grid,
    expiresAt: parsed.data.expiresAt ?? null,
    pinned: parsed.data.pinned,
    source: parsed.data.source,
    locked: parsed.data.locked,
    data: dataRecord,
    photoUrl: signed.get(path) ?? null,
  };
}

function routed(value: Json | null): InboxRow["routedTo"] {
  if (!isRecord(value)) return null;
  if (typeof value.type !== "string" || typeof value.id !== "string") return null;
  return { type: value.type, id: value.id };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
