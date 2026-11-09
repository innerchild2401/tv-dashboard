/** Hard design constraints for TV views (1280×720 Cast canvas). No free-form HTML. */

export const TV_DESIGN = {
  canvas: { width: 1280, height: 720, letterboxFor: "1920×1080 Cast" },
  fonts: {
    families: ["Space Grotesk", "Fredoka", "Caveat", "Inter"] as const,
    scales: ["sm", "md", "lg"] as const,
  },
} as const;

export type FontScale = (typeof TV_DESIGN.fonts.scales)[number];

export const VISION_DESIGN = {
  viewId: "vision" as const,
  labelRo: "Victorii",
  grid: { columns: 4, rows: 3, gapPx: 12, safeMarginPx: 16 },
  maxCards: 12,
  tilt: { min: -3, max: 3 },
  span: { colSpanMax: 2, rowSpanMax: 2 },
  fonts: TV_DESIGN.fonts.scales,
  photoFrame: "polaroid" as const,
  colors: ["sand", "coral", "lilac", "mint", "sky", "pink"] as const,
  kinds: ["photo", "affirmation", "countdown", "word", "progress", "wins", "recap", "note"] as const,
  tools: ["upsert_card", "delete_card", "set_recap"] as const,
  knobs: ["grid", "tilt", "fontScale", "color", "kind", "title", "body", "image_url"] as const,
  rules: [
    "Call get_view_design or get_schema before writing.",
    "Layout is data-driven: pass grid {col,row,colSpan,rowSpan}, tilt, and fontScale on upsert_card.",
    "Grid is 4×3. col 0–3, row 0–2. col+colSpan≤4, row+rowSpan≤3. Spans max 2.",
    "Max 12 live cards. Overlap is warned; prefer empty cells.",
    "Photos always render in the polaroid frame — no custom HTML/CSS.",
    "fontScale is sm|md|lg only. Romanian copy preferred.",
  ],
};

export const MOMENTE_DESIGN = {
  viewId: "momente" as const,
  labelRo: "Momente",
  maxVisible: 12,
  layouts: ["empty", "solo", "split", "tiles", "dense", "gallery", "packed"] as const,
  kinds: ["trip", "competition", "deadline", "other"] as const,
  tools: ["upsert_spotlight", "delete_spotlight"] as const,
  knobs: ["title", "kind", "startsAt", "note", "pinned"] as const,
  rules: [
    "All active (non-past) spotlights render — no hidden overflow cap under maxVisible.",
    "pinned keeps a card near the front of the sort order.",
    "Countdown is whole Europe/Bucharest calendar days until startsAt.",
  ],
};

export const WEEK_DESIGN = {
  viewId: "week" as const,
  labelRo: "Săptămână",
  canvasFit: "1280×720 with compact rows; long columns auto-scroll slowly",
  tools: ["upsert_events"] as const,
  knobs: ["title", "start", "end", "allDay", "person"] as const,
  rules: [
    "Content only — week chrome is fixed for Cast readability.",
    "Keep event titles short (≤80 chars shown cleanly).",
  ],
};

export const TODAY_DESIGN = {
  viewId: "today" as const,
  labelRo: "Azi",
  tools: ["upsert_events", "set_priority", "set_recap"] as const,
  knobs: ["events", "priority text/reason/dueAt", "recap text"] as const,
  rules: [
    "Priority needs a one-line reason.",
    "Today layout is fixed; edit content through the tools above.",
  ],
};

export const HOME_DESIGN = {
  viewId: "home" as const,
  labelRo: "Acasă",
  stickyColors: ["butter", "peach", "mint", "sky", "rose", "lemon"] as const,
  tools: ["upsert_task", "delete_task", "shopping_add", "shopping_check", "shopping_delete", "upsert_message", "delete_message"] as const,
  knobs: ["text", "assignee", "dueDate", "done", "qty", "unit", "category", "author", "color"] as const,
  rules: [
    "Post-it board — no free-form HTML. Message color from stickyColors only.",
    "Density auto-adjusts from sticky count.",
  ],
};

export const VIEW_DESIGNS = {
  today: TODAY_DESIGN,
  week: WEEK_DESIGN,
  momente: MOMENTE_DESIGN,
  vision: VISION_DESIGN,
  home: HOME_DESIGN,
} as const;

export type DesignViewId = keyof typeof VIEW_DESIGNS;

export function isDesignViewId(value: string): value is DesignViewId {
  return value in VIEW_DESIGNS;
}

export function viewDesignPayload(viewId?: string | null) {
  const instructions = [
    "Always call get_view_design (or get_schema) before editing a view.",
    "Stay inside the listed constraints — no free-form HTML or CSS.",
    "Auth: Authorization Bearer AGENT_TOKEN on /mcp and POST /api/agent/<tool>.",
    "Romanian UI copy where user-facing.",
  ];
  if (viewId && isDesignViewId(viewId)) {
    return {
      canvas: TV_DESIGN.canvas,
      instructions,
      view: VIEW_DESIGNS[viewId],
    };
  }
  return {
    canvas: TV_DESIGN.canvas,
    instructions,
    views: VIEW_DESIGNS,
  };
}

export function clampVisionGrid(input: {
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
}): { col: number; row: number; colSpan: number; rowSpan: number } | null {
  const colSpan = Math.min(VISION_DESIGN.span.colSpanMax, Math.max(1, Math.trunc(input.colSpan)));
  const rowSpan = Math.min(VISION_DESIGN.span.rowSpanMax, Math.max(1, Math.trunc(input.rowSpan)));
  const col = Math.trunc(input.col);
  const row = Math.trunc(input.row);
  if (col < 0 || row < 0) return null;
  if (col + colSpan > VISION_DESIGN.grid.columns) return null;
  if (row + rowSpan > VISION_DESIGN.grid.rows) return null;
  return { col, row, colSpan, rowSpan };
}

export function parseFontScale(value: unknown, fallback: FontScale = "md"): FontScale {
  if (value === "sm" || value === "md" || value === "lg") return value;
  return fallback;
}
