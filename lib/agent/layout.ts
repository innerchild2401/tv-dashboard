import { VISION_DESIGN, type FontScale } from "@/lib/agent/design";

export type VisionLayoutPlacement = {
  externalId: string;
  grid: { col: number; row: number; colSpan: number; rowSpan: number };
  fontScale?: FontScale;
  hidden?: boolean;
  tilt?: number;
  title?: string | null;
  body?: string | null;
  kind?: string;
  color?: string;
};

export type VisionLayoutDraft = {
  secret: string;
  updatedAt: string;
  cards: VisionLayoutPlacement[];
};

/** Choose Cast-readable font + span from message length so short wins feel big and long quotes stay legible. */
export function suggestVisionPresentation(input: {
  kind: string;
  title?: string | null;
  body?: string | null;
  wins?: string[];
}): { fontScale: FontScale; colSpan: number; rowSpan: number } {
  const text = [input.title, input.body, ...(input.wins ?? [])].filter(Boolean).join(" ").trim();
  const length = text.length;

  if (input.kind === "photo") return { fontScale: "md", colSpan: 2, rowSpan: 2 };
  if (input.kind === "affirmation") {
    if (length > 140) return { fontScale: "sm", colSpan: 2, rowSpan: 2 };
    if (length > 60) return { fontScale: "md", colSpan: 2, rowSpan: 2 };
    return { fontScale: "lg", colSpan: 2, rowSpan: 2 };
  }
  if (input.kind === "wins") {
    if (length > 90) return { fontScale: "sm", colSpan: 1, rowSpan: 1 };
    if (length > 40) return { fontScale: "md", colSpan: 1, rowSpan: 1 };
    return { fontScale: "lg", colSpan: 1, rowSpan: 1 };
  }
  if (input.kind === "countdown") {
    return length > 40 ? { fontScale: "sm", colSpan: 1, rowSpan: 1 } : { fontScale: "md", colSpan: 1, rowSpan: 1 };
  }
  if (input.kind === "word") return { fontScale: "lg", colSpan: 1, rowSpan: 1 };
  if (input.kind === "recap") {
    return length > 100 ? { fontScale: "sm", colSpan: 2, rowSpan: 1 } : { fontScale: "md", colSpan: 2, rowSpan: 1 };
  }
  if (length > 120) return { fontScale: "sm", colSpan: 1, rowSpan: 1 };
  if (length > 50) return { fontScale: "md", colSpan: 1, rowSpan: 1 };
  return { fontScale: "lg", colSpan: 1, rowSpan: 1 };
}

export function isCardHidden(data: Record<string, unknown> | null | undefined): boolean {
  return data?.hidden === true;
}

export function parseVisionDraft(value: unknown): VisionLayoutDraft | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.secret !== "string" || typeof record.updatedAt !== "string" || !Array.isArray(record.cards)) {
    return null;
  }
  const cards: VisionLayoutPlacement[] = [];
  for (const item of record.cards) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (typeof row.externalId !== "string") continue;
    const grid = row.grid;
    if (!grid || typeof grid !== "object") continue;
    const box = grid as Record<string, unknown>;
    const col = Number(box.col);
    const rowN = Number(box.row);
    const colSpan = Number(box.colSpan ?? 1);
    const rowSpan = Number(box.rowSpan ?? 1);
    if (![col, rowN, colSpan, rowSpan].every((n) => Number.isInteger(n))) continue;
    if (col < 0 || rowN < 0 || col + colSpan > VISION_DESIGN.grid.columns || rowN + rowSpan > VISION_DESIGN.grid.rows) {
      continue;
    }
    cards.push({
      externalId: row.externalId,
      grid: { col, row: rowN, colSpan, rowSpan },
      fontScale: row.fontScale === "sm" || row.fontScale === "md" || row.fontScale === "lg" ? row.fontScale : undefined,
      hidden: typeof row.hidden === "boolean" ? row.hidden : undefined,
      tilt: typeof row.tilt === "number" ? row.tilt : undefined,
      title: typeof row.title === "string" || row.title === null ? (row.title as string | null) : undefined,
      body: typeof row.body === "string" || row.body === null ? (row.body as string | null) : undefined,
      kind: typeof row.kind === "string" ? row.kind : undefined,
      color: typeof row.color === "string" ? row.color : undefined,
    });
  }
  return { secret: record.secret, updatedAt: record.updatedAt, cards };
}
