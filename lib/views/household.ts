import { ro } from "@/i18n/ro";
import { formatCount } from "@/lib/format/display";
import { personChip } from "@/lib/people";
import type { HomeModel, Snapshot, SnapshotCard, VisionModel } from "@/lib/state/types";
import { dateKey, zonedParts } from "@/lib/time/bucharest";

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
  const tasks = [...snapshot.tasks]
    .sort((left, right) => Number(left.done) - Number(right.done) || left.text.localeCompare(right.text, "ro"))
    .map((task) => ({
      id: task.id,
      text: task.text,
      done: task.done,
      due: task.dueDate ? (task.dueDate === todayKey ? ro.dueToday : task.dueDate) : null,
      person: personChip(snapshot.config.people, task.assigneeId),
    }));

  const groups = new Map<string, HomeModel["groups"][number]["items"]>();
  const ordered = [...snapshot.shopping].sort(
    (left, right) => Number(left.checked) - Number(right.checked) || left.text.localeCompare(right.text, "ro"),
  );
  for (const item of ordered) {
    const category = item.category || ro.otherCategory;
    const list = groups.get(category) ?? [];
    const unit = item.unit === "l" ? "L" : item.unit;
    const qty = unit ? `${formatCount(item.qty)} ${unit}` : item.qty === 1 ? null : formatCount(item.qty);
    list.push({ id: item.id, text: item.text, qty, checked: item.checked });
    groups.set(category, list);
  }

  return {
    tasks,
    inboxWaiting: snapshot.inboxWaiting,
    groups: [...groups.entries()]
      .sort((left, right) => left[0].localeCompare(right[0], "ro"))
      .map(([category, items]) => ({ category, items })),
  };
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
