import type { ViewId } from "@/i18n/ro";
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
  recap: SnapshotRecap | null;
  priorities: SnapshotPriority[];
  metrics: SnapshotMetric[];
  weather: { location: string; tempC: number | null; label: string | null; fetchedAt: string | null };
  calendarFetchedAt: string | null;
};

export type ChromeModel = {
  clock: string;
  dateLabel: string;
  weather: { location: string; tempC: string; label: string; updatedLabel: string | null };
  priority: { text: string; reason: string } | null;
  pills: { id: ViewId; label: string; active: boolean }[];
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

export type StatModel = { label: string; value: string; delta: string | null };

export type SiteModel = {
  stats: StatModel[];
  series: number[];
  updatedLabel: string | null;
  pages: { label: string; value: string }[];
  sources: { label: string; value: string }[];
};

export type TikTokModel = {
  followers: StatModel;
  views: StatModel;
  likes: StatModel;
  bars: { label: string; value: number }[];
  video: { title: string; views: string; likes: string } | null;
  updatedLabel: string | null;
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
};

export type VisionModel = { cards: VisionCardModel[] };

export type HomeModel = {
  tasks: { id: string; text: string; done: boolean; due: string | null; person: PersonChip | null }[];
  groups: { category: string; items: { id: string; text: string; qty: string | null; checked: boolean }[] }[];
};

export type TvState = {
  ok: true;
  generatedAt: string;
  currentView: ViewId;
  until: string;
  reason: string;
  dwellRemaining: number;
  chrome: ChromeModel;
  today: TodayModel | null;
  week: WeekModel | null;
  month: MonthModel | null;
  site: SiteModel | null;
  tiktok: TikTokModel | null;
  vision: VisionModel | null;
  home: HomeModel | null;
};

export type { AgendaItem };
