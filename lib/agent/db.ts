import type { Json } from "@/lib/db/database.types";
import { createServiceClient } from "@/lib/db/server";
import { uploadPhotoObject } from "@/lib/photos/access";
import { extensionFor, type ImageKind } from "@/lib/photos/sniff";
import { ROTATE_CONTROL, type DisplayControl } from "@/lib/remote/hold";
import { configSchema } from "@/lib/schemas";
import { sampleConfig } from "@/lib/seed/sample-config";
import {
  copy,
  type AgentStore,
  type AuditRow,
  type AuditSummary,
  type CardRecord,
  type EventRecord,
  type IdeaRecord,
  type InboxRecord,
  type MetricRecord,
  type PersonRow,
  type PriorityRecord,
  type RecapRecord,
  type ShoppingRecord,
  type TaskRecord,
  type ToolResult,
  type UndoBody,
  type ViewRow,
} from "@/lib/agent/model";

type Client = ReturnType<typeof createServiceClient>;

export class SupabaseStore implements AgentStore {
  private readonly db: Client;

  constructor(db: Client = createServiceClient()) {
    this.db = db;
  }

  async countRecent(now: Date): Promise<number> {
    const since = new Date(now.getTime() - 60_000).toISOString();
    const { count, error } = await this.db.from("audit_log").select("id", { count: "exact", head: true }).gte("created_at", since);
    if (error) throw new Error("db");
    return count ?? 0;
  }

  async audit(entry: { tool: string; argsHash: string; result: ToolResult; undo: UndoBody | null; now: Date }): Promise<void> {
    const { error } = await this.db.from("audit_log").insert({
      tool: entry.tool,
      args_hash: entry.argsHash,
      result: copy(entry.result) as Json,
      undo: entry.undo ? (copy(entry.undo) as Json) : null,
    });
    if (error) throw new Error("db");
  }

  async recentUndoable(): Promise<AuditRow[]> {
    const { data, error } = await this.db
      .from("audit_log")
      .select("id, tool, undo, result, created_at")
      .not("undo", "is", null)
      .neq("tool", "undo")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error || !data) throw new Error("db");
    return data.map((row) => ({
      id: row.id,
      tool: row.tool,
      undo: asUndo(row.undo),
      undoneAt: undoneAt(row.result),
      createdAt: row.created_at,
    }));
  }

  async recentAudits(limit: number): Promise<AuditSummary[]> {
    const { data, error } = await this.db
      .from("audit_log")
      .select("id, tool, undo, result, created_at")
      .order("created_at", { ascending: false })
      .limit(Math.max(0, limit));
    if (error || !data) throw new Error("db");
    return data.map((row) => {
      const result = asObject(row.result);
      const ok = result.ok === true;
      const undone = undoneAt(row.result);
      return {
        id: row.id,
        tool: row.tool,
        createdAt: row.created_at,
        ok,
        reason: typeof result.reason === "string" ? result.reason : null,
        undone: Boolean(undone),
        canUndo: ok && row.tool !== "undo" && row.undo != null && !undone,
      };
    });
  }

  async markUndone(id: string, now: Date): Promise<void> {
    const { data, error } = await this.db.from("audit_log").select("result").eq("id", id).maybeSingle();
    if (error || !data) throw new Error("db");
    const result = { ...asObject(data.result), undoneAt: now.toISOString() };
    const update = await this.db.from("audit_log").update({ result }).eq("id", id);
    if (update.error) throw new Error("db");
  }

  async applyUndo(body: UndoBody, now: Date): Promise<void> {
    for (const card of body.cards ?? []) await this.putCard(card);
    for (const event of body.events ?? []) await this.putEvent(event);
    for (const task of body.tasks ?? []) await this.putTask(task);
    for (const item of body.shopping ?? []) await this.putShopping(item);
    for (const recap of body.recaps ?? []) await this.putRecap(recap);
    for (const priority of body.priorities ?? []) await this.putPriority(priority);
    for (const item of body.inbox ?? []) await this.putInbox(item);
    for (const idea of body.ideas ?? []) await this.putIdea(idea);
    for (const metric of body.metrics ?? []) await this.putMetric(metric);
    await this.drop("cards", body.drop?.cards, now);
    await this.drop("events", body.drop?.events, now);
    await this.drop("tasks", body.drop?.tasks, now);
    await this.drop("shopping_items", body.drop?.shopping, now);
    await this.drop("recaps", body.drop?.recaps, now);
    await this.drop("priorities", body.drop?.priorities, now);
    await this.drop("inbox_items", body.drop?.inbox, now);
    await this.drop("ideas", body.drop?.ideas, now);
    await this.drop("metrics", body.drop?.metrics, now);
    if (body.control) await this.putControl(body.control);
  }

  async views(): Promise<ViewRow[]> {
    const config = await this.config();
    return config.views.map((view) => ({ ...view }));
  }

  async people(): Promise<PersonRow[]> {
    const config = await this.config();
    return config.people.map((person) => ({ id: person.id, name: person.name }));
  }

  async cards(): Promise<CardRecord[]> {
    const { data, error } = await this.db.from("cards").select("*");
    if (error || !data) throw new Error("db");
    return data.map(cardFrom);
  }

  async putCard(card: CardRecord): Promise<void> {
    const { error } = await this.db.from("cards").upsert({
      id: card.id,
      view_id: card.viewId,
      kind: card.kind,
      title: card.title,
      body: card.body,
      color: card.color,
      tilt: card.tilt,
      grid_col: card.gridCol,
      grid_row: card.gridRow,
      grid_col_span: card.gridColSpan,
      grid_row_span: card.gridRowSpan,
      expires_at: card.expiresAt,
      pinned: card.pinned,
      source: card.source,
      locked: card.locked,
      external_id: card.externalId,
      data: card.data as Json,
      deleted_at: card.deletedAt,
    });
    if (error) throw new Error("db");
  }

  async events(): Promise<EventRecord[]> {
    const { data, error } = await this.db.from("events").select("*");
    if (error || !data) throw new Error("db");
    return data.map(eventFrom);
  }

  async putEvent(event: EventRecord): Promise<void> {
    const { error } = await this.db.from("events").upsert({
      id: event.id,
      title: event.title,
      starts_at: event.startsAt,
      ends_at: event.endsAt,
      all_day: event.allDay,
      person_id: event.personId,
      source: event.source,
      locked: event.locked,
      external_id: event.externalId,
      deleted_at: event.deletedAt,
    });
    if (error) throw new Error("db");
  }

  async tasks(): Promise<TaskRecord[]> {
    const { data, error } = await this.db.from("tasks").select("*");
    if (error || !data) throw new Error("db");
    return data.map(taskFrom);
  }

  async putTask(task: TaskRecord): Promise<void> {
    const { error } = await this.db.from("tasks").upsert({
      id: task.id,
      text: task.text,
      done: task.done,
      assignee_id: task.assigneeId,
      due_date: task.dueDate,
      source: task.source,
      locked: task.locked,
      external_id: task.externalId,
      deleted_at: task.deletedAt,
    });
    if (error) throw new Error("db");
  }

  async shopping(): Promise<ShoppingRecord[]> {
    const { data, error } = await this.db.from("shopping_items").select("*");
    if (error || !data) throw new Error("db");
    return data.map(shoppingFrom);
  }

  async putShopping(item: ShoppingRecord): Promise<void> {
    const { error } = await this.db.from("shopping_items").upsert({
      id: item.id,
      text: item.text,
      qty: item.qty,
      unit: item.unit,
      category: item.category,
      checked: item.checked,
      source: item.source,
      locked: item.locked,
      external_id: item.externalId,
      deleted_at: item.deletedAt,
    });
    if (error) throw new Error("db");
  }

  async recaps(): Promise<RecapRecord[]> {
    const { data, error } = await this.db.from("recaps").select("*");
    if (error || !data) throw new Error("db");
    return data.map(recapFrom);
  }

  async putRecap(recap: RecapRecord): Promise<void> {
    const { error } = await this.db.from("recaps").upsert({
      id: recap.id,
      text: recap.text,
      highlights: recap.highlights as Json,
      expires_at: recap.expiresAt,
      source: recap.source,
      locked: recap.locked,
      external_id: recap.externalId,
      deleted_at: recap.deletedAt,
      created_at: recap.createdAt,
    });
    if (error) throw new Error("db");
  }

  async priorities(): Promise<PriorityRecord[]> {
    const { data, error } = await this.db.from("priorities").select("*");
    if (error || !data) throw new Error("db");
    return data.map(priorityFrom);
  }

  async putPriority(row: PriorityRecord): Promise<void> {
    const { error } = await this.db.from("priorities").upsert({
      id: row.id,
      text: row.text,
      reason: row.reason,
      due_at: row.dueAt,
      task_id: row.taskId,
      expires_at: row.expiresAt,
      source: row.source,
      locked: row.locked,
      external_id: row.externalId,
      deleted_at: row.deletedAt,
    });
    if (error) throw new Error("db");
  }

  async inbox(): Promise<InboxRecord[]> {
    const { data, error } = await this.db.from("inbox_items").select("*");
    if (error || !data) throw new Error("db");
    return data.map(inboxFrom);
  }

  async putInbox(row: InboxRecord): Promise<void> {
    const { error } = await this.db.from("inbox_items").upsert({
      id: row.id,
      text: row.text,
      received_at: row.receivedAt,
      status: row.status,
      routed_to: row.routedTo as Json,
      source: "manual",
      deleted_at: row.deletedAt,
    });
    if (error) throw new Error("db");
  }

  async ideas(): Promise<IdeaRecord[]> {
    const { data, error } = await this.db.from("ideas").select("*");
    if (error || !data) throw new Error("db");
    return data.map(ideaFrom);
  }

  async putIdea(row: IdeaRecord): Promise<void> {
    const { error } = await this.db.from("ideas").upsert({
      id: row.id,
      text: row.text,
      tags: row.tags,
      source: row.source,
      locked: row.locked,
      external_id: row.externalId,
      deleted_at: row.deletedAt,
    });
    if (error) throw new Error("db");
  }

  async metrics(): Promise<MetricRecord[]> {
    const { data, error } = await this.db.from("metrics").select("*");
    if (error || !data) throw new Error("db");
    return data.map(metricFrom);
  }

  async putMetric(row: MetricRecord): Promise<void> {
    const { error } = await this.db.from("metrics").upsert({
      id: row.id,
      key: row.key,
      value: row.value,
      previous: row.previous,
      fetched_at: row.fetchedAt,
      source: row.source,
      external_id: row.externalId,
      deleted_at: row.deletedAt,
    });
    if (error) throw new Error("db");
  }

  async control(): Promise<DisplayControl> {
    const { data, error } = await this.db.from("display_control").select("mode, view_id, pinned_until, dimmed").eq("id", 1).maybeSingle();
    if (error || !data) return { ...ROTATE_CONTROL };
    if (data.mode !== "rotate" && data.mode !== "paused" && data.mode !== "pinned" && data.mode !== "locked") {
      return { ...ROTATE_CONTROL };
    }
    return { mode: data.mode, viewId: data.view_id as DisplayControl["viewId"], pinnedUntil: data.pinned_until, dimmed: data.dimmed };
  }

  async putControl(control: DisplayControl): Promise<void> {
    const { error } = await this.db.from("display_control").upsert({
      id: 1,
      mode: control.mode,
      view_id: control.viewId,
      pinned_until: control.pinnedUntil,
      dimmed: control.dimmed,
    });
    if (error) throw new Error("db");
  }

  async saveImage(bytes: Uint8Array, type: ImageKind): Promise<string> {
    const path = `agent/${crypto.randomUUID()}.${extensionFor(type)}`;
    const saved = await uploadPhotoObject(path, bytes, type);
    if (!saved) throw new Error("db");
    return path;
  }

  private async config() {
    const { data, error } = await this.db.from("config").select("views, people").eq("id", 1).maybeSingle();
    if (error || !data) return sampleConfig;
    const views = configSchema.shape.views.safeParse(data.views);
    const people = configSchema.shape.people.safeParse(data.people);
    return {
      views: views.success ? views.data : sampleConfig.views,
      people: people.success ? people.data : sampleConfig.people,
    };
  }

  private async drop(
    table: "cards" | "events" | "tasks" | "shopping_items" | "recaps" | "priorities" | "inbox_items" | "ideas" | "metrics",
    ids: string[] | undefined,
    now: Date,
  ): Promise<void> {
    if (!ids || ids.length === 0) return;
    const { error } = await this.db.from(table).update({ deleted_at: now.toISOString() }).in("id", ids).is("deleted_at", null);
    if (error) throw new Error("db");
  }
}

function cardFrom(row: {
  id: string;
  view_id: string;
  kind: CardRecord["kind"];
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
  source: CardRecord["source"];
  locked: boolean;
  external_id: string | null;
  data: Json;
  deleted_at: string | null;
}): CardRecord {
  return {
    id: row.id,
    viewId: row.view_id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    color: row.color as CardRecord["color"],
    tilt: Number(row.tilt),
    gridCol: row.grid_col,
    gridRow: row.grid_row,
    gridColSpan: row.grid_col_span,
    gridRowSpan: row.grid_row_span,
    expiresAt: row.expires_at,
    pinned: row.pinned,
    source: row.source,
    locked: row.locked,
    externalId: row.external_id,
    data: asObject(row.data),
    deletedAt: row.deleted_at,
  };
}

function eventFrom(row: {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  person_id: string | null;
  source: EventRecord["source"];
  locked: boolean;
  external_id: string | null;
  deleted_at: string | null;
}): EventRecord {
  return {
    id: row.id,
    title: row.title,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    allDay: row.all_day,
    personId: row.person_id,
    source: row.source,
    locked: row.locked,
    externalId: row.external_id,
    deletedAt: row.deleted_at,
  };
}

function taskFrom(row: {
  id: string;
  text: string;
  done: boolean;
  assignee_id: string | null;
  due_date: string | null;
  source: TaskRecord["source"];
  locked: boolean;
  external_id: string | null;
  deleted_at: string | null;
}): TaskRecord {
  return {
    id: row.id,
    text: row.text,
    done: row.done,
    assigneeId: row.assignee_id,
    dueDate: row.due_date,
    source: row.source,
    locked: row.locked,
    externalId: row.external_id,
    deletedAt: row.deleted_at,
  };
}

function shoppingFrom(row: {
  id: string;
  text: string;
  qty: number;
  unit: string | null;
  category: string | null;
  checked: boolean;
  source: ShoppingRecord["source"];
  locked: boolean;
  external_id: string | null;
  deleted_at: string | null;
}): ShoppingRecord {
  return {
    id: row.id,
    text: row.text,
    qty: Number(row.qty),
    unit: row.unit,
    category: row.category,
    checked: row.checked,
    source: row.source,
    locked: row.locked,
    externalId: row.external_id,
    deletedAt: row.deleted_at,
  };
}

function recapFrom(row: {
  id: string;
  text: string;
  highlights: Json;
  expires_at: string | null;
  source: RecapRecord["source"];
  locked: boolean;
  external_id: string | null;
  deleted_at: string | null;
  created_at: string;
}): RecapRecord {
  return {
    id: row.id,
    text: row.text,
    highlights: Array.isArray(row.highlights) ? row.highlights.filter((item): item is string => typeof item === "string") : [],
    expiresAt: row.expires_at,
    source: row.source,
    locked: row.locked,
    externalId: row.external_id,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
  };
}

function priorityFrom(row: {
  id: string;
  text: string;
  reason: string;
  due_at: string | null;
  task_id: string | null;
  expires_at: string;
  source: PriorityRecord["source"];
  locked: boolean;
  external_id: string | null;
  deleted_at: string | null;
  updated_at: string;
}): PriorityRecord {
  return {
    id: row.id,
    text: row.text,
    reason: row.reason,
    dueAt: row.due_at,
    taskId: row.task_id,
    expiresAt: row.expires_at,
    source: row.source,
    locked: row.locked,
    externalId: row.external_id,
    deletedAt: row.deleted_at,
    updatedAt: row.updated_at,
  };
}

function inboxFrom(row: {
  id: string;
  text: string;
  received_at: string;
  status: InboxRecord["status"];
  routed_to: Json | null;
  deleted_at: string | null;
}): InboxRecord {
  const routed = asObject(row.routed_to);
  const routedTo =
    typeof routed.type === "string" && typeof routed.id === "string" ? { type: routed.type, id: routed.id } : null;
  return {
    id: row.id,
    text: row.text,
    receivedAt: row.received_at,
    status: row.status,
    routedTo,
    deletedAt: row.deleted_at,
  };
}

function ideaFrom(row: {
  id: string;
  text: string;
  tags: string[];
  source: IdeaRecord["source"];
  locked: boolean;
  external_id: string | null;
  deleted_at: string | null;
}): IdeaRecord {
  return {
    id: row.id,
    text: row.text,
    tags: row.tags,
    source: row.source,
    locked: row.locked,
    externalId: row.external_id,
    deletedAt: row.deleted_at,
  };
}

function metricFrom(row: {
  id: string;
  key: string;
  value: number;
  previous: number | null;
  fetched_at: string;
  source: MetricRecord["source"];
  external_id: string | null;
  deleted_at: string | null;
}): MetricRecord {
  return {
    id: row.id,
    key: row.key,
    value: Number(row.value),
    previous: row.previous === null ? null : Number(row.previous),
    fetchedAt: row.fetched_at,
    source: row.source,
    externalId: row.external_id,
    deletedAt: row.deleted_at,
  };
}

function asObject(value: Json | null | undefined): Record<string, Json | undefined> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function asUndo(value: Json | null): UndoBody | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as UndoBody;
}

function undoneAt(value: Json): string | null {
  const record = asObject(value);
  return typeof record.undoneAt === "string" ? record.undoneAt : null;
}
