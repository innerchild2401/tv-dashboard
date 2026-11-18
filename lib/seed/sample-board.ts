import { addDays, zonedParts, zonedTimeToUtc } from "@/lib/time/bucharest";
import type { SnapshotCard, SnapshotMessage, SnapshotRecap, SnapshotShopping, SnapshotTask } from "@/lib/state/types";

export const sampleTasks: SnapshotTask[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    text: "Ridică pachetul de la easybox",
    done: false,
    assigneeId: "alex",
    dueDate: null,
    },
];

export const sampleShopping: SnapshotShopping[] = [
  {
    id: "44444444-4444-4444-8444-444444444401",
    text: "Lapte",
    qty: 2,
    unit: "l",
    category: "Lactate",
    checked: false,
  },
  {
    id: "44444444-4444-4444-8444-444444444402",
    text: "Pâine",
    qty: 1,
    unit: "buc",
    category: "Brutărie",
    checked: false,
  },
  {
    id: "44444444-4444-4444-8444-444444444403",
    text: "Mere",
    qty: 1,
    unit: "kg",
    category: "Fructe",
    checked: true,
  },
];

export const sampleMessages: SnapshotMessage[] = [
  {
    id: "88888888-8888-4888-8888-888888888801",
    text: "Bine ați venit acasă!",
    author: "Alex",
    color: "peach",
    createdAt: "2026-11-08T10:00:00.000Z",
  },
];

export const sampleRecap: SnapshotRecap = {
  id: "55555555-5555-4555-8555-555555555501",
  text: "O zi liniștită: tema e gata, iar seara rămâne cină în familie.",
  highlights: ["Tema terminată", "Pachetul ajunge azi"],
  expiresAt: null,
};

export function sampleCards(now: Date): SnapshotCard[] {
  const parts = zonedParts(now);
  const target = zonedTimeToUtc({ ...addDays(parts, 21), hour: 9, minute: 0 }).toISOString();
  return [
    {
      id: "66666666-6666-4666-8666-666666666601",
      kind: "affirmation",
      title: "Efeseni 5:22",
      body: "Supuneți-vă unii altora în frica lui Hristos.",
      color: "sand",
      tilt: 2,
      grid: { col: 0, row: 0, colSpan: 2, rowSpan: 2 },
      expiresAt: null,
      data: { text: "Supuneți-vă unii altora în frica lui Hristos.", fontScale: "lg" },
    },
    {
      id: "66666666-6666-4666-8666-666666666602",
      kind: "word",
      title: "Cuvântul lunii",
      body: "Răbdare în fiecare zi",
      color: "lilac",
      tilt: -1,
      grid: { col: 3, row: 0, colSpan: 1, rowSpan: 1 },
      expiresAt: null,
      data: { word: "Răbdare", fontScale: "sm" },
    },
    {
      id: "66666666-6666-4666-8666-666666666603",
      kind: "countdown",
      title: "Vacanță",
      body: "Plecare spre munte",
      color: "sky",
      tilt: 1,
      grid: { col: 2, row: 0, colSpan: 1, rowSpan: 1 },
      expiresAt: null,
      data: { target, label: "Vacanță", fontScale: "sm" },
    },
    {
      id: "66666666-6666-4666-8666-666666666604",
      kind: "progress",
      title: "Pachetul",
      body: "Easybox până diseară",
      color: "mint",
      tilt: -2,
      grid: { col: 0, row: 2, colSpan: 2, rowSpan: 1 },
      expiresAt: null,
      data: {
        label: "Pachetul",
        value: 0,
        max: 1,
        style: "ring",
        evidence: "task:done:11111111-1111-4111-8111-111111111111",
        fontScale: "sm",
      },
    },
    {
      id: "66666666-6666-4666-8666-666666666605",
      kind: "wins",
      title: "Bravo, Zian! 🏆",
      body: "A terminat tema la mate",
      color: "coral",
      tilt: 1,
      grid: { col: 2, row: 1, colSpan: 1, rowSpan: 1 },
      expiresAt: null,
      data: {
        items: [
          {
            text: "A terminat tema la mate",
            evidence: "manual:sample",
          },
        ],
        fontScale: "md",
      },
    },
    {
      id: "66666666-6666-4666-8666-666666666606",
      kind: "recap",
      title: "Rezumat",
      body: sampleRecap.text,
      color: "pink",
      tilt: -1,
      grid: { col: 2, row: 2, colSpan: 2, rowSpan: 1 },
      expiresAt: null,
      data: { recapId: sampleRecap.id, fontScale: "sm" },
    },
  ];
}
