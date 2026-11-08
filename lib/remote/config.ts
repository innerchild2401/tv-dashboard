import { ro, VIEW_IDS, type ViewId } from "@/i18n/ro";
import { configSchema } from "@/lib/schemas";
import type { DashboardConfig } from "@/lib/state/types";

export function parseConfig(input: unknown): { ok: true; config: DashboardConfig } | { ok: false; reason: string } {
  const parsed = configSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: ro.remote.invalid };
  const ids = parsed.data.views.map((view) => view.id);
  if (ids.length !== VIEW_IDS.length || VIEW_IDS.some((id) => !ids.includes(id))) {
    return { ok: false, reason: ro.remote.invalid };
  }
  if (!parsed.data.views.some((view) => view.enabled)) return { ok: false, reason: ro.remote.needView };
  const people = new Set<string>();
  for (const person of parsed.data.people) {
    if (people.has(person.id)) return { ok: false, reason: ro.remote.invalid };
    people.add(person.id);
  }
  if (parsed.data.people.length === 0) return { ok: false, reason: ro.remote.invalid };
  return { ok: true, config: parsed.data };
}

export function personSlug(name: string, taken: string[]): string {
  const base =
    name
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 20) || "om";
  let id = base;
  let suffix = 2;
  while (taken.includes(id)) {
    id = `${base}${suffix}`;
    suffix += 1;
  }
  return id;
}

export function isViewId(value: string): value is ViewId {
  return VIEW_IDS.includes(value as ViewId);
}
