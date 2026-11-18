import { LIVE_VIEW_ID, RESERVED_VIEW_IDS, VIEW_IDS, isCoreViewId, ro, type ViewId } from "@/i18n/ro";
import { configSchema } from "@/lib/schemas";
import type { DashboardConfig } from "@/lib/state/types";

export function parseConfig(input: unknown): { ok: true; config: DashboardConfig } | { ok: false; reason: string } {
  const parsed = configSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: ro.remote.invalid };
  const ids = parsed.data.views.map((view) => view.id);
  if (new Set(ids).size !== ids.length) return { ok: false, reason: ro.remote.invalid };
  if (VIEW_IDS.some((id) => !ids.includes(id))) return { ok: false, reason: ro.remote.invalid };
  if (ids.includes(LIVE_VIEW_ID)) return { ok: false, reason: ro.remote.invalid };
  const pageIds = new Set(parsed.data.pages.map((page) => page.id));
  if (pageIds.size !== parsed.data.pages.length) return { ok: false, reason: ro.remote.invalid };
  for (const page of parsed.data.pages) {
    if (RESERVED_VIEW_IDS.has(page.id)) return { ok: false, reason: ro.remote.invalid };
  }
  for (const view of parsed.data.views) {
    if (isCoreViewId(view.id)) continue;
    if (!pageIds.has(view.id)) return { ok: false, reason: ro.remote.invalid };
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
  return /^[a-z][a-z0-9-]{0,39}$/.test(value) && value !== LIVE_VIEW_ID;
}
