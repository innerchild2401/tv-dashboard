export const ro = {
  appTitle: "Tablou",
  homeIntro:
    "Ecranul televizorului este pregătit cu date de exemplu. Completează variabilele de mediu înainte de deploy.",
  openTv: "Deschide ecranul TV",
  viewsNav: "Ecrane",
  views: {
    today: "Azi",
    week: "Săptămână",
    month: "Lună",
    site: "Site",
    tiktok: "TikTok",
    vision: "Vision board",
    home: "Acasă",
  },
  now: "Acum",
  todayLead: "Azi",
  tomorrowLead: "Mâine",
  nextEvent: "Următorul",
  happening: "În curs",
  still: "încă",
  inTime: "în",
  emptyAgenda: "Nimic programat",
  nothingShort: "Nimic",
  nextDays: "Următoarele zile",
  priority: "Prioritate",
  tokenInvalid: "Linkul televizorului nu este valid.",
  tokenUnconfigured: "Tabloul nu este configurat.",
} as const;

export type ViewId = keyof typeof ro.views;
