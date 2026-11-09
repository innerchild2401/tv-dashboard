import { ro } from "@/i18n/ro";
import { parseFontScale } from "@/lib/agent/design";
import { formatCount } from "@/lib/format/display";
import { personChip } from "@/lib/people";
import type {
  HomeDensity,
  HomeModel,
  HomeSticky,
  HomeStickyColor,
  Snapshot,
  SnapshotCard,
  VisionModel,
} from "@/lib/state/types";
import { dateKey, zonedParts } from "@/lib/time/bucharest";

const STICKY_COLORS: HomeStickyColor[] = ["butter", "peach", "mint", "sky", "rose", "lemon"];

export function projectVision(snapshot: Snapshot, now: Date, celebration?: string | null): VisionModel {
  const cards = snapshot.cards
    .filter((card) => !card.expiresAt || new Date(card.expiresAt).getTime() > now.getTime())
    .map((card) => toCard(card, snapshot, now));
  if (celebration) {
    const spot = freeCell(cards);
    cards.push({
      id: "celebration",
      kind: "note",
      color: "sand",
      tilt: -2,
      col: spot.col,
      row: spot.row,
      colSpan: 1,
      rowSpan: 1,
      fontScale: "md",
      title: ro.celebrationDay,
      body: celebration,
      word: null,
      countdownValue: null,
      countdownUnit: null,
      progress: null,
      wins: [],
      highlights: [],
      photoUrl: null,
    });
  }
  return { cards, celebration: celebration ?? null };
}

function freeCell(cards: VisionModel["cards"]): { col: number; row: number } {
  const used = new Set<string>();
  for (const card of cards) {
    for (let row = card.row; row < card.row + card.rowSpan && row < 3; row += 1) {
      for (let col = card.col; col < card.col + card.colSpan && col < 4; col += 1) used.add(`${col}:${row}`);
    }
  }
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      if (!used.has(`${col}:${row}`)) return { col, row };
    }
  }
  return { col: 3, row: 2 };
}

export function projectHome(snapshot: Snapshot, now: Date): HomeModel {
  const todayKey = dateKey(zonedParts(now));
  const stickies: HomeSticky[] = [];

  const tasks = [...snapshot.tasks].sort(
    (left, right) => Number(left.done) - Number(right.done) || left.text.localeCompare(right.text, "ro"),
  );
  for (const task of tasks) {
    stickies.push({
      id: `task-${task.id}`,
      kind: "task",
      kindLabel: ro.stickyTask,
      color: colorOf(task.id, 0),
      tilt: tiltOf(task.id),
      text: task.text,
      done: task.done,
      meta: task.dueDate ? (task.dueDate === todayKey ? ro.dueToday : task.dueDate) : null,
      person: personChip(snapshot.config.people, task.assigneeId),
    });
  }

  const shopping = [...snapshot.shopping].sort(
    (left, right) => Number(left.checked) - Number(right.checked) || left.text.localeCompare(right.text, "ro"),
  );
  for (const item of shopping) {
    const unit = item.unit === "l" ? "L" : item.unit;
    const qty = unit ? `${formatCount(item.qty)} ${unit}` : item.qty === 1 ? null : formatCount(item.qty);
    const category = item.category || ro.otherCategory;
    stickies.push({
      id: `shop-${item.id}`,
      kind: "shopping",
      kindLabel: ro.stickyShopping,
      color: colorOf(item.id, 2),
      tilt: tiltOf(item.id),
      text: item.text,
      done: item.checked,
      meta: [qty, category].filter(Boolean).join(" · ") || null,
      person: null,
    });
  }

  const messages = [...snapshot.messages].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  for (const message of messages) {
    stickies.push({
      id: `msg-${message.id}`,
      kind: "message",
      kindLabel: ro.stickyMessage,
      color: message.color,
      tilt: tiltOf(message.id),
      text: message.text,
      done: false,
      meta: message.author,
      person: null,
    });
  }

  const live = stickies.filter((sticky) => !sticky.done);
  const density = densityOf(live.length || stickies.length);

  return {
    stickies,
    density,
    inboxWaiting: snapshot.inboxWaiting,
    emptyLabel: stickies.length === 0 ? ro.emptyBoard : null,
  };
}

function densityOf(count: number): HomeDensity {
  if (count <= 6) return "roomy";
  if (count <= 12) return "cozy";
  return "packed";
}

function colorOf(id: string, salt: number): HomeStickyColor {
  let hash = salt;
  for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) | 0;
  return STICKY_COLORS[Math.abs(hash) % STICKY_COLORS.length] ?? "butter";
}

function tiltOf(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) hash = (hash * 17 + id.charCodeAt(index)) | 0;
  return (Math.abs(hash) % 7) - 3;
}

function toCard(card: SnapshotCard, snapshot: Snapshot, now: Date): VisionModel["cards"][number] {
  const base = {
    id: card.id,
    kind: card.kind,
    color: card.color,
    tilt: card.tilt,
    col: card.grid.col,
    row: card.grid.row,
    colSpan: card.grid.colSpan,
    rowSpan: card.grid.rowSpan,
    fontScale: parseFontScale(card.data.fontScale),
    title: card.title,
    body: card.body,
    word: null as string | null,
    countdownValue: null as string | null,
    countdownUnit: null as string | null,
    progress: null as VisionModel["cards"][number]["progress"],
    wins: [] as string[],
    highlights: [] as string[],
    photoUrl: card.photoUrl ?? null,
  };

  if (card.kind === "word") {
    const word = card.data.word;
    base.word = typeof word === "string" ? word : card.body;
  }
  if (card.kind === "countdown") {
    const target = card.data.target;
    if (typeof target === "string") {
      const days = calendarDays(target, now);
      base.countdownValue = String(Math.max(0, days));
      base.countdownUnit = Math.abs(days) === 1 ? ro.dayOne : ro.days;
      const label = card.data.label;
      if (typeof label === "string" && !base.title) base.title = label;
    }
  }
  if (card.kind === "progress") {
    const value = numberValue(card.data.value);
    const max = numberValue(card.data.max);
    const label = typeof card.data.label === "string" ? card.data.label : (card.title ?? ro.wins);
    const style = card.data.style === "bar" ? "bar" : "ring";
    if (max > 0) {
      base.progress = { label, value, max, style, text: `${formatCount(value)}/${formatCount(max)}` };
    }
  }
  if (card.kind === "wins" && Array.isArray(card.data.items)) {
    base.wins = card.data.items.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const text = (item as { text?: unknown }).text;
      return typeof text === "string" ? [text] : [];
    });
  }
  if (card.kind === "recap" && snapshot.recap) {
    base.body = base.body || snapshot.recap.text;
    base.highlights = snapshot.recap.highlights;
  }
  if (card.kind === "affirmation") {
    const text = card.data.text;
    if (typeof text === "string" && !base.body) base.body = text;
  }
  return base;
}

function calendarDays(targetIso: string, now: Date): number {
  const target = dateKey(zonedParts(new Date(targetIso)));
  const current = dateKey(zonedParts(now));
  const targetUtc = Date.parse(`${target}T00:00:00Z`);
  const currentUtc = Date.parse(`${current}T00:00:00Z`);
  return Math.round((targetUtc - currentUtc) / 86_400_000);
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
