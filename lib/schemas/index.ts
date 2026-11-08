import { z } from "zod";

export const sourceSchema = z.enum(["manual", "assistant", "integration"]);

export const paletteTokenSchema = z.enum(["sand", "coral", "lilac", "mint", "sky", "pink"]);

const evidenceSchema = z.string().trim().min(1).max(200);

const gridSchema = z.object({
  col: z.number().int().nonnegative(),
  row: z.number().int().nonnegative(),
  colSpan: z.number().int().positive(),
  rowSpan: z.number().int().positive(),
});

const cardBase = {
  id: z.string().uuid(),
  viewId: z.string().min(1),
  title: z.string().max(200).optional(),
  body: z.string().max(500).optional(),
  color: paletteTokenSchema,
  tilt: z.number().min(-3).max(3),
  grid: gridSchema,
  expiresAt: z.string().datetime({ offset: true }).optional(),
  pinned: z.boolean(),
  source: sourceSchema,
  locked: z.boolean(),
  externalId: z.string().min(1).max(200).optional(),
};

export const cardSchema = z.discriminatedUnion("kind", [
  z.object({
    ...cardBase,
    kind: z.literal("photo"),
    data: z.object({
      storagePath: z.string().min(1).optional(),
      alt: z.string().max(200).optional(),
    }),
  }),
  z.object({
    ...cardBase,
    kind: z.literal("affirmation"),
    data: z.object({ text: z.string().max(500).optional() }),
  }),
  z.object({
    ...cardBase,
    kind: z.literal("countdown"),
    data: z.object({
      target: z.string().datetime({ offset: true }),
      label: z.string().max(200).optional(),
    }),
  }),
  z.object({
    ...cardBase,
    kind: z.literal("word"),
    data: z.object({ word: z.string().trim().min(1).max(80) }),
  }),
  z.object({
    ...cardBase,
    kind: z.literal("progress"),
    data: z.object({
      label: z.string().min(1).max(200),
      value: z.number(),
      max: z.number().positive(),
      style: z.enum(["ring", "bar"]),
      evidence: evidenceSchema,
    }),
  }),
  z.object({
    ...cardBase,
    kind: z.literal("wins"),
    data: z.object({
      items: z
        .array(
          z.object({
            text: z.string().min(1).max(200),
            evidence: evidenceSchema,
          }),
        )
        .max(8),
    }),
  }),
  z.object({
    ...cardBase,
    kind: z.literal("recap"),
    data: z.object({ recapId: z.string().uuid().optional() }),
  }),
  z.object({
    ...cardBase,
    kind: z.literal("note"),
    data: z.object({ text: z.string().max(500).optional() }),
  }),
]);

export const eventSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  start: z.string().datetime({ offset: true }),
  end: z.string().datetime({ offset: true }),
  allDay: z.boolean(),
  personId: z.string().min(1).nullable(),
  source: sourceSchema,
  externalId: z.string().min(1).optional(),
});

export const taskSchema = z.object({
  id: z.string().uuid(),
  text: z.string().trim().min(1).max(500),
  done: z.boolean(),
  assigneeId: z.string().min(1).nullable(),
  dueDate: z.string().date().nullable(),
  source: sourceSchema,
  locked: z.boolean(),
  externalId: z.string().min(1).optional(),
});

export const shoppingItemSchema = z.object({
  id: z.string().uuid(),
  text: z.string().trim().min(1).max(200),
  qty: z.number().nonnegative(),
  unit: z.string().max(40).nullable(),
  category: z.string().max(80).nullable(),
  checked: z.boolean(),
  source: sourceSchema,
  locked: z.boolean(),
});

export const recapSchema = z.object({
  id: z.string().uuid(),
  text: z.string().max(800),
  highlights: z.array(z.string().max(200)).max(5),
  source: sourceSchema,
});

export const prioritySchema = z.object({
  id: z.string().uuid(),
  text: z.string().trim().min(1).max(200),
  reason: z.string().trim().min(1).max(300),
  dueAt: z.string().datetime({ offset: true }).nullable(),
  taskId: z.string().uuid().nullable(),
  expiresAt: z.string().datetime({ offset: true }),
  source: sourceSchema,
  locked: z.boolean(),
});

export const configSchema = z.object({
  theme: z.object({
    mode: z.enum(["dark", "light"]),
    accent: z.string().min(1),
    fonts: z.object({ body: z.string().min(1), display: z.string().min(1) }),
  }),
  people: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    }),
  ),
  views: z.array(
    z.object({
      id: z.string().min(1),
      enabled: z.boolean(),
      order: z.number().int(),
      dwellSeconds: z.number().int().positive(),
      weight: z.number().positive(),
    }),
  ),
  profiles: z.array(
    z.object({
      id: z.string().min(1),
      start: z.string(),
      end: z.string(),
      views: z.array(
        z.object({
          id: z.string(),
          weight: z.number(),
          dwellSeconds: z.number(),
        }),
      ),
    }),
  ),
  quietHours: z.object({ start: z.string(), end: z.string() }),
  location: z.object({
    name: z.string().min(1),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    timezone: z.literal("Europe/Bucharest"),
  }),
  rules: z
    .object({
      todayLeadTomorrowHour: z.number().int().min(0).max(23).default(20),
      skipEmpty: z.boolean().default(true),
      quietHours: z.boolean().default(true),
      interrupts: z.boolean().default(true),
      timeOfDay: z.boolean().default(true),
      eventProximity: z.boolean().default(true),
      priorityBanner: z.boolean().default(true),
      celebrations: z.boolean().default(true),
      weatherAlert: z.boolean().default(true),
    })
    .default({
      todayLeadTomorrowHour: 20,
      skipEmpty: true,
      quietHours: true,
      interrupts: true,
      timeOfDay: true,
      eventProximity: true,
      priorityBanner: true,
      celebrations: true,
      weatherAlert: true,
    }),
});

export type Card = z.infer<typeof cardSchema>;
export type DashboardEvent = z.infer<typeof eventSchema>;
