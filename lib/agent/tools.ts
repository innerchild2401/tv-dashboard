import { z } from "zod";
import { argsHash } from "@/lib/agent/auth";
import { SupabaseStore } from "@/lib/agent/db";
import { MemoryStore } from "@/lib/agent/memory";
import {
  RATE_LIMIT,
  TOOL_NAMES,
  active,
  copy,
  refusal,
  success,
  textKey,
  type AgentStore,
  type CardKind,
  type CardRecord,
  type MessageColor,
  type MessageRecord,
  type Palette,
  type PersonRow,
  type PriorityRecord,
  type RecapRecord,
  type ShoppingRecord,
  type Source,
  type SpotlightKind,
  type SpotlightRecord,
  type TaskRecord,
  type ToolName,
  type ToolResult,
  type UndoBody,
} from "@/lib/agent/model";
import { readPublicImage, type ImageFetch } from "@/lib/agent/network";
import { bucharestDate, endOfToday, findAppointment, parseInstant } from "@/lib/agent/when";
import { databaseConfigured } from "@/lib/db/server";
import { ACCENT_CHOICES } from "@/lib/theme/accent";
import { plainText } from "@/lib/remote/text";
import { publishChange } from "@/lib/remote/publish";
import { cardSchema, paletteTokenSchema } from "@/lib/schemas";
import { endOfZonedDay, zonedParts, zonedTimeToUtc } from "@/lib/time/bucharest";
import type { DisplayControl } from "@/lib/remote/hold";

const READS = new Set<ToolName>(["get_dashboard_state", "get_schema", "get_inbox"]);
const KIND_COLOR: Record<CardKind, Palette> = {
  photo: "coral",
  affirmation: "pink",
  countdown: "mint",
  word: "lilac",
  progress: "sky",
  wins: "sand",
  recap: "sky",
  note: "mint",
};

const emptyInput = z.object({});
const cardInput = z.object({
  externalId: z.string().trim().min(1).max(200).describe("Stable idempotency key. The same value updates the existing card."),
  viewId: z.string().trim().min(1).max(40).optional().describe('Defaults to "vision" (Victorii / vision board).'),
  kind: z.enum(["photo", "affirmation", "countdown", "word", "progress", "wins", "recap", "note"]),
  title: z.string().max(200).optional(),
  body: z.string().max(500).optional(),
  color: paletteTokenSchema.optional(),
  data: z.record(z.string(), z.unknown()).optional().describe("Kind-specific fields. For photo cards use data.alt; storagePath is set server-side."),
  expiresAt: z.string().max(40).optional(),
  image_url: z
    .string()
    .max(2000)
    .optional()
    .describe(
      "HTTPS URL of a jpeg/png/webp/gif (max 5 MB). Only for kind=photo. The server downloads it into the private photos bucket and sets data.storagePath. Prefer https://. Rejects non-images and oversized files.",
    ),
});
const deleteInput = z.object({
  id: z.string().uuid().optional(),
  externalId: z.string().trim().min(1).max(200).optional(),
});
const recapInput = z.object({
  externalId: z.string().trim().min(1).max(200).optional(),
  text: z.string().trim().min(1).max(800),
  highlights: z.array(z.string().max(200)).max(5).optional(),
  expiresAt: z.string().max(40).optional(),
});
const priorityInput = z.object({
  externalId: z.string().trim().min(1).max(200).optional(),
  text: z.string().trim().min(1).max(200),
  reason: z.string().trim().min(1, "a priority needs a one-line reason").max(300),
  dueAt: z.string().max(40).nullable().optional(),
  taskId: z.string().uuid().nullable().optional(),
  expiresAt: z.string().max(40).optional(),
});
const inboxInput = z.object({
  status: z.enum(["new", "routed", "needs_review"]).optional(),
});
const routeInput = z.object({
  id: z.string().uuid(),
  destination: z.enum(["task", "shopping", "event", "idea", "note", "review"]).optional(),
  status: z.enum(["routed", "needs_review"]).optional(),
  fields: z
    .object({
      text: z.string().max(500).optional(),
      title: z.string().max(200).optional(),
      qty: z.number().nonnegative().optional(),
      unit: z.string().max(40).nullable().optional(),
      category: z.string().max(80).nullable().optional(),
      assignee: z.string().max(80).nullable().optional(),
      dueDate: z.string().date().nullable().optional(),
      done: z.boolean().optional(),
      start: z.string().max(40).optional(),
      end: z.string().max(40).optional(),
      allDay: z.boolean().optional(),
      person: z.string().max(80).nullable().optional(),
      tags: z.array(z.string().max(40)).max(8).optional(),
    })
    .optional(),
});
const eventsInput = z.object({
  events: z
    .array(
      z.object({
        externalId: z.string().trim().min(1).max(200),
        title: z.string().trim().min(1).max(200),
        start: z.string().min(8).max(40),
        end: z.string().min(8).max(40),
        allDay: z.boolean().optional(),
        person: z.string().max(80).nullable().optional(),
      }),
    )
    .min(1)
    .max(40),
});
const taskInput = z.object({
  externalId: z.string().trim().min(1).max(200),
  text: z.string().trim().min(1).max(500),
  done: z.boolean().optional(),
  assignee: z.string().max(80).nullable().optional(),
  dueDate: z.string().date().nullable().optional(),
});
const shoppingInput = z.object({
  items: z
    .array(
      z.object({
        text: z.string().trim().min(1).max(200),
        qty: z.number().nonnegative().optional(),
        unit: z.string().max(40).nullable().optional(),
        category: z.string().max(80).nullable().optional(),
        externalId: z.string().trim().min(1).max(200).optional(),
      }),
    )
    .min(1)
    .max(40),
});
const checkInput = z.object({
  ids: z.array(z.string().uuid()).min(1).max(50),
  checked: z.boolean(),
});
const shoppingDeleteInput = z.object({
  ids: z.array(z.string().uuid()).min(1).max(50).optional(),
  externalIds: z.array(z.string().trim().min(1).max(200)).min(1).max(50).optional(),
});
const messageInput = z.object({
  externalId: z.string().trim().min(1).max(200),
  text: z.string().trim().min(1).max(280),
  author: z.string().trim().min(1).max(80).nullable().optional(),
  color: z.enum(["butter", "peach", "mint", "sky", "rose", "lemon"]).optional(),
});
const metricInput = z.object({
  key: z.string().trim().min(1).max(120).regex(/^[a-z0-9][a-z0-9._-]*$/i, "metric key must be letters, numbers, dots or dashes"),
  value: z.number().finite(),
  previous: z.number().finite().nullable().optional(),
});
const pinInput = z.object({
  viewId: z.string().trim().min(1).max(40).optional(),
  cardId: z.string().uuid().optional(),
  minutes: z.number().int().min(1).max(30, "pin can last at most 30 minutes").optional(),
});
const undoInput = z.object({
  id: z.string().uuid().optional(),
});
const spotlightInput = z.object({
  externalId: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(200),
  kind: z.enum(["trip", "competition", "deadline", "other"]).optional(),
  startsAt: z.string().min(8).max(40),
  note: z.string().max(500).nullable().optional(),
  pinned: z.boolean().optional(),
});

export const TOOL_CATALOG: { name: ToolName; title: string; description: string; input: z.ZodType }[] = [
  {
    name: "get_dashboard_state",
    title: "Dashboard state",
    description:
      "Read views, cards, Momente spotlights, lists, today's events, the recap and the priority before writing. Spotlights power the Momente TV view (view id momente).",
    input: emptyInput,
  },
  {
    name: "get_schema",
    title: "Schemas for Grokbot",
    description:
      "Return contracts for Vision cards, Momente spotlights, and Acasă (home) post-its: upsert_task/delete_task, shopping_add/shopping_check/shopping_delete, upsert_message/delete_message. Romanian text ok. Same externalId updates.",
    input: emptyInput,
  },
  { name: "upsert_card", title: "Upsert card", description: "Create or update a card on Victorii (viewId vision). The same externalId updates the existing card. A manual or locked card is refused. A win or progress card needs evidence. For a photo, pass kind=photo and image_url (HTTPS); the server stores it in the private photos bucket.", input: cardInput },
  { name: "delete_card", title: "Delete card", description: "Soft-delete a card the assistant owns. Pass id or externalId.", input: deleteInput },
  {
    name: "upsert_spotlight",
    title: "Upsert Momente spotlight",
    description:
      "Create or update a Momente countdown. Params: externalId (stable key), title (Romanian ok, e.g. Vacanță la munte), kind (trip=Călătorie, competition=Competiție, deadline=Termen, other=Altele; default other), startsAt (ISO date/time; day countdown in Europe/Bucharest), note (optional), pinned (optional bool — pinned stay on screen when overflow). Same externalId updates. Example: {\"externalId\":\"trip-ski-2027\",\"title\":\"Vacanță la munte\",\"kind\":\"trip\",\"startsAt\":\"2027-01-12T08:00:00+02:00\",\"pinned\":true}. Past days are hidden on TV. Soft-deleted via delete_spotlight.",
    input: spotlightInput,
  },
  {
    name: "delete_spotlight",
    title: "Delete Momente spotlight",
    description:
      "Soft-delete an assistant-owned Momente spotlight. Pass id (uuid) or externalId. Example: {\"externalId\":\"trip-ski-2027\"}. Locked/manual rows are refused.",
    input: deleteInput,
  },
  { name: "set_recap", title: "Daily recap", description: "Replace the assistant's daily recap text and recap card. Use a stable externalId such as recap-2026-11-08.", input: recapInput },
  { name: "set_priority", title: "Priority", description: "Set the one priority for today. A reason is required. A manual priority always wins.", input: priorityInput },
  { name: "get_inbox", title: "Inbox", description: "List inbox items that are not routed yet. Pass status to filter.", input: inboxInput },
  { name: "route_inbox_item", title: "Route inbox", description: "Route an inbox item to a task, shopping item, event, idea or note. Leave it as needs review when the destination is unclear. Create an event only when the text has a date and a time.", input: routeInput },
  { name: "upsert_events", title: "Upsert events", description: "Create or update assistant-owned events. The same externalId updates the existing event.", input: eventsInput },
  {
    name: "upsert_task",
    title: "Upsert task",
    description:
      "Create or update a task on Acasă. Params: externalId (stable), text, done?, assignee? (person id or name), dueDate? (YYYY-MM-DD). Same externalId updates. Example: {\"externalId\":\"task-easybox\",\"text\":\"Ridică pachetul\",\"assignee\":\"Alex\",\"dueDate\":\"2026-11-09\"}.",
    input: taskInput,
  },
  {
    name: "delete_task",
    title: "Delete task",
    description: "Soft-delete an assistant-owned task. Pass id (uuid) or externalId. Locked/manual rows are refused.",
    input: deleteInput,
  },
  {
    name: "shopping_add",
    title: "Add shopping",
    description:
      "Add grocery items on Acasă, merging duplicates by name or externalId. A second run does not create another row or add qty again. Example: {\"items\":[{\"text\":\"Lapte\",\"qty\":2,\"unit\":\"l\",\"category\":\"Lactate\"}]}.",
    input: shoppingInput,
  },
  {
    name: "shopping_check",
    title: "Check shopping",
    description: "Check or uncheck grocery items the assistant owns. Pass ids (uuids from get_dashboard_state) and checked true|false.",
    input: checkInput,
  },
  {
    name: "shopping_delete",
    title: "Delete shopping",
    description: "Soft-delete assistant-owned grocery items. Pass ids and/or externalIds. Locked/manual rows are skipped with a warning.",
    input: shoppingDeleteInput,
  },
  {
    name: "upsert_message",
    title: "Upsert message",
    description:
      "Create or update a family message post-it on Acasă. Params: externalId, text (≤280), author? (e.g. Mama), color? butter|peach|mint|sky|rose|lemon. Example: {\"externalId\":\"msg-cină\",\"text\":\"Cina e la 19\",\"author\":\"Alex\",\"color\":\"peach\"}.",
    input: messageInput,
  },
  {
    name: "delete_message",
    title: "Delete message",
    description: "Soft-delete an assistant-owned Acasă message. Pass id or externalId.",
    input: deleteInput,
  },
  { name: "set_metric", title: "Set metric", description: "Set a metric the integrations cannot fetch. A manual metric is left unchanged.", input: metricInput },
  {
    name: "pin_view",
    title: "Pin view",
    description: "Show a view for at most 30 minutes. View ids include momente (Momente countdowns). This cannot lock the screen or change config.",
    input: pinInput,
  },
  { name: "undo", title: "Undo", description: "Restore the previous state of the latest assistant write, or of one of the last 50. A later manual edit is kept.", input: undoInput },
];

type Outcome = { result: ToolResult; undo: UndoBody | null };

const HOST = globalThis as typeof globalThis & { __tvDashboardAgent?: MemoryStore };

export function agentStore(): AgentStore | null {
  if (databaseConfigured()) return new SupabaseStore();
  if (process.env.NODE_ENV === "production") return null;
  if (!HOST.__tvDashboardAgent) HOST.__tvDashboardAgent = new MemoryStore();
  return HOST.__tvDashboardAgent;
}

export function isTool(name: string): name is ToolName {
  return (TOOL_NAMES as readonly string[]).includes(name);
}

export async function executeTool(
  name: string,
  args: unknown,
  options: { store?: AgentStore | null; now?: Date; fetchImage?: ImageFetch } = {},
): Promise<ToolResult> {
  const now = options.now ?? new Date();
  const store = options.store === undefined ? agentStore() : options.store;
  if (!store) return refusal("the dashboard database is not configured");
  if (!isTool(name)) return refusal("unknown tool");
  let recent = 0;
  try {
    recent = await store.countRecent(now);
  } catch {
    return refusal("the dashboard could not check the rate limit");
  }
  if (recent >= RATE_LIMIT) {
    const result = refusal("too many requests, try again in a minute");
    await store.audit({ tool: name, argsHash: argsHash(name, {}), result, undo: null, now }).catch(() => undefined);
    return result;
  }
  try {
    const outcome = await dispatch(store, name, scrub(args ?? {}), now, options.fetchImage ?? readPublicImage);
    try {
      await store.audit({ tool: name, argsHash: argsHash(name, scrub(args ?? {})), result: outcome.result, undo: outcome.undo, now });
    } catch {
      if (outcome.result.ok) outcome.result.warnings.push("the change was saved but not recorded for undo");
    }
    if (outcome.result.ok && !READS.has(name)) await publishChange().catch(() => false);
    return outcome.result;
  } catch {
    const result = refusal("the dashboard could not save that");
    await store.audit({ tool: name, argsHash: argsHash(name, {}), result, undo: null, now }).catch(() => undefined);
    return result;
  }
}

async function dispatch(store: AgentStore, name: ToolName, args: unknown, now: Date, fetchImage: ImageFetch): Promise<Outcome> {
  if (name === "get_dashboard_state") return stateOf(store, now);
  if (name === "get_schema") return schemaOf();
  if (name === "upsert_card") return upsertCard(store, args, now, fetchImage);
  if (name === "delete_card") return deleteCard(store, args, now);
  if (name === "upsert_spotlight") return upsertSpotlight(store, args);
  if (name === "delete_spotlight") return deleteSpotlight(store, args, now);
  if (name === "set_recap") return setRecap(store, args, now);
  if (name === "set_priority") return setPriority(store, args, now);
  if (name === "get_inbox") return listInbox(store, args);
  if (name === "route_inbox_item") return routeInbox(store, args, now);
  if (name === "upsert_events") return upsertEvents(store, args);
  if (name === "upsert_task") return upsertTask(store, args);
  if (name === "delete_task") return deleteTask(store, args, now);
  if (name === "shopping_add") return addShopping(store, args);
  if (name === "shopping_check") return checkShopping(store, args);
  if (name === "shopping_delete") return deleteShopping(store, args, now);
  if (name === "upsert_message") return upsertMessage(store, args, now);
  if (name === "delete_message") return deleteMessage(store, args, now);
  if (name === "set_metric") return setMetric(store, args, now);
  if (name === "pin_view") return pinView(store, args, now);
  return undo(store, args, now);
}

async function stateOf(store: AgentStore, now: Date): Promise<Outcome> {
  const [views, people, cards, events, tasks, shopping, recaps, priorities, inbox, metrics, spotlights, messages] = await Promise.all([
    store.views(),
    store.people(),
    store.cards(),
    store.events(),
    store.tasks(),
    store.shopping(),
    store.recaps(),
    store.priorities(),
    store.inbox(),
    store.metrics(),
    store.spotlights(),
    store.messages(),
  ]);
  const parts = zonedParts(now);
  const start = zonedTimeToUtc({ ...parts, hour: 0, minute: 0 }).getTime();
  const end = endOfZonedDay(parts).getTime();
  const waiting = active(inbox).filter((item) => item.status !== "routed");
  return {
    undo: null,
    result: success(null, [], {
      state: {
        views,
        people,
        cards: active(cards).map(publicCard),
        spotlights: active(spotlights).map(publicSpotlight),
        tasks: active(tasks).map(publicTask),
        shopping: active(shopping).map(publicShopping),
        messages: active(messages).map(publicMessage),
        eventsToday: active(events).filter((event) => new Date(event.endsAt).getTime() > start && new Date(event.startsAt).getTime() < end),
        recap: liveRecap(recaps, now),
        priority: livePriority(priorities, now),
        inbox: waiting.slice(0, 50).map((item) => ({ id: item.id, text: item.text, status: item.status, receivedAt: item.receivedAt })),
        metrics: active(metrics).map((metric) => ({
          key: metric.key,
          value: metric.value,
          previous: metric.previous,
          source: metric.source,
          fetchedAt: metric.fetchedAt,
        })),
      },
    }),
  };
}

function schemaOf(): Outcome {
  let cards: unknown = null;
  try {
    cards = cardSchema.toJSONSchema();
  } catch {
    cards = null;
  }
  return {
    undo: null,
    result: success(null, [], {
      schema: {
        palette: ACCENT_CHOICES.filter((choice) => paletteTokenSchema.safeParse(choice.id).success),
        cards,
        momente: {
          viewId: "momente",
          labelRo: "Momente",
          replaces: "month / Lună",
          description:
            "TV spotlight countdowns. Countdown = whole calendar days until startsAt in Europe/Bucharest. 0 means azi. Past items are hidden. Empty Momente is skipped in rotation.",
          kinds: [
            { id: "trip", labelRo: "Călătorie" },
            { id: "competition", labelRo: "Competiție" },
            { id: "deadline", labelRo: "Termen" },
            { id: "other", labelRo: "Altele" },
          ],
          tools: {
            upsert_spotlight: {
              params: {
                externalId: "string, required, stable idempotency key",
                title: "string, required, Romanian titles ok",
                kind: "trip | competition | deadline | other (default other)",
                startsAt: "ISO date/time string, required",
                note: "optional string or null",
                pinned: "optional boolean — keep when more than 6 spotlights",
              },
              example: {
                externalId: "trip-ski-2027",
                title: "Vacanță la munte",
                kind: "trip",
                startsAt: "2027-01-12T08:00:00+02:00",
                note: "Plecare dimineața",
                pinned: true,
              },
            },
            delete_spotlight: {
              params: { id: "uuid optional", externalId: "string optional — pass one of them" },
              example: { externalId: "trip-ski-2027" },
            },
          },
          clearSamples:
            "Seeded sample external ids: spotlight-vacanta-sample, spotlight-deadline-sample. Call delete_spotlight on those to clear Cast samples.",
        },
        photos: {
          viewId: "vision",
          labelRo: "Victorii",
          tool: "upsert_card",
          description:
            "Attach a photo to a Victorii card by passing kind=photo and image_url. The server downloads the image over HTTPS into the private photos bucket and writes data.storagePath. Phone remote uploads still set storagePath the same way.",
          params: {
            externalId: "string, required, stable idempotency key",
            viewId: 'optional, defaults to "vision"',
            kind: '"photo"',
            title: "optional caption shown under the polaroid on TV",
            body: "optional",
            color: "optional palette token; photo frame uses paper styling on TV",
            data: { alt: "optional string, max 200" },
            expiresAt: "optional ISO date/time",
            image_url: "HTTPS URL, required to attach/replace the image. jpeg/png/webp/gif, max 5 MB. Non-images are refused.",
          },
          example: {
            externalId: "photo-vacanta-2026",
            viewId: "vision",
            kind: "photo",
            title: "Vacanță",
            image_url: "https://cdn.example/vacation.jpg",
            data: { alt: "Familie la munte" },
          },
          notes: [
            "Prefer https:// image_url. http:// top-level URLs are refused.",
            "image_url is only valid when kind is photo.",
            "Updating the same externalId with a new image_url replaces storagePath.",
            "Omitting image_url keeps the existing photo when the card already has one.",
          ],
        },
        home: {
          viewId: "home",
          labelRo: "Acasă",
          description:
            "TV post-it board mixing open tasks, grocery items, and family messages. Romanian text ok. Empty Acasă (no open tasks, no shopping, no messages) is skipped in rotation.",
          stickyColors: ["butter", "peach", "mint", "sky", "rose", "lemon"],
          tools: {
            upsert_task: {
              params: {
                externalId: "string, required, stable idempotency key",
                text: "string, required, ≤500",
                done: "optional boolean — mark complete",
                assignee: "optional person id or name, or null",
                dueDate: "optional YYYY-MM-DD or null",
              },
              example: {
                externalId: "task-easybox",
                text: "Ridică pachetul de la easybox",
                assignee: "Alex",
                dueDate: "2026-11-09",
                done: false,
              },
            },
            delete_task: {
              params: { id: "uuid optional", externalId: "string optional — pass one of them" },
              example: { externalId: "task-easybox" },
            },
            shopping_add: {
              params: {
                items:
                  "array 1–40 of { text, qty?, unit?, category?, externalId? }. Duplicates merge by externalId or normalized name; qty is not re-added.",
              },
              example: {
                items: [{ text: "Lapte", qty: 2, unit: "l", category: "Lactate", externalId: "shop-lapte" }],
              },
            },
            shopping_check: {
              params: { ids: "uuid[] from get_dashboard_state.shopping", checked: "boolean" },
              example: { ids: ["44444444-4444-4444-8444-444444444401"], checked: true },
            },
            shopping_delete: {
              params: { ids: "optional uuid[]", externalIds: "optional string[] — pass at least one list" },
              example: { externalIds: ["shop-lapte"] },
            },
            upsert_message: {
              params: {
                externalId: "string, required",
                text: "string, required, ≤280",
                author: "optional string or null (e.g. Mama)",
                color: "optional butter | peach | mint | sky | rose | lemon",
              },
              example: {
                externalId: "msg-cina",
                text: "Cina e la 19:00",
                author: "Alex",
                color: "peach",
              },
            },
            delete_message: {
              params: { id: "uuid optional", externalId: "string optional — pass one of them" },
              example: { externalId: "msg-cina" },
            },
          },
          clearSamples: "Seeded sample message external id: msg-welcome. Call delete_message to clear it.",
        },
        rules: [
          "A win or progress item needs evidence such as task:done:<id> or event:<id>.",
          "The same externalId updates the existing row, so a daily routine can run twice.",
          "A manual or locked row is left unchanged.",
          "A priority needs a reason and expires at the end of the day unless another time is given.",
          "Momente spotlights use upsert_spotlight / delete_spotlight. Day countdown is Bucharest calendar days, not hours.",
          "Victorii photo cards: kind=photo + image_url (HTTPS). Server stores into the private photos bucket.",
          "Acasă post-its: tasks via upsert_task/delete_task, groceries via shopping_add/shopping_check/shopping_delete, messages via upsert_message/delete_message.",
        ],
      },
    }),
  };
}

async function upsertCard(store: AgentStore, args: unknown, now: Date, fetchImage: ImageFetch): Promise<Outcome> {
  const input = read(cardInput, args);
  if (!input.ok) return input.outcome;
  const value = input.value;
  const viewId = value.viewId || "vision";
  const views = await store.views();
  if (!views.some((view) => view.id === viewId)) return no("that view does not exist");
  const cards = await store.cards();
  const existing = cards.find((card) => card.externalId === value.externalId) ?? null;
  const locked = handLock(existing, "card");
  if (locked) return no(locked);
  let data: Record<string, unknown> = value.data ? { ...value.data } : existing ? { ...existing.data } : {};
  if (value.kind === "countdown" && typeof data.target === "string") {
    const target = parseInstant(data.target);
    if (!target) return no("a countdown card needs data.target");
    data = { ...data, target };
  }
  if ((value.kind === "wins" || value.kind === "progress") && missingEvidence(value.kind, data)) {
    return no(value.kind === "wins" ? "a win needs evidence, for example task:done:<id>" : "progress needs evidence, for example task:done:<id>");
  }
  const warnings: string[] = [];
  if (value.image_url) {
    if (value.kind !== "photo") return no("image_url is only for a photo card");
    const https = httpsImageUrl(value.image_url);
    if (!https.ok) return no(https.reason);
    const image = await fetchImage(https.href);
    if (!image.ok) return no(image.reason);
    data = { ...data, storagePath: await store.saveImage(image.bytes, image.type) };
  }
  const spot = existing ? { col: existing.gridCol, row: existing.gridRow } : place(cards, viewId);
  if (!existing && occupied(cards, viewId, spot.col, spot.row)) warnings.push("the board is full, so the card overlaps another");
  const expiresAt = instantField(value.expiresAt, existing?.expiresAt ?? null);
  if (expiresAt === "bad") return no("expiresAt must be a date and time");
  const draft = {
    id: existing?.id ?? crypto.randomUUID(),
    viewId,
    kind: value.kind,
    title: value.title === undefined ? (existing?.title ?? null) : value.title || null,
    body: value.body === undefined ? (existing?.body ?? null) : value.body || null,
    color: value.color ?? existing?.color ?? KIND_COLOR[value.kind],
    tilt: existing?.tilt ?? 0,
    grid: { col: spot.col, row: spot.row, colSpan: existing?.gridColSpan ?? 1, rowSpan: existing?.gridRowSpan ?? 1 },
    expiresAt: expiresAt ?? undefined,
    pinned: existing?.pinned ?? false,
    source: "assistant" as const,
    locked: false,
    externalId: value.externalId,
    data,
  };
  const parsed = cardSchema.safeParse({
    ...draft,
    title: draft.title ?? undefined,
    body: draft.body ?? undefined,
  });
  if (!parsed.success) return no(explain(parsed.error));
  const card = parsed.data;
  const row: CardRecord = {
    id: card.id,
    viewId: card.viewId,
    kind: card.kind,
    title: card.title ?? null,
    body: card.body ?? null,
    color: card.color,
    tilt: card.tilt,
    gridCol: card.grid.col,
    gridRow: card.grid.row,
    gridColSpan: card.grid.colSpan,
    gridRowSpan: card.grid.rowSpan,
    expiresAt: card.expiresAt ?? null,
    pinned: card.pinned,
    source: "assistant",
    locked: false,
    externalId: card.externalId ?? value.externalId,
    data: card.data as Record<string, unknown>,
    deletedAt: null,
  };
  await store.putCard(row);
  return done(success(row.id, warnings), existing ? { cards: [copy(existing)] } : { drop: { cards: [row.id] } });
}

async function deleteCard(store: AgentStore, args: unknown, now: Date): Promise<Outcome> {
  const input = read(deleteInput, args);
  if (!input.ok) return input.outcome;
  if (!input.value.id && !input.value.externalId) return no("id or externalId is required");
  const cards = await store.cards();
  const existing = cards.find((card) => card.id === input.value.id || card.externalId === input.value.externalId) ?? null;
  if (!existing) return no("that card was not found");
  if (existing.deletedAt) return done(success(existing.id, ["already removed"]), null);
  const locked = handLock(existing, "card");
  if (locked) return no(locked);
  await store.putCard({ ...existing, deletedAt: now.toISOString() });
  return done(success(existing.id), { cards: [copy(existing)] });
}

async function upsertSpotlight(store: AgentStore, args: unknown): Promise<Outcome> {
  const input = read(spotlightInput, args);
  if (!input.ok) return input.outcome;
  const startsAt = parseInstant(input.value.startsAt);
  if (!startsAt) return no("startsAt must be a date and time");
  const rows = await store.spotlights();
  const existing = rows.find((row) => row.externalId === input.value.externalId) ?? null;
  const locked = handLock(existing, "spotlight");
  if (locked) return no(locked);
  const kind = (input.value.kind ?? existing?.kind ?? "other") as SpotlightKind;
  const row: SpotlightRecord = {
    id: existing?.id ?? crypto.randomUUID(),
    title: input.value.title,
    kind,
    startsAt,
    note: input.value.note === undefined ? (existing?.note ?? null) : input.value.note,
    pinned: input.value.pinned ?? existing?.pinned ?? false,
    source: "assistant",
    locked: false,
    externalId: input.value.externalId,
    deletedAt: null,
  };
  await store.putSpotlight(row);
  return done(success(row.id), existing ? { spotlights: [copy(existing)] } : { drop: { spotlights: [row.id] } });
}

async function deleteSpotlight(store: AgentStore, args: unknown, now: Date): Promise<Outcome> {
  const input = read(deleteInput, args);
  if (!input.ok) return input.outcome;
  if (!input.value.id && !input.value.externalId) return no("id or externalId is required");
  const rows = await store.spotlights();
  const existing = rows.find((row) => row.id === input.value.id || row.externalId === input.value.externalId) ?? null;
  if (!existing) return no("that spotlight was not found");
  if (existing.deletedAt) return done(success(existing.id, ["already removed"]), null);
  const locked = handLock(existing, "spotlight");
  if (locked) return no(locked);
  await store.putSpotlight({ ...existing, deletedAt: now.toISOString() });
  return done(success(existing.id), { spotlights: [copy(existing)] });
}

async function setRecap(store: AgentStore, args: unknown, now: Date): Promise<Outcome> {
  const input = read(recapInput, args);
  if (!input.ok) return input.outcome;
  const externalId = input.value.externalId || `recap-${bucharestDate(now)}`;
  const [recaps, cards, views] = await Promise.all([store.recaps(), store.cards(), store.views()]);
  if (!views.some((view) => view.id === "vision")) return no("that view does not exist");
  const existingRecap = recaps.find((recap) => recap.externalId === externalId) ?? null;
  const existingCard = cards.find((card) => card.externalId === externalId) ?? null;
  const recapLock = handLock(existingRecap, "recap");
  if (recapLock) return no(recapLock);
  const cardLock = handLock(existingCard, "card");
  if (cardLock) return no(cardLock);
  const expires = instantField(input.value.expiresAt, existingRecap?.expiresAt ?? endOfToday(now));
  if (expires === "bad" || !expires) return no("expiresAt must be a date and time");
  const warnings: string[] = [];
  const cardBody = input.value.text.slice(0, 500);
  if (input.value.text.length > 500) warnings.push("the card shows the first 500 characters");
  const recapId = existingRecap?.id ?? crypto.randomUUID();
  const recap: RecapRecord = {
    id: recapId,
    text: input.value.text,
    highlights: input.value.highlights ?? existingRecap?.highlights ?? [],
    expiresAt: expires,
    source: "assistant",
    locked: false,
    externalId,
    deletedAt: null,
    createdAt: existingRecap?.createdAt ?? now.toISOString(),
  };
  const spot = existingCard ? { col: existingCard.gridCol, row: existingCard.gridRow } : place(cards, "vision");
  const card: CardRecord = {
    id: existingCard?.id ?? crypto.randomUUID(),
    viewId: "vision",
    kind: "recap",
    title: existingCard?.title ?? "Azi",
    body: cardBody,
    color: existingCard?.color ?? "sky",
    tilt: existingCard?.tilt ?? 0,
    gridCol: spot.col,
    gridRow: spot.row,
    gridColSpan: existingCard?.gridColSpan ?? 1,
    gridRowSpan: existingCard?.gridRowSpan ?? 1,
    expiresAt: expires,
    pinned: existingCard?.pinned ?? false,
    source: "assistant",
    locked: false,
    externalId,
    data: { recapId },
    deletedAt: null,
  };
  const parsed = cardSchema.safeParse(toSchemaCard(card));
  if (!parsed.success) return no(explain(parsed.error));
  await store.putRecap(recap);
  await store.putCard(card);
  return done(success(recap.id, warnings), {
    recaps: existingRecap ? [copy(existingRecap)] : undefined,
    cards: existingCard ? [copy(existingCard)] : undefined,
    drop: {
      recaps: existingRecap ? undefined : [recap.id],
      cards: existingCard ? undefined : [card.id],
    },
  });
}

async function setPriority(store: AgentStore, args: unknown, now: Date): Promise<Outcome> {
  const input = read(priorityInput, args);
  if (!input.ok) return input.outcome;
  const rows = await store.priorities();
  const live = active(rows).filter((row) => new Date(row.expiresAt).getTime() > now.getTime());
  if (live.some((row) => row.locked || row.source === "manual")) return no("a manual priority is already set");
  const externalId = input.value.externalId || `priority-${bucharestDate(now)}`;
  const existing = rows.find((row) => row.externalId === externalId) ?? null;
  const locked = handLock(existing, "priority");
  if (locked) return no(locked);
  if (input.value.taskId) {
    const task = (await store.tasks()).find((item) => item.id === input.value.taskId && !item.deletedAt);
    if (!task) return no("that task was not found");
  }
  const dueAt = input.value.dueAt ? parseInstant(input.value.dueAt) : null;
  if (input.value.dueAt && !dueAt) return no("dueAt must be a date and time");
  const expires = instantField(input.value.expiresAt, endOfToday(now));
  if (expires === "bad" || !expires) return no("expiresAt must be a date and time");
  const previous: PriorityRecord[] = [];
  for (const row of live) {
    if (row.id === existing?.id) continue;
    if (row.source !== "assistant" || row.locked) continue;
    previous.push(copy(row));
    await store.putPriority({ ...row, deletedAt: now.toISOString() });
  }
  const id = existing?.id ?? crypto.randomUUID();
  if (existing) previous.push(copy(existing));
  const warnings = new Date(expires).getTime() <= now.getTime() ? ["that priority is already expired"] : [];
  await store.putPriority({
    id,
    text: input.value.text,
    reason: input.value.reason,
    dueAt,
    taskId: input.value.taskId ?? null,
    expiresAt: expires,
    source: "assistant",
    locked: false,
    externalId,
    deletedAt: null,
    updatedAt: now.toISOString(),
  });
  return done(success(id, warnings), {
    priorities: previous,
    drop: existing ? undefined : { priorities: [id] },
  });
}

async function listInbox(store: AgentStore, args: unknown): Promise<Outcome> {
  const input = read(inboxInput, args);
  if (!input.ok) return input.outcome;
  const status = input.value.status;
  const items = active(await store.inbox())
    .filter((item) => (status ? item.status === status : item.status !== "routed"))
    .slice(0, 50)
    .map((item) => ({ id: item.id, text: item.text, status: item.status, receivedAt: item.receivedAt, routedTo: item.routedTo }));
  return { undo: null, result: success(null, [], { items }) };
}

async function routeInbox(store: AgentStore, args: unknown, now: Date): Promise<Outcome> {
  const input = read(routeInput, args);
  if (!input.ok) return input.outcome;
  const rows = await store.inbox();
  const item = rows.find((row) => row.id === input.value.id && !row.deletedAt);
  if (!item) return no("inbox item was not found");
  if (item.status === "routed" && item.routedTo) return done(success(item.routedTo.id, ["already routed"], { status: "routed" }), null);
  if (input.value.status === "needs_review" || input.value.destination === "review") {
    await store.putInbox({ ...item, status: "needs_review", routedTo: null });
    return done(success(item.id, [], { status: "needs_review" }), { inbox: [copy(item)] });
  }
  const fields = input.value.fields ?? {};
  const text = fields.text || item.text;
  const appointment = appointmentOf(text, fields, now);
  const destination = input.value.destination ?? (appointment ? "event" : "task");
  if (destination === "event" && !appointment) {
    await store.putInbox({ ...item, status: "needs_review", routedTo: null });
    return done(success(item.id, ["no date and time, left as needs review"], { status: "needs_review" }), { inbox: [copy(item)] });
  }
  const externalId = `inbox-${item.id}`;
  const people = await store.people();
  const warnings: string[] = [];
  let routed: { type: string; id: string } | null = null;
  let undo: UndoBody = { inbox: [copy(item)] };
  if (destination === "task") {
    const saved = await saveTask(store, { externalId, text, done: fields.done ?? false, assignee: fields.assignee, dueDate: fields.dueDate ?? null }, people);
    if (!saved.ok) return saved.outcome;
    routed = { type: "task", id: saved.id };
    undo = mergeUndo(undo, saved.undo);
    warnings.push(...saved.warnings);
  } else if (destination === "shopping") {
    const saved = await saveShopping(store, { text: text.slice(0, 200), qty: fields.qty, unit: fields.unit, category: fields.category, externalId });
    if (!saved.ok) return saved.outcome;
    routed = { type: "shopping", id: saved.id };
    undo = mergeUndo(undo, saved.undo);
    warnings.push(...saved.warnings);
  } else if (destination === "event" && appointment) {
    const saved = await saveEvent(store, {
      externalId,
      title: (fields.title || text).slice(0, 200),
      start: appointment.start,
      end: fields.end ? parseInstant(fields.end) ?? appointment.end : appointment.end,
      allDay: fields.allDay ?? false,
      person: fields.person,
    }, people);
    if (!saved.ok) return saved.outcome;
    routed = { type: "event", id: saved.id };
    undo = mergeUndo(undo, saved.undo);
    warnings.push(...saved.warnings);
  } else if (destination === "idea") {
    const saved = await saveIdea(store, externalId, text, fields.tags ?? []);
    if (!saved.ok) return saved.outcome;
    routed = { type: "idea", id: saved.id };
    undo = mergeUndo(undo, saved.undo);
    warnings.push(...saved.warnings);
  } else if (destination === "note") {
    const saved = await saveNote(store, externalId, fields.title ?? null, text);
    if (!saved.ok) return saved.outcome;
    routed = { type: "note", id: saved.id };
    undo = mergeUndo(undo, saved.undo);
    warnings.push(...saved.warnings);
  }
  if (!routed) {
    await store.putInbox({ ...item, status: "needs_review", routedTo: null });
    return done(success(item.id, ["left as needs review"], { status: "needs_review" }), { inbox: [copy(item)] });
  }
  await store.putInbox({ ...item, status: "routed", routedTo: routed });
  return done(success(routed.id, warnings, { status: "routed" }), undo);
}

async function upsertEvents(store: AgentStore, args: unknown): Promise<Outcome> {
  const input = read(eventsInput, args);
  if (!input.ok) return input.outcome;
  const people = await store.people();
  const warnings: string[] = [];
  let first: string | null = null;
  let undo: UndoBody = {};
  for (const event of input.value.events) {
    const saved = await saveEvent(store, { ...event, allDay: event.allDay ?? false, start: event.start, end: event.end }, people);
    if (!saved.ok) {
      warnings.push(`${event.title}: ${saved.outcome.result.reason ?? "that event was not saved"}`);
      continue;
    }
    warnings.push(...saved.warnings.map((warning) => `${event.title}: ${warning}`));
    first ??= saved.id;
    undo = mergeUndo(undo, saved.undo);
  }
  if (!first) return no(warnings[0] ?? "nothing was changed");
  return done(success(first, warnings), undo);
}

async function upsertTask(store: AgentStore, args: unknown): Promise<Outcome> {
  const input = read(taskInput, args);
  if (!input.ok) return input.outcome;
  const saved = await saveTask(store, { ...input.value, done: input.value.done, dueDate: input.value.dueDate }, await store.people());
  if (!saved.ok) return saved.outcome;
  return done(success(saved.id, saved.warnings), saved.undo);
}

async function deleteTask(store: AgentStore, args: unknown, now: Date): Promise<Outcome> {
  const input = read(deleteInput, args);
  if (!input.ok) return input.outcome;
  if (!input.value.id && !input.value.externalId) return no("id or externalId is required");
  const rows = await store.tasks();
  const existing = rows.find((row) => row.id === input.value.id || row.externalId === input.value.externalId) ?? null;
  if (!existing) return no("that task was not found");
  if (existing.deletedAt) return done(success(existing.id, ["already removed"]), null);
  const locked = handLock(existing, "task");
  if (locked) return no(locked);
  await store.putTask({ ...existing, deletedAt: now.toISOString() });
  return done(success(existing.id), { tasks: [copy(existing)] });
}

async function addShopping(store: AgentStore, args: unknown): Promise<Outcome> {
  const input = read(shoppingInput, args);
  if (!input.ok) return input.outcome;
  const warnings: string[] = [];
  let first: string | null = null;
  let undo: UndoBody = {};
  for (const item of input.value.items) {
    const key = textKey(item.text);
    if (!key) {
      warnings.push("that item needs a name");
      continue;
    }
    const saved = await saveShopping(store, { ...item, externalId: item.externalId || `shop-${key}` });
    if (!saved.ok) {
      warnings.push(saved.outcome.result.reason ?? "that item was not saved");
      continue;
    }
    warnings.push(...saved.warnings);
    first ??= saved.id;
    undo = mergeUndo(undo, saved.undo);
  }
  if (!first) return no(warnings[0] ?? "nothing was changed");
  return done(success(first, warnings), undo);
}

async function checkShopping(store: AgentStore, args: unknown): Promise<Outcome> {
  const input = read(checkInput, args);
  if (!input.ok) return input.outcome;
  const rows = await store.shopping();
  const warnings: string[] = [];
  const previous: ShoppingRecord[] = [];
  let first: string | null = null;
  for (const id of input.value.ids) {
    const existing = rows.find((row) => row.id === id && !row.deletedAt);
    if (!existing) {
      warnings.push("a shopping item was not found");
      continue;
    }
    const locked = handLock(existing, "shopping item");
    if (locked) {
      warnings.push(locked);
      continue;
    }
    if (existing.checked === input.value.checked) {
      first ??= existing.id;
      continue;
    }
    previous.push(copy(existing));
    await store.putShopping({ ...existing, checked: input.value.checked });
    first ??= existing.id;
  }
  if (!first) return no(warnings[0] ?? "nothing was changed");
  return done(success(first, warnings), previous.length ? { shopping: previous } : null);
}

async function deleteShopping(store: AgentStore, args: unknown, now: Date): Promise<Outcome> {
  const input = read(shoppingDeleteInput, args);
  if (!input.ok) return input.outcome;
  const ids = input.value.ids ?? [];
  const externalIds = input.value.externalIds ?? [];
  if (ids.length === 0 && externalIds.length === 0) return no("ids or externalIds is required");
  const rows = await store.shopping();
  const warnings: string[] = [];
  const previous: ShoppingRecord[] = [];
  let first: string | null = null;
  const wanted = new Set([...ids, ...externalIds]);
  for (const existing of rows) {
    if (existing.deletedAt) continue;
    if (!wanted.has(existing.id) && !(existing.externalId && wanted.has(existing.externalId))) continue;
    const locked = handLock(existing, "shopping item");
    if (locked) {
      warnings.push(locked);
      continue;
    }
    previous.push(copy(existing));
    await store.putShopping({ ...existing, deletedAt: now.toISOString() });
    first ??= existing.id;
  }
  if (!first) return no(warnings[0] ?? "nothing was changed");
  return done(success(first, warnings), { shopping: previous });
}

async function upsertMessage(store: AgentStore, args: unknown, now: Date): Promise<Outcome> {
  const input = read(messageInput, args);
  if (!input.ok) return input.outcome;
  const rows = await store.messages();
  const existing = rows.find((row) => row.externalId === input.value.externalId) ?? null;
  const locked = handLock(existing, "message");
  if (locked) return no(locked);
  const color = (input.value.color ?? existing?.color ?? pickMessageColor(input.value.externalId)) as MessageColor;
  const row: MessageRecord = {
    id: existing?.id ?? crypto.randomUUID(),
    text: input.value.text,
    author: input.value.author === undefined ? (existing?.author ?? null) : input.value.author,
    color,
    source: "assistant",
    locked: false,
    externalId: input.value.externalId,
    deletedAt: null,
    createdAt: existing?.createdAt ?? now.toISOString(),
  };
  await store.putMessage(row);
  return done(success(row.id), existing ? { messages: [copy(existing)] } : { drop: { messages: [row.id] } });
}

async function deleteMessage(store: AgentStore, args: unknown, now: Date): Promise<Outcome> {
  const input = read(deleteInput, args);
  if (!input.ok) return input.outcome;
  if (!input.value.id && !input.value.externalId) return no("id or externalId is required");
  const rows = await store.messages();
  const existing = rows.find((row) => row.id === input.value.id || row.externalId === input.value.externalId) ?? null;
  if (!existing) return no("that message was not found");
  if (existing.deletedAt) return done(success(existing.id, ["already removed"]), null);
  const locked = handLock(existing, "message");
  if (locked) return no(locked);
  await store.putMessage({ ...existing, deletedAt: now.toISOString() });
  return done(success(existing.id), { messages: [copy(existing)] });
}

async function setMetric(store: AgentStore, args: unknown, now: Date): Promise<Outcome> {
  const input = read(metricInput, args);
  if (!input.ok) return input.outcome;
  const key = input.value.key.toLowerCase();
  const rows = await store.metrics();
  const existing = rows.find((row) => row.key === key && !row.deletedAt) ?? rows.find((row) => row.key === key) ?? null;
  const locked = handLock(existing, "metric");
  if (locked) return no(locked);
  const id = existing?.id ?? crypto.randomUUID();
  await store.putMetric({
    id,
    key,
    value: input.value.value,
    previous: input.value.previous === undefined ? (existing && !existing.deletedAt ? existing.previous : null) : input.value.previous,
    fetchedAt: now.toISOString(),
    source: "assistant",
    externalId: existing?.externalId ?? `metric-${key.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
    deletedAt: null,
  });
  return done(success(id), existing ? { metrics: [copy(existing)] } : { drop: { metrics: [id] } });
}

async function pinView(store: AgentStore, args: unknown, now: Date): Promise<Outcome> {
  const input = read(pinInput, args);
  if (!input.ok) return input.outcome;
  if (!input.value.viewId && !input.value.cardId) return no("viewId or cardId is required");
  const current = await store.control();
  if (holding(current, now)) return no("the phone is holding the screen");
  const views = await store.views();
  let viewId = input.value.viewId ?? "";
  const warnings: string[] = [];
  if (!viewId && input.value.cardId) {
    const card = (await store.cards()).find((item) => item.id === input.value.cardId && !item.deletedAt);
    if (!card) return no("that card was not found");
    viewId = card.viewId;
  } else if (input.value.cardId) warnings.push("viewId was used");
  if (!views.some((view) => view.id === viewId)) return no("that view does not exist");
  const minutes = input.value.minutes ?? 10;
  const next: DisplayControl = {
    mode: "pinned",
    viewId: viewId as DisplayControl["viewId"],
    pinnedUntil: new Date(now.getTime() + minutes * 60_000).toISOString(),
    dimmed: current.dimmed,
  };
  await store.putControl(next);
  return done(success(viewId, warnings), { control: current, expectControl: next });
}

async function undo(store: AgentStore, args: unknown, now: Date): Promise<Outcome> {
  const input = read(undoInput, args);
  if (!input.ok) return input.outcome;
  const rows = await store.recentUndoable();
  const chosen = input.value.id ? rows.find((row) => row.id === input.value.id) : rows.find((row) => !row.undoneAt);
  if (!chosen) return no(input.value.id ? "that write is outside the last 50" : "nothing to undo");
  if (chosen.undoneAt) return no("that write was already undone");
  if (!chosen.undo) return no("nothing to undo");
  const kept = await handKeeps(store, chosen.undo);
  if (kept) return no(kept);
  await store.applyUndo(chosen.undo, now);
  await store.markUndone(chosen.id, now);
  return done(success(chosen.id), null);
}

type Saved =
  | { ok: true; id: string; warnings: string[]; undo: UndoBody }
  | { ok: false; outcome: Outcome };

async function saveTask(
  store: AgentStore,
  input: { externalId: string; text: string; done?: boolean; assignee?: string | null; dueDate?: string | null },
  people: PersonRow[],
): Promise<Saved> {
  const rows = await store.tasks();
  const existing = rows.find((row) => row.externalId === input.externalId) ?? null;
  const locked = handLock(existing, "task");
  if (locked) {
    if (existing) return { ok: true, id: existing.id, warnings: [locked], undo: {} };
    return { ok: false, outcome: no(locked) };
  }
  const warnings: string[] = [];
  const id = existing?.id ?? crypto.randomUUID();
  await store.putTask({
    id,
    text: input.text,
    done: input.done ?? existing?.done ?? false,
    assigneeId: input.assignee === undefined ? (existing?.assigneeId ?? null) : personOf(input.assignee, people, warnings),
    dueDate: input.dueDate === undefined ? (existing?.dueDate ?? null) : input.dueDate,
    source: "assistant",
    locked: false,
    externalId: input.externalId,
    deletedAt: null,
  });
  return { ok: true, id, warnings, undo: existing ? { tasks: [copy(existing)] } : { drop: { tasks: [id] } } };
}

async function saveShopping(
  store: AgentStore,
  input: { text: string; qty?: number; unit?: string | null; category?: string | null; externalId: string },
): Promise<Saved> {
  const rows = await store.shopping();
  const key = textKey(input.text);
  const live = active(rows);
  const existing =
    live.find((row) => row.externalId === input.externalId) ??
    live.find((row) => textKey(row.text) === key) ??
    rows.find((row) => row.externalId === input.externalId) ??
    null;
  const locked = handLock(existing, "shopping item");
  if (locked) {
    if (existing) return { ok: true, id: existing.id, warnings: [locked], undo: {} };
    return { ok: false, outcome: no(locked) };
  }
  const id = existing?.id ?? crypto.randomUUID();
  await store.putShopping({
    id,
    text: input.text,
    qty: input.qty ?? existing?.qty ?? 1,
    unit: input.unit === undefined ? (existing?.unit ?? null) : input.unit,
    category: input.category === undefined ? (existing?.category ?? null) : input.category,
    checked: existing?.checked ?? false,
    source: "assistant",
    locked: false,
    externalId: existing?.externalId ?? input.externalId,
    deletedAt: null,
  });
  return { ok: true, id, warnings: [], undo: existing ? { shopping: [copy(existing)] } : { drop: { shopping: [id] } } };
}

async function saveEvent(
  store: AgentStore,
  input: { externalId: string; title: string; start: string; end: string; allDay: boolean; person?: string | null },
  people: PersonRow[],
): Promise<Saved> {
  const start = parseInstant(input.start);
  const end = parseInstant(input.end);
  if (!start || !end || new Date(end).getTime() < new Date(start).getTime()) {
    return { ok: false, outcome: no("start and end must be a date and time") };
  }
  const rows = await store.events();
  const existing = rows.find((row) => row.externalId === input.externalId) ?? null;
  const locked = handLock(existing, "event");
  if (locked) {
    if (existing) return { ok: true, id: existing.id, warnings: [locked], undo: {} };
    return { ok: false, outcome: no(locked) };
  }
  const warnings: string[] = [];
  const id = existing?.id ?? crypto.randomUUID();
  await store.putEvent({
    id,
    title: input.title,
    startsAt: start,
    endsAt: end,
    allDay: input.allDay,
    personId: input.person === undefined ? (existing?.personId ?? null) : personOf(input.person, people, warnings),
    source: "assistant",
    locked: false,
    externalId: input.externalId,
    deletedAt: null,
  });
  return { ok: true, id, warnings, undo: existing ? { events: [copy(existing)] } : { drop: { events: [id] } } };
}

async function saveIdea(store: AgentStore, externalId: string, text: string, tags: string[]): Promise<Saved> {
  const rows = await store.ideas();
  const existing = rows.find((row) => row.externalId === externalId) ?? null;
  const locked = handLock(existing, "idea");
  if (locked) {
    if (existing) return { ok: true, id: existing.id, warnings: [locked], undo: {} };
    return { ok: false, outcome: no(locked) };
  }
  const id = existing?.id ?? crypto.randomUUID();
  await store.putIdea({
    id,
    text: text.slice(0, 500),
    tags,
    source: "assistant",
    locked: false,
    externalId,
    deletedAt: null,
  });
  return { ok: true, id, warnings: [], undo: existing ? { ideas: [copy(existing)] } : { drop: { ideas: [id] } } };
}

async function saveNote(store: AgentStore, externalId: string, title: string | null, text: string): Promise<Saved> {
  const cards = await store.cards();
  const existing = cards.find((card) => card.externalId === externalId) ?? null;
  const locked = handLock(existing, "card");
  if (locked) {
    if (existing) return { ok: true, id: existing.id, warnings: [locked], undo: {} };
    return { ok: false, outcome: no(locked) };
  }
  const spot = existing ? { col: existing.gridCol, row: existing.gridRow } : place(cards, "vision");
  const card: CardRecord = {
    id: existing?.id ?? crypto.randomUUID(),
    viewId: "vision",
    kind: "note",
    title,
    body: text.slice(0, 500),
    color: existing?.color ?? "mint",
    tilt: existing?.tilt ?? 0,
    gridCol: spot.col,
    gridRow: spot.row,
    gridColSpan: 1,
    gridRowSpan: 1,
    expiresAt: null,
    pinned: false,
    source: "assistant",
    locked: false,
    externalId,
    data: { text: text.slice(0, 500) },
    deletedAt: null,
  };
  const parsed = cardSchema.safeParse(toSchemaCard(card));
  if (!parsed.success) return { ok: false, outcome: no(explain(parsed.error)) };
  await store.putCard(card);
  return { ok: true, id: card.id, warnings: [], undo: existing ? { cards: [copy(existing)] } : { drop: { cards: [card.id] } } };
}

async function handKeeps(store: AgentStore, body: UndoBody): Promise<string | null> {
  if (body.expectControl) {
    const current = await store.control();
    if (!sameControl(current, body.expectControl)) return "the phone is holding the screen";
  }
  const checks: [Promise<{ id: string; source: Source; locked?: boolean }[]>, string[]][] = [
    [store.cards(), idsOf(body.cards, body.drop?.cards)],
    [store.events(), idsOf(body.events, body.drop?.events)],
    [store.tasks(), idsOf(body.tasks, body.drop?.tasks)],
    [store.shopping(), idsOf(body.shopping, body.drop?.shopping)],
    [store.recaps(), idsOf(body.recaps, body.drop?.recaps)],
    [store.priorities(), idsOf(body.priorities, body.drop?.priorities)],
    [store.ideas(), idsOf(body.ideas, body.drop?.ideas)],
    [store.metrics(), idsOf(body.metrics, body.drop?.metrics)],
    [store.spotlights(), idsOf(body.spotlights, body.drop?.spotlights)],
    [store.messages(), idsOf(body.messages, body.drop?.messages)],
  ];
  for (const [loaded, ids] of checks) {
    if (ids.length === 0) continue;
    const rows = await loaded;
    for (const id of ids) {
      const row = rows.find((item) => item.id === id);
      if (row && (row.locked || row.source !== "assistant")) return "a manual edit is keeping this";
    }
  }
  return null;
}

function idsOf(rows: { id: string }[] | undefined, drop: string[] | undefined): string[] {
  return [...(rows ?? []).map((row) => row.id), ...(drop ?? [])];
}

function appointmentOf(
  text: string,
  fields: { start?: string; end?: string },
  now: Date,
): { start: string; end: string } | null {
  if (fields.start) {
    const start = parseInstant(fields.start);
    if (!start) return null;
    const end = fields.end ? parseInstant(fields.end) : new Date(new Date(start).getTime() + 60 * 60 * 1000).toISOString();
    return end ? { start, end } : null;
  }
  return findAppointment(text, now);
}

function personOf(value: string | null, people: PersonRow[], warnings: string[]): string | null {
  if (!value) return null;
  const needle = value.trim().toLowerCase();
  const found = people.find((person) => person.id.toLowerCase() === needle || person.name.toLowerCase() === needle);
  if (!found) {
    warnings.push(`person "${value}" was not found`);
    return null;
  }
  return found.id;
}

function handLock(row: { source: Source; locked?: boolean } | null, noun: string): string | null {
  if (!row) return null;
  if (row.source === "integration") return `${noun} comes from an integration and cannot be changed here`;
  if (row.locked || row.source !== "assistant") return `${noun} is locked by a manual edit`;
  return null;
}

function holding(control: DisplayControl, now: Date): boolean {
  if (control.mode === "locked" || control.mode === "paused") return true;
  if (control.mode === "pinned" && control.pinnedUntil && new Date(control.pinnedUntil).getTime() > now.getTime()) return true;
  return false;
}

function sameControl(left: DisplayControl, right: DisplayControl): boolean {
  return left.mode === right.mode && left.viewId === right.viewId && left.pinnedUntil === right.pinnedUntil && left.dimmed === right.dimmed;
}

function place(cards: CardRecord[], viewId: string): { col: number; row: number } {
  const taken = new Set(active(cards).filter((card) => card.viewId === viewId).map((card) => `${card.gridCol},${card.gridRow}`));
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      if (!taken.has(`${col},${row}`)) return { col, row };
    }
  }
  return { col: 0, row: 0 };
}

function occupied(cards: CardRecord[], viewId: string, col: number, row: number): boolean {
  return active(cards).some((card) => card.viewId === viewId && card.gridCol === col && card.gridRow === row);
}

function missingEvidence(kind: "wins" | "progress", data: Record<string, unknown>): boolean {
  if (kind === "progress") return typeof data.evidence !== "string" || data.evidence.trim() === "";
  if (!Array.isArray(data.items)) return true;
  return data.items.some((item) => {
    if (!item || typeof item !== "object") return true;
    const evidence = (item as { evidence?: unknown }).evidence;
    return typeof evidence !== "string" || evidence.trim() === "";
  });
}

function instantField(value: string | undefined, fallback: string | null): string | null | "bad" {
  if (value === undefined) return fallback;
  if (!value) return null;
  return parseInstant(value) ?? "bad";
}

function liveRecap(rows: RecapRecord[], now: Date): { id: string; text: string; highlights: string[]; expiresAt: string | null } | null {
  const live = active(rows)
    .filter((row) => !row.expiresAt || new Date(row.expiresAt).getTime() > now.getTime())
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const row = live[0];
  if (!row) return null;
  return { id: row.id, text: row.text, highlights: row.highlights, expiresAt: row.expiresAt };
}

function livePriority(rows: PriorityRecord[], now: Date): { id: string; text: string; reason: string; source: Source; locked: boolean; expiresAt: string } | null {
  const live = active(rows)
    .filter((row) => new Date(row.expiresAt).getTime() > now.getTime())
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const row = live.find((item) => item.locked || item.source === "manual") ?? live[0];
  if (!row) return null;
  return { id: row.id, text: row.text, reason: row.reason, source: row.source, locked: row.locked, expiresAt: row.expiresAt };
}

function publicCard(card: CardRecord) {
  return {
    id: card.id,
    externalId: card.externalId,
    viewId: card.viewId,
    kind: card.kind,
    title: card.title,
    body: card.body,
    color: card.color,
    source: card.source,
    locked: card.locked,
    expiresAt: card.expiresAt,
    data: card.data,
  };
}

function publicSpotlight(row: SpotlightRecord) {
  return {
    id: row.id,
    externalId: row.externalId,
    title: row.title,
    kind: row.kind,
    startsAt: row.startsAt,
    note: row.note,
    pinned: row.pinned,
    source: row.source,
    locked: row.locked,
  };
}

function publicTask(task: TaskRecord) {
  return {
    id: task.id,
    externalId: task.externalId,
    text: task.text,
    done: task.done,
    assigneeId: task.assigneeId,
    dueDate: task.dueDate,
    source: task.source,
    locked: task.locked,
  };
}

function publicShopping(item: ShoppingRecord) {
  return {
    id: item.id,
    externalId: item.externalId,
    text: item.text,
    qty: item.qty,
    unit: item.unit,
    category: item.category,
    checked: item.checked,
    source: item.source,
    locked: item.locked,
  };
}

function publicMessage(row: MessageRecord) {
  return {
    id: row.id,
    externalId: row.externalId,
    text: row.text,
    author: row.author,
    color: row.color,
    source: row.source,
    locked: row.locked,
    createdAt: row.createdAt,
  };
}

function pickMessageColor(seed: string): MessageColor {
  const colors: MessageColor[] = ["butter", "peach", "mint", "sky", "rose", "lemon"];
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) hash = (hash * 31 + seed.charCodeAt(index)) | 0;
  return colors[Math.abs(hash) % colors.length] ?? "butter";
}

function toSchemaCard(card: CardRecord) {
  return {
    id: card.id,
    viewId: card.viewId,
    kind: card.kind,
    title: card.title ?? undefined,
    body: card.body ?? undefined,
    color: card.color,
    tilt: card.tilt,
    grid: { col: card.gridCol, row: card.gridRow, colSpan: card.gridColSpan, rowSpan: card.gridRowSpan },
    expiresAt: card.expiresAt ?? undefined,
    pinned: card.pinned,
    source: card.source,
    locked: card.locked,
    externalId: card.externalId ?? undefined,
    data: card.data,
  };
}

function mergeUndo(left: UndoBody, right: UndoBody): UndoBody {
  const drop = { ...left.drop };
  for (const [key, ids] of Object.entries(right.drop ?? {}) as [keyof NonNullable<UndoBody["drop"]>, string[]][]) {
    drop[key] = [...(drop[key] ?? []), ...ids];
  }
  return {
    cards: [...(left.cards ?? []), ...(right.cards ?? [])],
    events: [...(left.events ?? []), ...(right.events ?? [])],
    tasks: [...(left.tasks ?? []), ...(right.tasks ?? [])],
    shopping: [...(left.shopping ?? []), ...(right.shopping ?? [])],
    recaps: [...(left.recaps ?? []), ...(right.recaps ?? [])],
    priorities: [...(left.priorities ?? []), ...(right.priorities ?? [])],
    inbox: [...(left.inbox ?? []), ...(right.inbox ?? [])],
    ideas: [...(left.ideas ?? []), ...(right.ideas ?? [])],
    metrics: [...(left.metrics ?? []), ...(right.metrics ?? [])],
    spotlights: [...(left.spotlights ?? []), ...(right.spotlights ?? [])],
    messages: [...(left.messages ?? []), ...(right.messages ?? [])],
    drop: Object.values(drop).some((ids) => ids && ids.length > 0) ? drop : undefined,
    control: right.control ?? left.control,
    expectControl: right.expectControl ?? left.expectControl,
  };
}

function read<T>(schema: z.ZodType<T>, args: unknown): { ok: true; value: T } | { ok: false; outcome: Outcome } {
  const parsed = schema.safeParse(args);
  if (!parsed.success) return { ok: false, outcome: no(explain(parsed.error)) };
  return { ok: true, value: parsed.data };
}

function explain(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "that input is not valid";
  if (issue.path.join(".").includes("evidence")) return "a win needs evidence, for example task:done:<id>";
  if (issue.message && !issue.message.startsWith("Invalid") && !issue.message.includes("expected")) return issue.message;
  const path = issue.path.join(".");
  if (path.endsWith("word")) return "a word card needs data.word";
  if (path.endsWith("target")) return "a countdown card needs data.target";
  return path ? `${path}: ${issue.message}` : issue.message;
}

function scrub(value: unknown): unknown {
  if (typeof value === "string") return plainText(value);
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === "object") {
    const next: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) next[key] = scrub(child);
    return next;
  }
  return value;
}


function httpsImageUrl(value: string): { ok: true; href: string } | { ok: false; reason: string } {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false, reason: "image_url must be a public https URL" };
  }
  if (parsed.protocol !== "https:") return { ok: false, reason: "image_url must be a public https URL" };
  return { ok: true, href: parsed.toString() };
}

function no(reason: string): Outcome {
  return { result: refusal(reason), undo: null };
}

function done(result: ToolResult, undo: UndoBody | null): Outcome {
  if (
    undo &&
    !undo.cards?.length &&
    !undo.events?.length &&
    !undo.tasks?.length &&
    !undo.shopping?.length &&
    !undo.recaps?.length &&
    !undo.priorities?.length &&
    !undo.inbox?.length &&
    !undo.ideas?.length &&
    !undo.metrics?.length &&
    !undo.spotlights?.length &&
    !undo.messages?.length &&
    !undo.drop &&
    !undo.control
  ) {
    return { result, undo: null };
  }
  return { result, undo };
}
