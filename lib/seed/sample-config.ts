import type { ViewId } from "@/i18n/ro";

// Keep this object aligned with the config row in supabase/seed.sql.
export const sampleConfig = {
  theme: {
    mode: "dark" as const,
    accent: "teal",
    fonts: { body: "Inter", display: "Space Grotesk" },
  },
  people: [
    { id: "alex" as const, name: "Alex", color: "#7AA7FF" },
    { id: "mara" as const, name: "Mara", color: "#FFB86B" },
  ],
  views: [
    { id: "today" as ViewId, enabled: true, order: 1, dwellSeconds: 45, weight: 3 },
    { id: "week" as ViewId, enabled: true, order: 2, dwellSeconds: 45, weight: 2 },
    { id: "month" as ViewId, enabled: true, order: 3, dwellSeconds: 45, weight: 1 },
    { id: "site" as ViewId, enabled: true, order: 4, dwellSeconds: 45, weight: 1 },
    { id: "tiktok" as ViewId, enabled: true, order: 5, dwellSeconds: 45, weight: 1 },
    { id: "vision" as ViewId, enabled: true, order: 6, dwellSeconds: 45, weight: 1 },
    { id: "home" as ViewId, enabled: true, order: 7, dwellSeconds: 45, weight: 1 },
  ],
  profiles: [
    {
      id: "morning",
      start: "06:00",
      end: "10:00",
      views: [
        { id: "today", weight: 3, dwellSeconds: 60 },
        { id: "week", weight: 2, dwellSeconds: 45 },
        { id: "vision", weight: 1, dwellSeconds: 45 },
      ],
    },
    {
      id: "daytime",
      start: "10:00",
      end: "18:00",
      views: [
        { id: "today", weight: 3, dwellSeconds: 45 },
        { id: "week", weight: 2, dwellSeconds: 45 },
        { id: "month", weight: 1, dwellSeconds: 45 },
        { id: "home", weight: 1, dwellSeconds: 45 },
        { id: "vision", weight: 1, dwellSeconds: 45 },
      ],
    },
    {
      id: "evening",
      start: "18:00",
      end: "23:00",
      views: [
        { id: "today", weight: 2, dwellSeconds: 45 },
        { id: "vision", weight: 2, dwellSeconds: 45 },
        { id: "site", weight: 1, dwellSeconds: 45 },
        { id: "tiktok", weight: 1, dwellSeconds: 45 },
        { id: "home", weight: 1, dwellSeconds: 45 },
      ],
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
  },
};
