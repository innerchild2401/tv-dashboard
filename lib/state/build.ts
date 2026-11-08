import { ro, type ViewId } from "@/i18n/ro";
import { activeHold, ROTATE_CONTROL, type DisplayControl } from "@/lib/remote/hold";
import { accentColor } from "@/lib/theme/accent";
import { activePriority, evaluateRules } from "@/lib/rotation/rules";
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
  const smart = evaluateRules({
    now,
    config: snapshot.config,
    events: snapshot.events,
    priorities: snapshot.priorities,
    metrics: snapshot.metrics,
    forecast: snapshot.weather.hours ?? [],
    candidates: configured,
  });
  const enabled = configured.map((view) => view.id);
  const held = activeHold(control, now, enabled);
  const forced = forceView && enabled.includes(forceView) ? forceView : null;
  const current = forced ?? held.viewId ?? smart.viewId;
  const active = configured.find((view) => view.id === current);
  const dwellSeconds = active?.dwellSeconds ?? smart.dwellSeconds;
  let until = forced ? new Date(now.getTime() + dwellSeconds * 1000).toISOString() : smart.until;
  let reason = smart.reason;
  let hold = held.mode;
  let quiet = smart.quiet && !forced && !held.viewId;
  if (forced || !held.viewId) hold = "rotate";
  if (!forced && held.viewId && held.mode === "pinned" && control.pinnedUntil) {
    until = control.pinnedUntil;
    reason = `${ro.pinnedUntil} ${formatClock(new Date(control.pinnedUntil))}`;
    quiet = false;
  } else if (!forced && held.mode === "paused" && held.viewId) {
    until = new Date(now.getTime() + 86_400_000).toISOString();
    reason = ro.paused;
    quiet = false;
  } else if (!forced && held.mode === "locked" && held.viewId) {
    until = new Date(now.getTime() + 86_400_000).toISOString();
    reason = ro.lockedView;
    quiet = false;
  }
  const priority = activePriority(snapshot.priorities, now);
  const visible = quiet ? null : current;
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
    quiet,
    notices: smart.notices,
    chrome: {
      clock: formatClock(now),
      dateLabel: formatLongDate(now),
      weather: {
        location: snapshot.weather.location,
        tempC: snapshot.weather.tempC === null ? "" : String(snapshot.weather.tempC),
        label: snapshot.weather.label ?? "",
        updatedLabel: updatedLabel(snapshot.weather.fetchedAt, now, WEATHER_INTERVAL_MS),
      },
      alert: quiet ? null : smart.alert,
      priority: showPriority(snapshot.config.rules.priorityBanner, priority, current, quiet, hold === "locked" || smart.priorityEverywhere),
      accent: accentColor(snapshot.config.theme.accent),
      theme: snapshot.config.theme.mode,
      pills: configured.map((view) => ({
        id: view.id,
        label: ro.views[view.id],
        active: view.id === current,
      })),
    },
    ...empty,
    today: visible === "today" ? { ...todayBody(today), updatedLabel: calendarNote } : null,
    week: visible === "week" ? { ...projectWeek(snapshot, now), updatedLabel: calendarNote } : null,
    month: visible === "month" ? { ...projectMonth(snapshot, now), updatedLabel: calendarNote } : null,
    site: visible === "site" ? withCelebration(projectSite(snapshot, now), smart.celebrations, "site") : null,
    tiktok: visible === "tiktok" ? withCelebration(projectTikTok(snapshot, now), smart.celebrations, "tiktok") : null,
    vision: visible === "vision" ? projectVision(snapshot, now, celebrationText(smart.celebrations, "vision")) : null,
    home: visible === "home" ? projectHome(snapshot, now) : null,
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

function showPriority(
  enabled: boolean,
  priority: { text: string; reason: string } | null,
  current: ViewId,
  quiet: boolean,
  everywhere: boolean,
): { text: string; reason: string } | null {
  if (!enabled || !priority || quiet) return null;
  if (everywhere || current === "today") return { text: priority.text, reason: priority.reason };
  return null;
}

function celebrationText(items: { view: string; text: string }[], view: string): string | null {
  return items.find((item) => item.view === view)?.text ?? null;
}

function withCelebration<T extends { celebration: string | null }>(
  model: T,
  items: { view: string; text: string }[],
  view: string,
): T {
  model.celebration = celebrationText(items, view);
  return model;
}
