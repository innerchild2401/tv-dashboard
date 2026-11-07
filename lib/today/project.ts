import { ro, type ViewId } from "@/i18n/ro";
import { personChip, type PersonChip } from "@/lib/people";
import { sampleSchedule } from "@/lib/today/schedule";
import {
  addDays,
  dateKey,
  endOfZonedDay,
  formatClock,
  formatDuration,
  formatLongDate,
  formatShortDate,
  zonedParts,
  zonedTimeToUtc,
} from "@/lib/time/bucharest";

type Schedule = typeof sampleSchedule;

export type { PersonChip };

export type AgendaItem = {
  id: string;
  timeLabel: string;
  title: string;
  person: PersonChip | null;
  state: "past" | "current" | "upcoming";
};

export type TimedEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  personId: string | null;
};

export type TodayView = {
  lead: "today" | "tomorrow";
  clock: string;
  dateLabel: string;
  leadLabel: string;
  leadDateLabel: string;
  weather: { location: string; tempC: number | null; label: string | null };
  priority: { text: string; reason: string } | null;
  agenda: AgendaItem[];
  showNowLine: boolean;
  nowBeforeId: string | null;
  nextEvent: {
    kicker: string;
    title: string;
    timeLabel: string;
    person: PersonChip | null;
    countdownPrefix: string;
    countdown: string;
    countdownTarget: string;
  } | null;
  nextDays: { key: string; label: string; titles: string[] }[];
  views: { id: ViewId; label: string; active: boolean; dwellLabel: string }[];
  emptyAgenda: string;
};

export function projectToday(schedule: Schedule, now: Date): TodayView {
  const parts = zonedParts(now);
  const today = { year: parts.year, month: parts.month, day: parts.day };
  return projectTodayFromEvents(
    {
      now,
      events: schedule.events.map((event) => {
        const day = addDays(today, event.dayOffset);
        return {
          id: event.id,
          title: event.title,
          start: zonedTimeToUtc({ ...day, hour: event.start.hour, minute: event.start.minute }).toISOString(),
          end: zonedTimeToUtc({ ...day, hour: event.end.hour, minute: event.end.minute }).toISOString(),
          allDay: event.allDay ?? false,
          personId: event.personId,
        };
      }),
      people: schedule.people,
      priority:
        now < endOfZonedDay(today)
          ? { text: schedule.priority.text, reason: schedule.priority.reason }
          : null,
      eveningLeadHour: schedule.eveningLeadHour,
      weather: schedule.weather,
      viewIds: schedule.viewIds,
      dwellSeconds: schedule.dwellSeconds,
      activeView: "today",
    },
  );
}

export function projectTodayFromEvents(input: {
  now: Date;
  events: TimedEvent[];
  people: { id: string; name: string; color: string }[];
  priority: { text: string; reason: string } | null;
  eveningLeadHour: number;
  weather: TodayView["weather"];
  viewIds: ViewId[];
  dwellSeconds: number;
  activeView: ViewId;
}): TodayView {
  const parts = zonedParts(input.now);
  const today = { year: parts.year, month: parts.month, day: parts.day };
  const leadOffset = parts.hour >= input.eveningLeadHour ? 1 : 0;
  const leadDate = addDays(today, leadOffset);
  const leadKey = dateKey(leadDate);
  const placed = input.events
    .map((event) => ({ event, start: new Date(event.start), end: new Date(event.end) }))
    .filter(({ start }) => dateKey(zonedParts(start)) === leadKey)
    .sort((left, right) => left.start.getTime() - right.start.getTime());

  const agenda: AgendaItem[] = placed.map(({ event, start, end }) => {
    let state: AgendaItem["state"] = "upcoming";
    if (leadOffset === 0 && input.now >= end) state = "past";
    else if (leadOffset === 0 && input.now >= start) state = "current";
    return {
      id: event.id,
      timeLabel: event.allDay ? ro.allDayShort : formatClock(start),
      title: event.title,
      person: personChip(input.people, event.personId),
      state,
    };
  });

  const cursor = agenda.find((item) => item.state !== "past") ?? null;
  const showNowLine = leadOffset === 0 && agenda.length > 0;

  return {
    lead: leadOffset === 0 ? "today" : "tomorrow",
    clock: formatClock(input.now),
    dateLabel: formatLongDate(input.now),
    leadLabel: leadOffset === 0 ? ro.todayLead : ro.tomorrowLead,
    leadDateLabel: formatLongDate(zonedTimeToUtc({ ...leadDate, hour: 12, minute: 0 })),
    weather: input.weather,
    priority: input.priority,
    agenda,
    showNowLine,
    nowBeforeId: showNowLine ? (cursor?.id ?? null) : null,
    nextEvent: cursor ? nextEvent(placed, cursor, input.now) : null,
    nextDays: [1, 2, 3].map((step) => {
      const day = addDays(leadDate, step);
      const key = dateKey(day);
      return {
        key,
        label: formatShortDate(zonedTimeToUtc({ ...day, hour: 12, minute: 0 })),
        titles: input.events
          .filter((event) => dateKey(zonedParts(new Date(event.start))) === key)
          .map((event) => event.title),
      };
    }),
    views: input.viewIds.map((id) => ({
      id,
      label: ro.views[id],
      active: id === input.activeView,
      dwellLabel: id === input.activeView ? `${input.dwellSeconds}s` : "",
    })),
    emptyAgenda: ro.emptyAgenda,
  };
}

function nextEvent(
  placed: { event: TimedEvent; start: Date; end: Date }[],
  cursor: AgendaItem,
  now: Date,
): TodayView["nextEvent"] {
  const match = placed.find((item) => item.event.id === cursor.id);
  if (!match) return null;
  const inProgress = cursor.state === "current";
  const target = inProgress ? match.end : match.start;
  return {
    kicker: inProgress ? ro.happening : ro.nextEvent,
    title: cursor.title,
    timeLabel: match.event.allDay ? ro.allDay : `${formatClock(match.start)}–${formatClock(match.end)}`,
    person: cursor.person,
    countdownPrefix: inProgress ? ro.still : ro.inTime,
    countdown: formatDuration(target.getTime() - now.getTime()),
    countdownTarget: target.toISOString(),
  };
}
