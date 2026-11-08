import { sampleSnapshot } from "@/lib/state/sample";
import type { Snapshot, SnapshotCard, SnapshotPriority } from "@/lib/state/types";
import type { DashboardConfig } from "@/lib/state/types";
import { ROTATE_CONTROL, type DisplayControl } from "@/lib/remote/hold";
import type { PinGuard } from "@/lib/auth/pin";
import type { Destination } from "@/lib/remote/capture";
import type { EditableCard, InboxRow } from "@/lib/remote/types";
import type { ShoppingWrite, TaskWrite } from "@/lib/remote/lists";
import type { ImageKind } from "@/lib/photos/sniff";

type StoredCard = EditableCard & { deletedAt: string | null };
type StoredTask = TaskWrite & { id: string; source: "manual"; locked: boolean; deletedAt: string | null };
type StoredShopping = ShoppingWrite & { id: string; source: "manual"; locked: boolean; deletedAt: string | null };
type StoredInbox = InboxRow & { deletedAt: string | null };
type StoredPriority = SnapshotPriority & {
  id: string;
  dueAt: string | null;
  taskId: null;
  deletedAt: string | null;
};

type MemoryState = {
  config: DashboardConfig;
  cards: StoredCard[];
  tasks: StoredTask[];
  shopping: StoredShopping[];
  inbox: StoredInbox[];
  ideas: { id: string; text: string }[];
  priorities: StoredPriority[];
  control: DisplayControl;
  pin: PinGuard;
  photos: Map<string, { bytes: Uint8Array; type: ImageKind }>;
};

const KEY = Symbol.for("tv-dashboard.remote-memory");

type Bucket = typeof globalThis & { [KEY]?: MemoryState };

function bucket(): MemoryState | undefined {
  return (globalThis as Bucket)[KEY];
}

export function hasRemoteMemory(): boolean {
  return Boolean(bucket());
}

export function ensureMemory(now = new Date()): MemoryState {
  const existing = bucket();
  if (existing) return existing;
  const sample = sampleSnapshot(now);
  const created: MemoryState = {
    config: sample.config,
    cards: sample.cards.map((card) => ({
      id: card.id,
      kind: card.kind,
      title: card.title,
      body: card.body,
      color: card.color,
      tilt: card.tilt,
      grid: card.grid,
      expiresAt: card.expiresAt,
      pinned: false,
      source: "manual",
      locked: false,
      data: card.data,
      photoUrl: null,
      deletedAt: null,
    })),
    tasks: sample.tasks.map((task) => ({
      ...task,
      source: "manual",
      locked: false,
      deletedAt: null,
    })),
    shopping: sample.shopping.map((item) => ({
      ...item,
      source: "manual",
      locked: false,
      deletedAt: null,
    })),
    inbox: [],
    ideas: [],
    priorities: sample.priorities.map((item) => ({
      ...item,
      id: crypto.randomUUID(),
      dueAt: null,
      taskId: null,
      deletedAt: null,
    })),
    control: { ...ROTATE_CONTROL },
    pin: { failures: 0, lockedUntil: null },
    photos: new Map(),
  };
  (globalThis as Bucket)[KEY] = created;
  return created;
}

export function memorySnapshot(now: Date): Snapshot | null {
  const state = bucket();
  if (!state) return null;
  const base = sampleSnapshot(now);
  return {
    ...base,
    config: state.config,
    tasks: state.tasks.filter((task) => !task.deletedAt).map(({ id, text, done, assigneeId, dueDate }) => ({
      id,
      text,
      done,
      assigneeId,
      dueDate,
    })),
    shopping: state.shopping.filter((item) => !item.deletedAt).map(({ id, text, qty, unit, category, checked }) => ({
      id,
      text,
      qty,
      unit,
      category,
      checked,
    })),
    cards: state.cards.filter((card) => !card.deletedAt).map((card) => toSnapshotCard(state, card)),
    priorities: state.priorities
      .filter((item) => !item.deletedAt)
      .map(({ text, reason, expiresAt, source, locked, updatedAt }) => ({
        text,
        reason,
        expiresAt,
        source,
        locked,
        updatedAt,
      })),
    inboxWaiting: state.inbox.filter((item) => !item.deletedAt && item.status === "new").length,
  };
}

export function memoryControl(): DisplayControl {
  return { ...ensureMemory().control };
}

export function memoryWriteControl(control: DisplayControl): void {
  ensureMemory().control = { ...control };
}

export function memoryGuard(): PinGuard {
  return { ...ensureMemory().pin };
}

export function memoryWriteGuard(guard: PinGuard): void {
  ensureMemory().pin = { ...guard };
}

export function memoryConfig(): DashboardConfig {
  return ensureMemory().config;
}

export function memoryWriteConfig(config: DashboardConfig): void {
  ensureMemory().config = config;
}

export function memoryCards(): EditableCard[] {
  const state = ensureMemory();
  return state.cards.filter((card) => !card.deletedAt).map((card) => publicCard(state, card));
}

export function memoryInsertCard(card: EditableCard): void {
  ensureMemory().cards.push({ ...card, deletedAt: null });
}

export function memoryUpdateCard(card: EditableCard): boolean {
  const state = ensureMemory();
  const index = state.cards.findIndex((item) => item.id === card.id && !item.deletedAt);
  if (index < 0) return false;
  state.cards[index] = { ...card, deletedAt: null };
  return true;
}

export function memoryDeleteCard(id: string, now: Date): boolean {
  const card = ensureMemory().cards.find((item) => item.id === id && !item.deletedAt);
  if (!card) return false;
  card.deletedAt = now.toISOString();
  card.source = "manual";
  card.locked = true;
  return true;
}

export function memorySavePhoto(path: string, bytes: Uint8Array, type: ImageKind): void {
  ensureMemory().photos.set(path, { bytes, type });
}

export function memoryPhoto(path: string): { bytes: Uint8Array; type: ImageKind } | null {
  return ensureMemory().photos.get(path) ?? null;
}

export function memoryTasks(): StoredTask[] {
  return ensureMemory().tasks.filter((task) => !task.deletedAt);
}

export function memoryInsertTask(task: StoredTask): void {
  ensureMemory().tasks.push(task);
}

export function memoryUpdateTask(id: string, value: TaskWrite): boolean {
  const task = ensureMemory().tasks.find((item) => item.id === id && !item.deletedAt);
  if (!task) return false;
  Object.assign(task, value, { source: "manual", locked: true });
  return true;
}

export function memoryDeleteTask(id: string, now: Date): boolean {
  const task = ensureMemory().tasks.find((item) => item.id === id && !item.deletedAt);
  if (!task) return false;
  task.deletedAt = now.toISOString();
  task.source = "manual";
  task.locked = true;
  return true;
}

export function memoryShopping(): StoredShopping[] {
  return ensureMemory().shopping.filter((item) => !item.deletedAt);
}

export function memoryInsertShopping(item: StoredShopping): void {
  ensureMemory().shopping.push(item);
}

export function memoryUpdateShopping(id: string, value: ShoppingWrite): boolean {
  const item = ensureMemory().shopping.find((row) => row.id === id && !row.deletedAt);
  if (!item) return false;
  Object.assign(item, value, { source: "manual", locked: true });
  return true;
}

export function memoryDeleteShopping(id: string, now: Date): boolean {
  const item = ensureMemory().shopping.find((row) => row.id === id && !row.deletedAt);
  if (!item) return false;
  item.deletedAt = now.toISOString();
  item.source = "manual";
  item.locked = true;
  return true;
}

export function memoryInbox(): InboxRow[] {
  return ensureMemory()
    .inbox.filter((item) => !item.deletedAt)
    .map(({ id, text, receivedAt, status, routedTo }) => ({ id, text, receivedAt, status, routedTo }));
}

export function memoryCapture(text: string, destination: Destination, now: Date): InboxRow {
  const state = ensureMemory();
  const receivedAt = now.toISOString();
  let routedTo: InboxRow["routedTo"] = null;
  let status: InboxRow["status"] = "new";
  if (destination === "task") {
    const id = crypto.randomUUID();
    state.tasks.push({
      id,
      text: text.slice(0, 500),
      done: false,
      assigneeId: null,
      dueDate: null,
      source: "manual",
      locked: true,
      deletedAt: null,
    });
    routedTo = { type: "task", id };
    status = "routed";
  } else if (destination === "shopping") {
    const id = crypto.randomUUID();
    state.shopping.push({
      id,
      text: text.slice(0, 200),
      qty: 1,
      unit: null,
      category: null,
      checked: false,
      source: "manual",
      locked: true,
      deletedAt: null,
    });
    routedTo = { type: "shopping", id };
    status = "routed";
  } else if (destination === "idea") {
    const id = crypto.randomUUID();
    state.ideas.push({ id, text });
    routedTo = { type: "idea", id };
    status = "routed";
  }
  const row: StoredInbox = { id: crypto.randomUUID(), text, receivedAt, status, routedTo, deletedAt: null };
  state.inbox.unshift(row);
  return { id: row.id, text, receivedAt, status, routedTo };
}

export function memoryDeleteInbox(id: string, now: Date): boolean {
  const item = ensureMemory().inbox.find((row) => row.id === id && !row.deletedAt);
  if (!item) return false;
  item.deletedAt = now.toISOString();
  return true;
}

export function memorySetPriority(
  value: { text: string; reason: string; dueAt: string | null; expiresAt: string },
  now: Date,
): void {
  ensureMemory().priorities.unshift({
    id: crypto.randomUUID(),
    text: value.text,
    reason: value.reason,
    dueAt: value.dueAt,
    taskId: null,
    expiresAt: value.expiresAt,
    source: "manual",
    locked: true,
    updatedAt: now.toISOString(),
    deletedAt: null,
  });
}

export function memoryClearPriority(now: Date): void {
  const stamp = now.toISOString();
  for (const item of ensureMemory().priorities) {
    if (!item.deletedAt && new Date(item.expiresAt).getTime() > now.getTime()) item.deletedAt = stamp;
  }
}

function publicCard(state: MemoryState, card: StoredCard): EditableCard {
  return {
    id: card.id,
    kind: card.kind,
    title: card.title,
    body: card.body,
    color: card.color,
    tilt: card.tilt,
    grid: card.grid,
    expiresAt: card.expiresAt,
    pinned: card.pinned,
    source: card.source,
    locked: card.locked,
    data: card.data,
    photoUrl: photoUrl(state, card),
  };
}

function toSnapshotCard(state: MemoryState, card: StoredCard): SnapshotCard {
  return {
    id: card.id,
    kind: card.kind,
    title: card.title,
    body: card.body,
    color: card.color,
    tilt: card.tilt,
    grid: card.grid,
    expiresAt: card.expiresAt,
    data: card.data,
    photoUrl: photoUrl(state, card),
  };
}

function photoUrl(state: MemoryState, card: StoredCard): string | null {
  const path = card.data.storagePath;
  if (typeof path !== "string") return null;
  const photo = state.photos.get(path);
  if (!photo) return null;
  return `data:${photo.type};base64,${Buffer.from(photo.bytes).toString("base64")}`;
}
