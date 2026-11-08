import { cardSchema, type Card } from "@/lib/schemas";
import { plainData, plainText } from "@/lib/remote/text";
import { gridFits, type EditableCard } from "@/lib/remote/types";

export function asEditable(card: Card): EditableCard {
  return {
    id: card.id,
    kind: card.kind,
    title: card.title ?? null,
    body: card.body ?? null,
    color: card.color,
    tilt: card.tilt,
    grid: card.grid,
    expiresAt: card.expiresAt ?? null,
    pinned: card.pinned,
    source: card.source,
    locked: card.locked,
    data: card.data as EditableCard["data"],
    photoUrl: null,
  };
}

export function parseManualCard(input: unknown, id: string, unlock: boolean): Card | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  const grid = record.grid;
  if (!grid || typeof grid !== "object") return null;
  const gridRecord = grid as Record<string, unknown>;
  const nextGrid = {
    col: Number(gridRecord.col),
    row: Number(gridRecord.row),
    colSpan: Number(gridRecord.colSpan),
    rowSpan: Number(gridRecord.rowSpan),
  };
  if (!gridFits(nextGrid)) return null;
  const data = plainData(isRecord(record.data) ? record.data : {});
  const parsed = cardSchema.safeParse({
    id,
    viewId: "vision",
    kind: record.kind,
    title: typeof record.title === "string" ? plainText(record.title) || undefined : undefined,
    body: typeof record.body === "string" ? plainText(record.body) || undefined : undefined,
    color: record.color,
    tilt: Number(record.tilt),
    grid: nextGrid,
    expiresAt: typeof record.expiresAt === "string" && record.expiresAt ? record.expiresAt : undefined,
    pinned: Boolean(record.pinned),
    source: unlock ? "assistant" : "manual",
    locked: !unlock,
    data,
  });
  return parsed.success ? parsed.data : null;
}

export function emptyCardData(kind: EditableCard["kind"], now: Date): Record<string, unknown> {
  if (kind === "word") return { word: "Cuvânt" };
  if (kind === "countdown") return { target: new Date(now.getTime() + 86_400_000).toISOString(), label: "Numărătoare" };
  if (kind === "progress") return { label: "Progres", value: 0, max: 1, style: "ring", evidence: "manual:phone" };
  if (kind === "wins") return { items: [{ text: "O reușită", evidence: "manual:phone" }] };
  if (kind === "affirmation" || kind === "note") return { text: "" };
  return {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
