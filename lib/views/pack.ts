import { VISION_DESIGN } from "@/lib/agent/design";

export type Packable = {
  id: string;
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
};

const COLS = VISION_DESIGN.grid.columns;
const ROWS = VISION_DESIGN.grid.rows;

/** Pack cards onto the 4×3 board with no overlaps. Keep preferred cells when free; otherwise find the next free fit. Shrink span only when nothing else fits. */
export function packVisionCards<T extends Packable>(cards: T[]): T[] {
  const ordered = [...cards].sort((left, right) => area(right) - area(left) || left.id.localeCompare(right.id));
  const taken = new Set<string>();
  const placed: T[] = [];

  for (const card of ordered) {
    const preferred = clampSpan(card.col, card.row, card.colSpan, card.rowSpan);
    const fit =
      (preferred && !overlaps(taken, preferred) ? preferred : null) ??
      findFit(taken, preferred?.colSpan ?? card.colSpan, preferred?.rowSpan ?? card.rowSpan) ??
      findFit(taken, 1, 1) ?? { col: 0, row: 0, colSpan: 1, rowSpan: 1 };
    mark(taken, fit);
    placed.push({ ...card, ...fit });
  }

  return cards.map((card) => placed.find((item) => item.id === card.id) ?? card);
}

export function visionCellsOverlap(
  left: { col: number; row: number; colSpan: number; rowSpan: number },
  right: { col: number; row: number; colSpan: number; rowSpan: number },
): boolean {
  return (
    left.col < right.col + right.colSpan &&
    left.col + left.colSpan > right.col &&
    left.row < right.row + right.rowSpan &&
    left.row + left.rowSpan > right.row
  );
}

function area(card: Packable): number {
  return Math.max(1, card.colSpan) * Math.max(1, card.rowSpan);
}

function clampSpan(col: number, row: number, colSpan: number, rowSpan: number) {
  const nextColSpan = Math.min(Math.max(1, colSpan), VISION_DESIGN.span.colSpanMax, COLS);
  const nextRowSpan = Math.min(Math.max(1, rowSpan), VISION_DESIGN.span.rowSpanMax, ROWS);
  if (col < 0 || row < 0 || col + nextColSpan > COLS || row + nextRowSpan > ROWS) return null;
  return { col, row, colSpan: nextColSpan, rowSpan: nextRowSpan };
}

function findFit(taken: Set<string>, colSpan: number, rowSpan: number) {
  const span = clampSpan(0, 0, colSpan, rowSpan);
  if (!span) return null;
  for (let row = 0; row <= ROWS - span.rowSpan; row += 1) {
    for (let col = 0; col <= COLS - span.colSpan; col += 1) {
      const candidate = { col, row, colSpan: span.colSpan, rowSpan: span.rowSpan };
      if (!overlaps(taken, candidate)) return candidate;
    }
  }
  return null;
}

function overlaps(taken: Set<string>, box: { col: number; row: number; colSpan: number; rowSpan: number }): boolean {
  for (let row = box.row; row < box.row + box.rowSpan; row += 1) {
    for (let col = box.col; col < box.col + box.colSpan; col += 1) {
      if (taken.has(`${col}:${row}`)) return true;
    }
  }
  return false;
}

function mark(taken: Set<string>, box: { col: number; row: number; colSpan: number; rowSpan: number }) {
  for (let row = box.row; row < box.row + box.rowSpan; row += 1) {
    for (let col = box.col; col < box.col + box.colSpan; col += 1) {
      taken.add(`${col}:${row}`);
    }
  }
}
