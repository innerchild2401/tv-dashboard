import type { ImageKind } from "@/lib/photos/sniff";
import type { DisplayControl } from "@/lib/remote/hold";

export const TOOL_NAMES = [
  "get_dashboard_state",
  "get_schema",
  "upsert_card",
  "delete_card",
  "set_recap",
  "set_priority",
  "get_inbox",
  "route_inbox_item",
  "upsert_events",
  "upsert_task",
  "shopping_add",
  "shopping_check",
  "set_metric",
  "pin_view",
  "undo",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export const RATE_LIMIT = 60;

export type Source = "manual" | "assistant" | "integration";
export type CardKind = "photo" | "affirmation" | "countdown" | "word" | "progress" | "wins" | "recap" | "note";
export type Palette = "sand" | "coral" | "lilac" | "mint" | "sky" | "pink";
export type InboxStatus = "new" | "routed" | "needs_review";

export type ToolResult = {
  ok: boolean;
  id: string | null;
  warnings: string[];
  reason?: string;
  status?: InboxStatus;
  state?: unknown;
  items?: unknown[];
  schema?: unknown;
};

export type CardRecord = {
  id: string;
  viewId: string;
  kind: CardKind;
  title: string | null;
  body: string | null;
  color: Palette;
  tilt: number;
  gridCol: number;
  gridRow: number;
  gridColSpan: number;
  gridRowSpan: number;
  expiresAt: string | null;
  pinned: boolean;
  source: Source;
  locked: boolean;
  externalId: string | null;
  data: Record<string, unknown>;
  deletedAt: string | null;
};

export type EventRecord = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  personId: string | null;
  source: Source;
  locked: boolean;
  externalId: string | null;
  deletedAt: string | null;
};

export type TaskRecord = {
  id: string;
  text: string;
  done: boolean;
  assigneeId: string | null;
  dueDate: string | null;
  source: Source;
  locked: boolean;
  externalId: string | null;
  deletedAt: string | null;
};

export type ShoppingRecord = {
  id: string;
  text: string;
  qty: number;
  unit: string | null;
  category: string | null;
  checked: boolean;
  source: Source;
  locked: boolean;
  externalId: string | null;
  deletedAt: string | null;
};

export type RecapRecord = {
  id: string;
  text: string;
  highlights: string[];
  expiresAt: string | null;
  source: Source;
  locked: boolean;
  externalId: string | null;
  deletedAt: string | null;
  createdAt: string;
};

export type PriorityRecord = {
  id: string;
  text: string;
  reason: string;
  dueAt: string | null;
  taskId: string | null;
  expiresAt: string;
  source: Source;
  locked: boolean;
  externalId: string | null;
  deletedAt: string | null;
  updatedAt: string;
};

export type InboxRecord = {
  id: string;
  text: string;
  receivedAt: string;
  status: InboxStatus;
  routedTo: { type: string; id: string } | null;
  deletedAt: string | null;
};

export type IdeaRecord = {
  id: string;
  text: string;
  tags: string[];
  source: Source;
  locked: boolean;
  externalId: string | null;
  deletedAt: string | null;
};

export type MetricRecord = {
  id: string;
  key: string;
  value: number;
  previous: number | null;
  fetchedAt: string;
  source: Source;
  externalId: string | null;
  deletedAt: string | null;
};

export type UndoBody = {
  cards?: CardRecord[];
  events?: EventRecord[];
  tasks?: TaskRecord[];
  shopping?: ShoppingRecord[];
  recaps?: RecapRecord[];
  priorities?: PriorityRecord[];
  inbox?: InboxRecord[];
  ideas?: IdeaRecord[];
  metrics?: MetricRecord[];
  drop?: Partial<Record<"cards" | "events" | "tasks" | "shopping" | "recaps" | "priorities" | "inbox" | "ideas" | "metrics", string[]>>;
  control?: DisplayControl;
  expectControl?: DisplayControl;
};

export type AuditRow = {
  id: string;
  tool: string;
  undo: UndoBody | null;
  undoneAt: string | null;
  createdAt: string;
};

export type ViewRow = { id: string; enabled: boolean; order: number; dwellSeconds: number; weight: number };
export type PersonRow = { id: string; name: string };

export interface AgentStore {
  countRecent(now: Date): Promise<number>;
  audit(entry: { tool: string; argsHash: string; result: ToolResult; undo: UndoBody | null; now: Date }): Promise<void>;
  recentUndoable(): Promise<AuditRow[]>;
  markUndone(id: string, now: Date): Promise<void>;
  applyUndo(body: UndoBody, now: Date): Promise<void>;
  views(): Promise<ViewRow[]>;
  people(): Promise<PersonRow[]>;
  cards(): Promise<CardRecord[]>;
  putCard(card: CardRecord): Promise<void>;
  events(): Promise<EventRecord[]>;
  putEvent(event: EventRecord): Promise<void>;
  tasks(): Promise<TaskRecord[]>;
  putTask(task: TaskRecord): Promise<void>;
  shopping(): Promise<ShoppingRecord[]>;
  putShopping(item: ShoppingRecord): Promise<void>;
  recaps(): Promise<RecapRecord[]>;
  putRecap(recap: RecapRecord): Promise<void>;
  priorities(): Promise<PriorityRecord[]>;
  putPriority(row: PriorityRecord): Promise<void>;
  inbox(): Promise<InboxRecord[]>;
  putInbox(row: InboxRecord): Promise<void>;
  ideas(): Promise<IdeaRecord[]>;
  putIdea(row: IdeaRecord): Promise<void>;
  metrics(): Promise<MetricRecord[]>;
  putMetric(row: MetricRecord): Promise<void>;
  control(): Promise<DisplayControl>;
  putControl(control: DisplayControl): Promise<void>;
  saveImage(bytes: Uint8Array, type: ImageKind): Promise<string>;
}

export function success(id: string | null, warnings: string[] = [], extra: Partial<ToolResult> = {}): ToolResult {
  return { ok: true, id, warnings, ...extra };
}

export function refusal(reason: string): ToolResult {
  return { ok: false, id: null, warnings: [], reason };
}

export function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function active<T extends { deletedAt: string | null }>(rows: T[]): T[] {
  return rows.filter((row) => !row.deletedAt);
}

export function textKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 160);
}
