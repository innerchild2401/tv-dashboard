import { ro, rotationReason, type ViewId } from "@/i18n/ro";
import { activeHold, ROTATE_CONTROL, type DisplayControl } from "@/lib/remote/hold";
import { accentColor } from "@/lib/theme/accent";
import { prepareCandidates, resolveRotation } from "@/lib/rotation/engine";
import { viewCandidates } from "@/lib/state/availability";
import { projectWeek, projectMonth } from "@/lib/views/calendar";
import { projectHome, projectVision } from "@/lib/views/household";
import { projectSite, projectTikTok } from "@/lib/views/metrics";
import { CALENDAR_INTERVAL_MS, WEATHER_INTERVAL_MS } from "@/lib/adapters/intervals";
import { updatedLabel } from "@/lib/format/display";
import { formatClock, formatLongDate } from "@/lib/time/bucharest";
import { projectTodayFromEvents } from "@/lib/today/project";
import type { Snapshot, TodayModel, TvState } from "@/lib/state/types";

export function buildTvState(
  snapshot: Snapshot,
  now: Date,
  forceView?: ViewId | null,
  control: DisplayControl = ROTATE_CONTROL,
): TvState {
  const configured = viewCandidates(snapshot, now);
  const prepared = prepareCandidates(configured, snapshot.config.rules.skipEmpty);
  const pool = prepared.length > 0 ? prepared : configured;
  const decision = resolveRotation(now, pool);
  const enabled = configured.map((view) => view.id);
  const held = activeHold(control, now, enabled);
  const forced = forceView && enabled.includes(forceView) ? forceView : null;
  const current = forced ?? held.viewId ?? decision.viewId;
  const active = pool.find((view) => view.id === current) ?? configured.find((view) => view.id === current);
  const dwellSeconds = active?.dwellSeconds ?? decision.dwellSeconds;
  const weight = active?.weight ?? decision.weight;
  let until = forced ? new Date(now.getTime() + dwellSeconds * 1000).toISOString() : decision.until;
  let reason = pool.length === 0 ? ro.rotationOnly : rotationReason(current, weight);
  let hold = held.mode;
  if (forced || !held.viewId) hold = "rotate";
  if (!forced && held.viewId && held.mode === "pinned" && control.pinnedUntil) {
    until = control.pinnedUntil;
    reason = `${ro.pinnedUntil} ${formatClock(new Date(control.pinnedUntil))}`;
  } else if (!forced && held.mode === "paused" && held.viewId) {
    until = new Date(now.getTime() + 86_400_000).toISOString();
    reason = ro.paused;
  } else if (!forced && held.mode === "locked" && held.viewId) {
    until = new Date(now.getTime() + 86_400_000).toISOString();
    reason = ro.lockedView;
  }
  const priority = activePriority(snapshot, now);
  const calendarNote = updatedLabel(snapshot.calendarFetchedAt, now, CALENDAR_INTERVAL_MS);
  const today = projectTodayFromEvents({
    now,
    events: snapshot.events,
    people: snapshot.config.people,
    priority,
    eveningLeadHour: snapshot.config.rules.todayLeadTomorrowHour,
    weather: snapshot.weather,
    viewIds: configured.map((view) => view.id),
    dwellSeconds,
    activeView: current,
  });

  const empty = {
    today: null,
    week: null,
    month: null,
    site: null,
    tiktok: null,
    vision: null,
    home: null,
  };

  return {
    ok: true,
    generatedAt: now.toISOString(),
    currentView: current,
    until,
    reason,
    dwellRemaining: Math.max(0, Math.round((new Date(until).getTime() - now.getTime()) / 1000)),
    hold,
    dimmed: control.dimmed,
    chrome: {
      clock: formatClock(now),
      dateLabel: formatLongDate(now),
      weather: {
        location: snapshot.weather.location,
        tempC: snapshot.weather.tempC === null ? "" : String(snapshot.weather.tempC),
        label: snapshot.weather.label ?? "",
        updatedLabel: updatedLabel(snapshot.weather.fetchedAt, now, WEATHER_INTERVAL_MS),
      },
      priority,
      accent: accentColor(snapshot.config.theme.accent),
      theme: snapshot.config.theme.mode,
      pills: configured.map((view) => ({
        id: view.id,
        label: ro.views[view.id],
        active: view.id === current,
      })),
    },
    ...empty,
    today: current === "today" ? { ...todayBody(today), updatedLabel: calendarNote } : null,
    week: current === "week" ? { ...projectWeek(snapshot, now), updatedLabel: calendarNote } : null,
    month: current === "month" ? { ...projectMonth(snapshot, now), updatedLabel: calendarNote } : null,
    site: current === "site" ? projectSite(snapshot, now) : null,
    tiktok: current === "tiktok" ? projectTikTok(snapshot, now) : null,
    vision: current === "vision" ? projectVision(snapshot, now) : null,
    home: current === "home" ? projectHome(snapshot, now) : null,
  };
}

function todayBody(today: ReturnType<typeof projectTodayFromEvents>): Omit<TodayModel, "updatedLabel"> {
  return {
    leadLabel: today.leadLabel,
    leadDateLabel: today.leadDateLabel,
    agenda: today.agenda,
    showNowLine: today.showNowLine,
    nowBeforeId: today.nowBeforeId,
    nextEvent: today.nextEvent,
    nextDays: today.nextDays,
    emptyAgenda: today.emptyAgenda,
  };
}

function activePriority(snapshot: Snapshot, now: Date): { text: string; reason: string } | null {
  const live = snapshot.priorities
    .filter((item) => new Date(item.expiresAt).getTime() > now.getTime())
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const chosen = live.find((item) => item.locked || item.source === "manual") ?? live[0];
  if (!chosen) return null;
  return { text: chosen.text, reason: chosen.reason };
}
