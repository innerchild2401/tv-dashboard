import { ro, type ViewId } from "@/i18n/ro";
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

export type PersonChip = { name: string; color: string };

export type AgendaItem = {
  id: string;
  timeLabel: string;
  title: string;
  person: PersonChip | null;
  state: "past" | "current" | "upcoming";
};

export type TodayView = {
  lead: "today" | "tomorrow";
  clock: string;
  dateLabel: string;
  leadLabel: string;
  leadDateLabel: string;
  weather: Schedule["weather"];
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
  } | null;
  nextDays: { key: string; label: string; titles: string[] }[];
  views: { id: ViewId; label: string; active: boolean; dwellLabel: string }[];
  emptyAgenda: string;
};

export function projectToday(schedule: Schedule, now: Date): TodayView {
  const parts = zonedParts(now);
  const today = { year: parts.year, month: parts.month, day: parts.day };
  const leadOffset = parts.hour >= schedule.eveningLeadHour ? 1 : 0;
  const leadDate = addDays(today, leadOffset);
  const placed = schedule.events
    .filter((event) => event.dayOffset === leadOffset)
    .map((event) => ({
      event,
      start: zonedTimeToUtc({ ...leadDate, ...event.start }),
      end: zonedTimeToUtc({ ...leadDate, ...event.end }),
    }))
    .sort((left, right) => left.start.getTime() - right.start.getTime());

  const agenda: AgendaItem[] = placed.map(({ event, start, end }) => {
    let state: AgendaItem["state"] = "upcoming";
    if (leadOffset === 0 && now >= end) state = "past";
    else if (leadOffset === 0 && now >= start) state = "current";
    return {
      id: event.id,
      timeLabel: formatClock(start),
      title: event.title,
      person: personChip(schedule, event.personId),
      state,
    };
  });

  const cursor = agenda.find((item) => item.state !== "past") ?? null;
  const showNowLine = leadOffset === 0 && agenda.length > 0;
  const priorityVisible = now < endOfZonedDay(today);

  return {
    lead: leadOffset === 0 ? "today" : "tomorrow",
    clock: formatClock(now),
    dateLabel: formatLongDate(now),
    leadLabel: leadOffset === 0 ? ro.todayLead : ro.tomorrowLead,
    leadDateLabel: formatLongDate(zonedTimeToUtc({ ...leadDate, hour: 12, minute: 0 })),
    weather: schedule.weather,
    priority: priorityVisible
      ? { text: schedule.priority.text, reason: schedule.priority.reason }
      : null,
    agenda,
    showNowLine,
    nowBeforeId: showNowLine ? (cursor?.id ?? null) : null,
    nextEvent: cursor ? nextEvent(placed, cursor, now) : null,
    nextDays: [1, 2, 3].map((step) => {
      const day = addDays(today, leadOffset + step);
      return {
        key: dateKey(day),
        label: formatShortDate(zonedTimeToUtc({ ...day, hour: 12, minute: 0 })),
        titles: schedule.events
          .filter((event) => event.dayOffset === leadOffset + step)
          .map((event) => event.title),
      };
    }),
    views: schedule.viewIds.map((id) => ({
      id,
      label: ro.views[id],
      active: id === "today",
      dwellLabel: id === "today" ? `${schedule.dwellSeconds}s` : "",
    })),
    emptyAgenda: ro.emptyAgenda,
  };
}

function nextEvent(
  placed: { event: Schedule["events"][number]; start: Date; end: Date }[],
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
    timeLabel: `${formatClock(match.start)}–${formatClock(match.end)}`,
    person: cursor.person,
    countdownPrefix: inProgress ? ro.still : ro.inTime,
    countdown: formatDuration(target.getTime() - now.getTime()),
  };
}

function personChip(schedule: Schedule, personId: Schedule["events"][number]["personId"]): PersonChip | null {
  if (!personId) return null;
  const person = schedule.people.find((item) => item.id === personId);
  if (!person) return null;
  return { name: person.name, color: person.color };
}
