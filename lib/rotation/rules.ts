import {
  celebrationDay,
  eventSoon,
  prioritySoon,
  profileLabel,
  rainNear,
  ro,
  rotationReason,
  type ViewId,
} from "@/i18n/ro";
import { isRain, type ForecastHour } from "@/lib/adapters/weather";
import { nextInOrder, prepareCandidates, resolveRotation, type RotationCandidate, type RotationDecision } from "@/lib/rotation/engine";
import type { DashboardConfig, SnapshotEvent, SnapshotPriority } from "@/lib/state/types";
import { addDays, dateKey, zonedParts, zonedTimeToUtc } from "@/lib/time/bucharest";

export type RuleNotice = { id: string; reason: string };

export type Celebration = { view: "vision"; text: string };

export type RuleDecision = RotationDecision & {
  quiet: boolean;
  notices: RuleNotice[];
  celebrations: Celebration[];
  alert: string | null;
  priorityEverywhere: boolean;
};

const INTERRUPT_SECONDS = 120;
const EVENT_WINDOW_MS = 30 * 60 * 1000;
const PRIORITY_WINDOW_MS = 2 * 60 * 60 * 1000;
const RAIN_EVENT_WINDOW_MS = 2 * 60 * 60 * 1000;
const OUTDOOR_SOON_MS = 6 * 60 * 60 * 1000;
const OUTDOOR = /plimb|falez|parc|plaj|gr[ăa]din|picnic|alerg|outdoor|afar[ăa]|teras|drume|în aer liber|in aer liber/i;
const BIRTHDAY = /zi(?:ua)? de na[sș]tere|anivers|birthday|anniversary/i;

export function evaluateRules(input: {
  now: Date;
  config: DashboardConfig;
  events: SnapshotEvent[];
  priorities: SnapshotPriority[];
  metrics: unknown[];
  forecast: ForecastHour[];
  candidates: RotationCandidate[];
}): RuleDecision {
  const rules = input.config.rules;
  const notices: RuleNotice[] = [];
  const celebrations: Celebration[] = [];
  const priority = activePriority(input.priorities, input.now);
  const soonEvent = rules.eventProximity ? nextEvent(input.events, input.now) : null;
  const priorityDue = Boolean(rules.priorityBanner && priority?.dueAt && dueWithin(priority.dueAt, input.now));
  const birthdays = rules.celebrations ? birthdayTitles(input.events, input.now) : [];
  const alert = rules.weatherAlert ? rainAlert(input.events, input.forecast, input.now) : null;

  if (soonEvent) notices.push({ id: "eventProximity", reason: eventSoon(soonEvent.title, soonEvent.minutes) });
  if (priorityDue && priority?.dueAt) {
    notices.push({ id: "priorityBanner", reason: prioritySoon(minutesUntil(priority.dueAt, input.now)) });
  } else if (rules.priorityBanner && priority) {
    notices.push({ id: "priorityBanner", reason: priority.reason });
  }
  for (const title of birthdays) celebrations.push({ view: "vision", text: celebrationDay(title) });
  for (const item of celebrations) notices.push({ id: "celebrations", reason: item.text });
  if (alert) notices.push({ id: "weatherAlert", reason: alert });

  const quiet = rules.quietHours && inWindow(input.now, input.config.quietHours.start, input.config.quietHours.end);
  if (quiet) {
    notices.unshift({ id: "quietHours", reason: ro.quietHours });
    const until = quietUntil(input.now, input.config.quietHours.end);
    return {
      viewId: "today",
      until: until.toISOString(),
      dwellSeconds: Math.max(1, Math.round((until.getTime() - input.now.getTime()) / 1000)),
      weight: 0,
      reason: ro.quietHours,
      slot: 0,
      quiet: true,
      notices,
      celebrations,
      alert,
      priorityEverywhere: false,
    };
  }

  const profile = rules.timeOfDay ? activeProfile(input.config, input.now) : null;
  if (profile) notices.unshift({ id: "timeOfDay", reason: `${ro.profile}: ${profileLabel(profile.id)}` });
  const pool = rotationPool({
    now: input.now,
    config: input.config,
    candidates: input.candidates,
    birthdays: birthdays.length > 0,
  });

  const interruptReason = soonEvent
    ? eventSoon(soonEvent.title, soonEvent.minutes)
    : priorityDue && priority?.dueAt
      ? prioritySoon(minutesUntil(priority.dueAt, input.now))
      : null;
  const decision = interruptReason
    ? resolveWithInterrupt(input.now, pool, interruptReason)
    : resolveRotation(input.now, pool.length > 0 ? pool : input.candidates);
  if (profile && !interruptReason) {
    decision.reason = `${profileLabel(profile.id)} · ${rotationReason(decision.viewId, decision.weight)}`;
  } else if (profile && decision.reason !== interruptReason) {
    decision.reason = `${profileLabel(profile.id)} · ${rotationReason(decision.viewId, decision.weight)}`;
  }

  return {
    ...decision,
    quiet: false,
    notices,
    celebrations,
    alert,
    priorityEverywhere: Boolean(soonEvent || priorityDue),
  };
}

/** Profile + skipEmpty + celebration boosts — same pool evaluateRules rotates through. */
export function rotationPool(input: {
  now: Date;
  config: DashboardConfig;
  candidates: RotationCandidate[];
  birthdays?: boolean;
}): RotationCandidate[] {
  const rules = input.config.rules;
  const profile = rules.timeOfDay ? activeProfile(input.config, input.now) : null;
  let pool = profile ? applyProfile(input.candidates, profile) : input.candidates.map((view) => ({ ...view }));
  const prepared = prepareCandidates(pool, rules.skipEmpty);
  pool = prepared.length > 0 ? prepared : pool.filter((view) => view.weight > 0);
  if (input.birthdays) pool = includeView(pool, input.candidates, "vision");
  if (pool.length === 0) pool = input.candidates.filter((view) => view.weight > 0);
  return pool;
}

export function activePriority(priorities: SnapshotPriority[], now: Date): SnapshotPriority | null {
  const live = priorities
    .filter((item) => new Date(item.expiresAt).getTime() > now.getTime())
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  return live.find((item) => item.locked || item.source === "manual") ?? live[0] ?? null;
}

function resolveWithInterrupt(now: Date, prepared: RotationCandidate[], reason: string): RotationDecision {
  const fallback = prepared[0];
  if (!fallback) {
    return {
      viewId: "today",
      until: new Date(now.getTime() + INTERRUPT_SECONDS * 1000).toISOString(),
      dwellSeconds: INTERRUPT_SECONDS,
      weight: 1,
      reason,
      slot: 0,
    };
  }
  const parts = zonedParts(now);
  const dayStart = zonedTimeToUtc({ year: parts.year, month: parts.month, day: parts.day, hour: 0, minute: 0 }).getTime();
  const cycle = Math.max(prepared.length, 1);
  let cursor = dayStart;
  let previous: ViewId | null = null;
  let phase = 0;
  let slot = 0;
  const nowMs = now.getTime();

  for (let step = 0; step < 8000; step += 1) {
    if (phase === 0) {
      const until = cursor + INTERRUPT_SECONDS * 1000;
      if (nowMs < until) {
        return { viewId: "today", until: new Date(until).toISOString(), dwellSeconds: INTERRUPT_SECONDS, weight: 1, reason, slot };
      }
      cursor = until;
      previous = "today";
      phase = 1;
      continue;
    }
    const view = nextInOrder(prepared, previous);
    const until = cursor + view.dwellSeconds * 1000;
    if (nowMs < until) {
      return {
        viewId: view.id,
        until: new Date(until).toISOString(),
        dwellSeconds: view.dwellSeconds,
        weight: view.weight,
        reason: rotationReason(view.id, view.weight),
        slot,
      };
    }
    previous = view.id;
    cursor = until;
    slot += 1;
    phase = phase >= cycle ? 0 : phase + 1;
  }

  return {
    viewId: "today",
    until: new Date(nowMs + INTERRUPT_SECONDS * 1000).toISOString(),
    dwellSeconds: INTERRUPT_SECONDS,
    weight: 1,
    reason,
    slot: 0,
  };
}

function applyProfile(
  candidates: RotationCandidate[],
  profile: DashboardConfig["profiles"][number],
): RotationCandidate[] {
  const next: RotationCandidate[] = [];
  for (const view of candidates) {
    const entry = profile.views.find((item) => item.id === view.id);
    if (!entry || entry.weight <= 0) continue;
    next.push({
      ...view,
      weight: entry.weight,
      dwellSeconds: entry.dwellSeconds > 0 ? entry.dwellSeconds : view.dwellSeconds,
    });
  }
  return next;
}

function includeView(pool: RotationCandidate[], all: RotationCandidate[], id: ViewId): RotationCandidate[] {
  if (pool.some((view) => view.id === id)) return pool;
  const base = all.find((view) => view.id === id);
  if (!base) return pool;
  return [...pool, { ...base, weight: Math.max(1, base.weight), empty: false, stale: false }];
}

function activeProfile(config: DashboardConfig, now: Date): DashboardConfig["profiles"][number] | null {
  return config.profiles.find((profile) => inWindow(now, profile.start, profile.end)) ?? null;
}

function inWindow(now: Date, start: string, end: string): boolean {
  const startMin = clockMinutes(start);
  const endMin = clockMinutes(end);
  if (startMin === null || endMin === null || startMin === endMin) return false;
  const parts = zonedParts(now);
  const minute = parts.hour * 60 + parts.minute;
  if (startMin < endMin) return minute >= startMin && minute < endMin;
  return minute >= startMin || minute < endMin;
}

function quietUntil(now: Date, end: string): Date {
  const endMin = clockMinutes(end) ?? 6 * 60;
  const parts = zonedParts(now);
  const nowMin = parts.hour * 60 + parts.minute;
  const day = nowMin >= endMin ? addDays(parts, 1) : parts;
  const until = zonedTimeToUtc({ ...day, hour: Math.floor(endMin / 60), minute: endMin % 60 });
  if (until.getTime() <= now.getTime()) return new Date(now.getTime() + 60_000);
  return until;
}

function clockMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

function nextEvent(events: SnapshotEvent[], now: Date): { title: string; minutes: number } | null {
  let best: { title: string; minutes: number; at: number } | null = null;
  for (const event of events) {
    if (event.allDay) continue;
    const at = new Date(event.start).getTime();
    const delta = at - now.getTime();
    if (delta <= 0 || delta > EVENT_WINDOW_MS) continue;
    const minutes = Math.max(1, Math.round(delta / 60_000));
    if (!best || at < best.at) best = { title: event.title, minutes, at };
  }
  return best ? { title: best.title, minutes: best.minutes } : null;
}

function dueWithin(dueAt: string, now: Date): boolean {
  const delta = new Date(dueAt).getTime() - now.getTime();
  return delta > 0 && delta <= PRIORITY_WINDOW_MS;
}

function minutesUntil(dueAt: string, now: Date): number {
  return Math.max(1, Math.round((new Date(dueAt).getTime() - now.getTime()) / 60_000));
}

function birthdayTitles(events: SnapshotEvent[], now: Date): string[] {
  const today = dateKey(zonedParts(now));
  const titles: string[] = [];
  for (const event of events) {
    if (dateKey(zonedParts(new Date(event.start))) !== today) continue;
    if (!BIRTHDAY.test(event.title)) continue;
    if (!titles.includes(event.title)) titles.push(event.title);
  }
  return titles;
}

function rainAlert(events: SnapshotEvent[], forecast: ForecastHour[], now: Date): string | null {
  const rainy = forecast
    .map((hour) => ({ hour, at: forecastTime(hour.time) }))
    .filter((item): item is { hour: ForecastHour; at: number } => item.at !== null && isRain(item.hour.code, item.hour.precipitationMm));
  if (rainy.length === 0) return null;
  for (const event of events) {
    if (event.allDay || !OUTDOOR.test(event.title)) continue;
    const start = new Date(event.start).getTime();
    const end = new Date(event.end).getTime();
    if (end < now.getTime() || start - now.getTime() > OUTDOOR_SOON_MS) continue;
    const near = rainy.some((item) => Math.abs(item.at - start) <= RAIN_EVENT_WINDOW_MS && item.at + 60 * 60 * 1000 >= now.getTime());
    if (near) return rainNear(event.title);
  }
  return null;
}

function forecastTime(value: string): number | null {
  if (/[zZ]|[+-]\d{2}:\d{2}$/.test(value)) {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.getTime() : null;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  return zonedTimeToUtc({
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
  }).getTime();
}
