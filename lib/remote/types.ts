import type { ViewId } from "@/i18n/ro";
import type { DashboardConfig, SnapshotEvent, SnapshotShopping, SnapshotTask } from "@/lib/state/types";
import type { HoldMode } from "@/lib/remote/hold";

export type CardKind = "photo" | "affirmation" | "countdown" | "word" | "progress" | "wins" | "recap" | "note";
export type Palette = "sand" | "coral" | "lilac" | "mint" | "sky" | "pink";

export type EditableCard = {
  id: string;
  kind: CardKind;
  title: string | null;
  body: string | null;
  color: Palette;
  tilt: number;
  grid: { col: number; row: number; colSpan: number; rowSpan: number };
  expiresAt: string | null;
  pinned: boolean;
  source: "manual" | "assistant" | "integration";
  locked: boolean;
  data: Record<string, unknown>;
  photoUrl: string | null;
};

export type InboxRow = {
  id: string;
  text: string;
  receivedAt: string;
  status: "new" | "routed" | "needs_review";
  routedTo: { type: string; id: string } | null;
};

export type RemoteBoard = {
  ok: true;
  hold: HoldMode;
  dimmed: boolean;
  viewId: ViewId;
  reason: string;
  until: string;
  dwellRemaining: number;
  priority: { text: string; reason: string } | null;
  config: DashboardConfig;
  cards: EditableCard[];
  tasks: SnapshotTask[];
  shopping: SnapshotShopping[];
  inbox: InboxRow[];
  events: SnapshotEvent[];
  metrics: { key: string; value: number; previous: number | null }[];
  realtime: { url: string; anonKey: string; channel: string } | null;
  photoUpload: "signed" | "direct";
};

export function gridFits(grid: EditableCard["grid"]): boolean {
  return (
    Number.isInteger(grid.col) &&
    Number.isInteger(grid.row) &&
    Number.isInteger(grid.colSpan) &&
    Number.isInteger(grid.rowSpan) &&
    grid.col >= 0 &&
    grid.row >= 0 &&
    grid.colSpan >= 1 &&
    grid.rowSpan >= 1 &&
    grid.col + grid.colSpan <= 4 &&
    grid.row + grid.rowSpan <= 3
  );
}
