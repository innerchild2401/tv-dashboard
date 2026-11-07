import { sampleConfig } from "@/lib/seed/sample-config";

export type PersonId = (typeof sampleConfig.people)[number]["id"];

export type ScheduleEvent = {
  id: string;
  title: string;
  dayOffset: number;
  start: { hour: number; minute: number };
  end: { hour: number; minute: number };
  personId: PersonId | null;
  allDay?: boolean;
};

// Wall-clock sample matching supabase/seed.sql. dayOffset 0 is the current
// Bucharest day, so the TV page stays readable before the database is linked.
export const sampleEvents: ScheduleEvent[] = [
  {
    id: "22222222-2222-4222-8222-222222222211",
    title: "Cafea",
    dayOffset: -2,
    start: { hour: 12, minute: 0 },
    end: { hour: 13, minute: 0 },
    personId: "mara",
  },
  {
    id: "22222222-2222-4222-8222-222222222210",
    title: "Sport",
    dayOffset: -1,
    start: { hour: 18, minute: 0 },
    end: { hour: 19, minute: 0 },
    personId: "alex",
  },
  {
    id: "22222222-2222-4222-8222-222222222201",
    title: "Mic dejun",
    dayOffset: 0,
    start: { hour: 7, minute: 30 },
    end: { hour: 8, minute: 15 },
    personId: "alex",
  },
  {
    id: "22222222-2222-4222-8222-222222222202",
    title: "Întâlnire la birou",
    dayOffset: 0,
    start: { hour: 9, minute: 0 },
    end: { hour: 10, minute: 30 },
    personId: "alex",
  },
  {
    id: "22222222-2222-4222-8222-222222222203",
    title: "Prânz",
    dayOffset: 0,
    start: { hour: 13, minute: 0 },
    end: { hour: 13, minute: 45 },
    personId: null,
  },
  {
    id: "22222222-2222-4222-8222-222222222204",
    title: "Piață",
    dayOffset: 0,
    start: { hour: 16, minute: 30 },
    end: { hour: 17, minute: 30 },
    personId: "mara",
  },
  {
    id: "22222222-2222-4222-8222-222222222205",
    title: "Cină",
    dayOffset: 0,
    start: { hour: 19, minute: 0 },
    end: { hour: 20, minute: 0 },
    personId: null,
  },
  {
    id: "22222222-2222-4222-8222-222222222206",
    title: "Control medical",
    dayOffset: 1,
    start: { hour: 10, minute: 0 },
    end: { hour: 10, minute: 45 },
    personId: "mara",
  },
  {
    id: "22222222-2222-4222-8222-222222222207",
    title: "Film",
    dayOffset: 1,
    start: { hour: 18, minute: 30 },
    end: { hour: 20, minute: 0 },
    personId: "alex",
  },
  {
    id: "22222222-2222-4222-8222-222222222208",
    title: "Cumpărături",
    dayOffset: 2,
    start: { hour: 11, minute: 0 },
    end: { hour: 12, minute: 30 },
    personId: "mara",
  },
  {
    id: "22222222-2222-4222-8222-222222222209",
    title: "Plimbare pe faleză",
    dayOffset: 3,
    start: { hour: 9, minute: 30 },
    end: { hour: 11, minute: 0 },
    personId: "alex",
  },
  {
    id: "22222222-2222-4222-8222-222222222212",
    title: "Aniversare",
    dayOffset: 10,
    start: { hour: 19, minute: 0 },
    end: { hour: 22, minute: 0 },
    personId: null,
  },
];

export const sampleSchedule = {
  eveningLeadHour: sampleConfig.rules.todayLeadTomorrowHour,
  dwellSeconds: sampleConfig.views[0].dwellSeconds,
  people: sampleConfig.people,
  events: sampleEvents,
  priority: {
    text: "Ridică pachetul de la easybox",
    reason: "Ajunge azi până la 18:00, iar taskul nu e bifat",
    due: { hour: 18, minute: 0 },
  },
  weather: {
    location: sampleConfig.location.name,
    tempC: 14,
    label: "Parțial noros",
  },
  viewIds: sampleConfig.views.map((view) => view.id),
};
