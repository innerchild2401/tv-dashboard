/** Hard design constraints for TV views (1280×720 Cast canvas). No free-form HTML. */

import { LIVE_CHANNEL_IDS } from "@/lib/live/channels";

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
  tools: ["upsert_card", "delete_card", "set_recap", "preview_layout", "publish_layout"] as const,
  knobs: ["grid", "tilt", "fontScale", "hidden", "color", "kind", "title", "body", "image_url", "autoSize"] as const,
  canvas: TV_DESIGN.canvas,
  rules: [
    "Call get_view_design or get_schema before writing.",
    "Design canvas is 1280×720, letterboxed into 1920×1080 Cast/LG (×1.35 inside 10% overscan-safe area).",
    "Layout is data-driven: pass grid {col,row,colSpan,rowSpan}, tilt, fontScale, hidden on upsert_card.",
    "Grid is 4×3. col 0–3, row 0–2. col+colSpan≤4, row+rowSpan≤3. Spans max 2.",
    "Max 12 live cards. Overlaps are auto-packed into free cells — never stacked.",
    "Panou Familie can rearrange/resize/hide ALL cards (samples + system: Rezumat, Pachetul, wins).",
    "Omit grid/fontScale (or autoSize:true) to size beautifully from message length.",
    "Multi-card changes: preview_layout (PNG at 1280×720) → review → publish_layout (atomic).",
    "Empty/self-referential Aniversare azi is hidden — only real named anniversaries show.",
    "Every kind should show title + body on TV (wins: hero title e.g. Bravo, Zian!; affirmation: scripture ref as title; countdown: include body).",
    "Photos always render in the polaroid frame — no custom HTML/CSS.",
    "fontScale is sm|md|lg only. Romanian copy preferred. Soft pastel palette on Cast.",
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

export const PAGE_DESIGN = {
  viewId: "custom-page" as const,
  labelRo: "Pagină nouă",
  tools: ["upsert_page", "delete_page"] as const,
  knobs: ["id", "title", "body", "enabled", "order", "dwellSeconds", "weight"] as const,
  canvas: TV_DESIGN.canvas,
  rules: [
    "Create full-screen Romanian pages via upsert_page (id slug, title, body).",
    "Pass enabled:true to put the page into the Cast rotation; enabled:false keeps content but skips rotation.",
    "id must be lowercase a-z / digits / dashes, not a reserved core or live id (today|week|momente|vision|home|antena3|kanal-d|digi24|realitatea-plus).",
    "delete_page removes the page and drops it from rotation.",
    "No free-form HTML/CSS — title + body only, 1280×720 Cast canvas.",
  ],
};

export const LIVE_DESIGN = {
  viewId: "antena3" as const,
  labelRo: "TV Live",
  tools: ["start_live_channel", "stop_live_channel", "start_antena3_live", "stop_antena3_live"] as const,
  knobs: ["channel", "minutes"] as const,
  channels: LIVE_CHANNEL_IDS,
  rules: [
    "MUST NOT be in the default rotation. Start only when Alex asks via MCP.",
    "Prefer start_live_channel({ channel, minutes? }). Channels: antena3 | kanal-d | digi24 | realitatea-plus.",
    "start_antena3_live / stop_antena3_live remain as aliases (Antena 3 start / any live stop).",
    "Soft-pin in-page (secondary when CORS allows) + Pi cast_hls for native Chromecast media + volume (tv-agent ≥9 for non-Antena URLs).",
    "Pi path: pychromecast MediaController — verify PLAYING/BUFFERING, set audible volume; on failure quit media and restore DashCast (never leave Cast dead).",
    "digi24 & realitatea-plus are cast-only (CORS blocks in-page hls.js). Never abandon the pin or quit MediaController when the in-page player stalls for those.",
    "kanal-d allows in-page (CORS *). antena3 uses free HLS master only (no VAST/IMA iframe). Never show video controls.",
    "In-page (when allowed) starts muted for autoplay policy, then unmutes. On-screen diag shows buildId + host + err.",
    "If an in-page-capable stream never starts (~12s) the TV abandons the pin. stop_live_channel clears the pin and queues cast_now (quit media → DashCast retries).",
    "Pi: keep dashcast_force=false. Heartbeat version should be 9+ for multi-channel URLs. TV soft-reloads when /api/state buildId changes.",
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
    "Custom pages: upsert_page / delete_page. Live TV: start_live_channel / stop_live_channel (aliases start_antena3_live / stop_antena3_live) — never default rotation.",
    "Victorii rearranges: preview_layout → PNG → publish_layout. upsert_card can hide samples via hidden:true.",
  ];
  if (viewId === "antena3" || viewId === "live") {
    return { canvas: TV_DESIGN.canvas, instructions, view: LIVE_DESIGN };
  }
  if (viewId === "custom-page" || viewId === "page" || viewId === "pages") {
    return { canvas: TV_DESIGN.canvas, instructions, view: PAGE_DESIGN };
  }
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
    pages: PAGE_DESIGN,
    live: LIVE_DESIGN,
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
