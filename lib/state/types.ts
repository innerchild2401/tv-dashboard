import type { ViewId } from "@/i18n/ro";
import type { HoldMode } from "@/lib/remote/hold";
import type { configSchema } from "@/lib/schemas";
import type { PersonChip } from "@/lib/people";
import type { AgendaItem, TodayView } from "@/lib/today/project";
import type { z } from "zod";

export type DashboardConfig = z.infer<typeof configSchema>;

export type SnapshotEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  personId: string | null;
};

export type SnapshotTask = {
  id: string;
  text: string;
  done: boolean;
  assigneeId: string | null;
  dueDate: string | null;
};

export type SnapshotShopping = {
  id: string;
  text: string;
  qty: number;
  unit: string | null;
  category: string | null;
  checked: boolean;
};

export type SnapshotCard = {
  id: string;
  kind: "photo" | "affirmation" | "countdown" | "word" | "progress" | "wins" | "recap" | "note";
  title: string | null;
  body: string | null;
  color: "sand" | "coral" | "lilac" | "mint" | "sky" | "pink";
  tilt: number;
  grid: { col: number; row: number; colSpan: number; rowSpan: number };
  expiresAt: string | null;
  data: Record<string, unknown>;
  photoUrl?: string | null;
};

export type SpotlightKind = "trip" | "competition" | "deadline" | "other";

export type SnapshotSpotlight = {
  id: string;
  title: string;
  kind: SpotlightKind;
  startsAt: string;
  note: string | null;
  pinned: boolean;
};

export type SnapshotMetric = {
  key: string;
  value: number;
  previous: number | null;
  fetchedAt: string;
  source: "manual" | "assistant" | "integration";
};

export type SnapshotPriority = {
  text: string;
  reason: string;
  dueAt: string | null;
  expiresAt: string;
  source: "manual" | "assistant" | "integration";
  locked: boolean;
  updatedAt: string;
};

export type SnapshotRecap = {
  id: string;
  text: string;
  highlights: string[];
  expiresAt: string | null;
};

export type Snapshot = {
  config: DashboardConfig;
  events: SnapshotEvent[];
  tasks: SnapshotTask[];
  shopping: SnapshotShopping[];
  cards: SnapshotCard[];
  spotlights: SnapshotSpotlight[];
  recap: SnapshotRecap | null;
  priorities: SnapshotPriority[];
  metrics: SnapshotMetric[];
  inboxWaiting: number;
  weather: {
    location: string;
    tempC: number | null;
    label: string | null;
    fetchedAt: string | null;
    hours?: { time: string; code: number; precipitationMm: number }[];
  };
  calendarFetchedAt: string | null;
};

export type ChromeModel = {
  clock: string;
  dateLabel: string;
  weather: { location: string; tempC: string; label: string; updatedLabel: string | null };
  alert: string | null;
  priority: { text: string; reason: string } | null;
  pills: { id: ViewId; label: string; active: boolean }[];
  accent: string;
  theme: "dark" | "light";
};

export type TodayModel = Pick<
  TodayView,
  "leadLabel" | "leadDateLabel" | "agenda" | "showNowLine" | "nowBeforeId" | "nextEvent" | "nextDays" | "emptyAgenda"
> & { updatedLabel: string | null };

export type WeekModel = {
  columns: {
    key: string;
    weekday: string;
    day: string;
    isToday: boolean;
    events: { id: string; timeLabel: string; title: string; person: PersonChip | null }[];
  }[];
  updatedLabel: string | null;
};

export type MonthModel = {
  title: string;
  weekdays: string[];
  cells: {
    key: string;
    day: string;
    inMonth: boolean;
    isToday: boolean;
    title: string | null;
    extra: number;
  }[];
  updatedLabel: string | null;
};

export type MomenteLayout = "empty" | "solo" | "split" | "tiles" | "dense" | "overflow";

export type MomenteItem = {
  id: string;
  title: string;
  kind: SpotlightKind;
  kindLabel: string;
  note: string | null;
  pinned: boolean;
  days: number;
  daysLabel: string;
  unitLabel: string | null;
  /** Absolute due instant in Bucharest, e.g. "13 nov · 18:00". */
  dueLabel: string;
  today: boolean;
};

export type MomenteModel = {
  title: string;
  layout: MomenteLayout;
  items: MomenteItem[];
  hidden: number;
  emptyLabel: string;
};

export type VisionCardModel = {
  id: string;
  kind: SnapshotCard["kind"];
  color: SnapshotCard["color"];
  tilt: number;
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
  title: string | null;
  body: string | null;
  word: string | null;
  countdownValue: string | null;
  countdownUnit: string | null;
  progress: { label: string; value: number; max: number; style: "ring" | "bar"; text: string } | null;
  wins: string[];
  highlights: string[];
  photoUrl: string | null;
};

export type VisionModel = { cards: VisionCardModel[]; celebration: string | null };

export type HomeModel = {
  tasks: { id: string; text: string; done: boolean; due: string | null; person: PersonChip | null }[];
  groups: { category: string; items: { id: string; text: string; qty: string | null; checked: boolean }[] }[];
  inboxWaiting: number;
};

export type TvState = {
  ok: true;
  generatedAt: string;
  currentView: ViewId;
  nextView: ViewId;
  until: string;
  reason: string;
  dwellRemaining: number;
  hold: HoldMode;
  dimmed: boolean;
  quiet: boolean;
  notices: { id: string; reason: string }[];
  chrome: ChromeModel;
  today: TodayModel | null;
  week: WeekModel | null;
  momente: MomenteModel | null;
  vision: VisionModel | null;
  home: HomeModel | null;
};

export type { AgendaItem };
