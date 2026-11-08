import { ro } from "@/i18n/ro";
import { prioritySchema, shoppingItemSchema, taskSchema } from "@/lib/schemas";
import { plainText } from "@/lib/remote/text";

export type TaskWrite = {
  text: string;
  done: boolean;
  assigneeId: string | null;
  dueDate: string | null;
};

export type ShoppingWrite = {
  text: string;
  qty: number;
  unit: string | null;
  category: string | null;
  checked: boolean;
};

export function cleanTask(
  input: Partial<TaskWrite> & { text?: string },
  people: string[],
  base?: TaskWrite,
): { ok: true; value: TaskWrite } | { ok: false; reason: string } {
  const text = plainText(input.text ?? base?.text ?? "");
  const assigneeId = input.assigneeId === undefined ? (base?.assigneeId ?? null) : input.assigneeId;
  if (assigneeId && !people.includes(assigneeId)) return { ok: false, reason: ro.remote.invalid };
  const dueDate = input.dueDate === undefined ? (base?.dueDate ?? null) : input.dueDate;
  const parsed = taskSchema.safeParse({
    id: "11111111-1111-4111-8111-111111111111",
    text,
    done: input.done ?? base?.done ?? false,
    assigneeId,
    dueDate,
    source: "manual",
    locked: true,
  });
  if (!parsed.success) return { ok: false, reason: ro.remote.invalid };
  return {
    ok: true,
    value: {
      text: parsed.data.text,
      done: parsed.data.done,
      assigneeId: parsed.data.assigneeId,
      dueDate: parsed.data.dueDate,
    },
  };
}

export function cleanShopping(
  input: Partial<ShoppingWrite>,
  base?: ShoppingWrite,
): { ok: true; value: ShoppingWrite } | { ok: false; reason: string } {
  const unit = blankToNull(input.unit === undefined ? (base?.unit ?? null) : input.unit);
  const category = blankToNull(input.category === undefined ? (base?.category ?? null) : input.category);
  const parsed = shoppingItemSchema.safeParse({
    id: "44444444-4444-4444-8444-444444444401",
    text: plainText(input.text ?? base?.text ?? ""),
    qty: input.qty ?? base?.qty ?? 1,
    unit,
    category,
    checked: input.checked ?? base?.checked ?? false,
    source: "manual",
    locked: true,
  });
  if (!parsed.success) return { ok: false, reason: ro.remote.invalid };
  return {
    ok: true,
    value: {
      text: parsed.data.text,
      qty: parsed.data.qty,
      unit: parsed.data.unit,
      category: parsed.data.category,
      checked: parsed.data.checked,
    },
  };
}

export function cleanPriority(input: {
  text: string;
  reason: string;
  dueAt: string | null;
  expiresAt: string;
}): { ok: true; value: { text: string; reason: string; dueAt: string | null; expiresAt: string } } | { ok: false; reason: string } {
  const parsed = prioritySchema.safeParse({
    id: "77777777-7777-4777-8777-777777777777",
    text: plainText(input.text),
    reason: plainText(input.reason),
    dueAt: input.dueAt,
    taskId: null,
    expiresAt: input.expiresAt,
    source: "manual",
    locked: true,
  });
  if (!parsed.success) return { ok: false, reason: ro.remote.needReason };
  return {
    ok: true,
    value: {
      text: parsed.data.text,
      reason: parsed.data.reason,
      dueAt: parsed.data.dueAt,
      expiresAt: parsed.data.expiresAt,
    },
  };
}

export function taskBody(body: unknown): Partial<TaskWrite> {
  if (!body || typeof body !== "object") return {};
  const record = body as { text?: unknown; done?: unknown; assigneeId?: unknown; dueDate?: unknown };
  const next: Partial<TaskWrite> = {};
  if (typeof record.text === "string") next.text = record.text;
  if (typeof record.done === "boolean") next.done = record.done;
  if (record.assigneeId === null || typeof record.assigneeId === "string") next.assigneeId = record.assigneeId || null;
  if (record.dueDate === null || typeof record.dueDate === "string") next.dueDate = record.dueDate || null;
  return next;
}

export function shoppingBody(body: unknown): Partial<ShoppingWrite> {
  if (!body || typeof body !== "object") return {};
  const record = body as { text?: unknown; qty?: unknown; unit?: unknown; category?: unknown; checked?: unknown };
  const next: Partial<ShoppingWrite> = {};
  if (typeof record.text === "string") next.text = record.text;
  if (record.qty !== undefined) next.qty = Number(record.qty);
  if (record.unit === null || typeof record.unit === "string") next.unit = record.unit || null;
  if (record.category === null || typeof record.category === "string") next.category = record.category || null;
  if (typeof record.checked === "boolean") next.checked = record.checked;
  return next;
}

export function cleanInboxText(value: string): string | null {
  const text = plainText(value);
  if (!text || text.length > 500) return null;
  return text;
}

function blankToNull(value: string | null): string | null {
  if (!value) return null;
  const text = plainText(value);
  return text || null;
}
