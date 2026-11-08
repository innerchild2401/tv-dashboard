import type { ViewId } from "@/i18n/ro";

export type HoldMode = "rotate" | "paused" | "pinned" | "locked";

export type DisplayControl = {
  mode: HoldMode;
  viewId: ViewId | null;
  pinnedUntil: string | null;
  dimmed: boolean;
};

export const ROTATE_CONTROL: DisplayControl = {
  mode: "rotate",
  viewId: null,
  pinnedUntil: null,
  dimmed: false,
};

export type ControlAction =
  | { type: "next" | "previous" | "pause" | "resume" | "unlock" | "dim" | "undim" }
  | { type: "pin"; viewId?: ViewId; minutes?: number }
  | { type: "lock"; viewId?: ViewId };

type ViewRow = { id: ViewId; enabled: boolean; order: number; dwellSeconds: number };

export function activeHold(
  control: DisplayControl,
  now: Date,
  enabled: ViewId[],
): { mode: HoldMode; viewId: ViewId | null } {
  if (control.mode === "rotate" || !control.viewId || !enabled.includes(control.viewId)) {
    return { mode: "rotate", viewId: null };
  }
  if (control.mode === "pinned") {
    const until = control.pinnedUntil ? new Date(control.pinnedUntil).getTime() : 0;
    if (until <= now.getTime()) return { mode: "rotate", viewId: null };
  }
  return { mode: control.mode, viewId: control.viewId };
}

export function stepView(views: ViewRow[], current: ViewId, direction: 1 | -1): ViewId | null {
  const enabled = views.filter((view) => view.enabled).sort((left, right) => left.order - right.order);
  if (enabled.length === 0) return null;
  const index = enabled.findIndex((view) => view.id === current);
  const start = index < 0 ? 0 : index;
  const next = (start + direction + enabled.length) % enabled.length;
  return enabled[next]?.id ?? null;
}

export function applyControl(
  control: DisplayControl,
  action: ControlAction,
  ctx: { now: Date; currentView: ViewId; views: ViewRow[] },
): { ok: true; control: DisplayControl } | { ok: false; reason: "no-view" | "bad-view" | "bad-minutes" } {
  const enabled = ctx.views.filter((view) => view.enabled);
  if (enabled.length === 0) return { ok: false, reason: "no-view" };
  const dimmed = action.type === "dim" ? true : action.type === "undim" ? false : control.dimmed;

  if (action.type === "dim" || action.type === "undim") {
    return { ok: true, control: { ...control, dimmed } };
  }
  if (action.type === "resume" || action.type === "unlock") {
    return { ok: true, control: { mode: "rotate", viewId: null, pinnedUntil: null, dimmed } };
  }
  if (action.type === "pause") {
    return { ok: true, control: { mode: "paused", viewId: ctx.currentView, pinnedUntil: null, dimmed } };
  }

  if (action.type === "next" || action.type === "previous") {
    const target = stepView(ctx.views, ctx.currentView, action.type === "next" ? 1 : -1);
    if (!target) return { ok: false, reason: "no-view" };
    if (control.mode === "locked" || control.mode === "paused") {
      const still = activeHold(control, ctx.now, enabled.map((view) => view.id));
      if (still.mode === control.mode) {
        return { ok: true, control: { ...control, viewId: target, dimmed } };
      }
    }
    const dwell = ctx.views.find((view) => view.id === target)?.dwellSeconds ?? 120;
    return {
      ok: true,
      control: {
        mode: "pinned",
        viewId: target,
        pinnedUntil: new Date(ctx.now.getTime() + dwell * 1000).toISOString(),
        dimmed,
      },
    };
  }

  if (action.type !== "pin" && action.type !== "lock") return { ok: false, reason: "bad-view" };
  const requested = action.viewId ?? ctx.currentView;
  if (!enabled.some((view) => view.id === requested)) return { ok: false, reason: "bad-view" };
  if (action.type === "lock") {
    return { ok: true, control: { mode: "locked", viewId: requested, pinnedUntil: null, dimmed } };
  }
  const minutes = action.minutes ?? 10;
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 180) return { ok: false, reason: "bad-minutes" };
  return {
    ok: true,
    control: {
      mode: "pinned",
      viewId: requested,
      pinnedUntil: new Date(ctx.now.getTime() + minutes * 60_000).toISOString(),
      dimmed,
    },
  };
}
