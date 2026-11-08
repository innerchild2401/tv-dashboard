import type { ViewId } from "@/i18n/ro";

const DWELL = 120;
const equal = (id: ViewId, order: number) => ({
  id,
  enabled: true,
  order,
  dwellSeconds: DWELL,
  weight: 1,
});
const slot = (id: ViewId) => ({ id, weight: 1, dwellSeconds: DWELL });

// Keep this object aligned with the config row in supabase/seed.sql.
export const sampleConfig = {
  theme: {
    mode: "dark" as const,
    accent: "teal",
    fonts: { body: "Inter", display: "Space Grotesk" },
  },
  people: [{ id: "alex" as const, name: "Alex", color: "#7AA7FF" }],
  views: [
    equal("today" as ViewId, 1),
    equal("week" as ViewId, 2),
    equal("momente" as ViewId, 3),
    equal("vision" as ViewId, 4),
    equal("home" as ViewId, 5),
  ],
  profiles: [
    {
      id: "morning",
      start: "06:00",
      end: "10:00",
      views: [slot("today"), slot("week"), slot("momente"), slot("vision"), slot("home")],
    },
    {
      id: "daytime",
      start: "10:00",
      end: "18:00",
      views: [slot("today"), slot("week"), slot("momente"), slot("vision"), slot("home")],
    },
    {
      id: "evening",
      start: "18:00",
      end: "23:00",
      views: [slot("today"), slot("week"), slot("momente"), slot("vision"), slot("home")],
    },
  ],
  quietHours: { start: "23:00", end: "06:00" },
  location: {
    name: "Constanța",
    latitude: 44.1598,
    longitude: 28.6348,
    timezone: "Europe/Bucharest" as const,
  },
  rules: {
    todayLeadTomorrowHour: 20,
    skipEmpty: true,
    quietHours: true,
    interrupts: true,
    // Round-robin uses the full views list; profiles stay equal if someone turns this on.
    timeOfDay: false,
    eventProximity: true,
    priorityBanner: true,
    celebrations: true,
    weatherAlert: true,
  },
};
