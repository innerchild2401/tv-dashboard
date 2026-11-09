import { z } from "zod";
import type { AuditSummary } from "@/lib/agent/model";
import { ro } from "@/i18n/ro";

export const SILENT_AFTER_MS = 5 * 60 * 1000;
export const LOG_LIMIT = 80;

export const RECEIVERS = ["idle", "backdrop", "dashboard", "other", "unknown"] as const;
export type Receiver = (typeof RECEIVERS)[number];

export const COMMANDS = ["cast_now", "release", "restart_service"] as const;
export type CommandKind = (typeof COMMANDS)[number];

const READS = new Set(["get_dashboard_state", "get_schema", "get_view_design", "get_inbox", "undo"]);

const heartbeatSchema = z.object({
  receiver: z.enum(RECEIVERS),
  app: z.string().trim().max(80).nullable().optional(),
  appId: z.string().trim().max(80).nullable().optional(),
  lastCastAt: z.string().datetime({ offset: true }).nullable().optional(),
  uptimeSeconds: z.number().int().nonnegative().max(366 * 24 * 3600),
  localIp: z.string().trim().max(64).nullable().optional(),
  version: z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9._-]+$/),
  log: z.array(z.string().max(300)).max(20).optional(),
});

export type HeartbeatInput = z.infer<typeof heartbeatSchema>;

export type PiSnapshot = {
  receiver: Receiver;
  app: string | null;
  appId: string | null;
  lastCastAt: string | null;
  uptimeSeconds: number | null;
  localIp: string | null;
  version: string | null;
  heartbeatAt: string | null;
};

export type LogLine = { at: string; line: string };

export type QueuedCommand = { id: string; kind: CommandKind; minutes: number | null };

export type SystemWrite = {
  id: string;
  tool: string;
  label: string;
  at: string;
  ok: boolean;
  reason: string | null;
  undone: boolean;
  canUndo: boolean;
};

export type SystemView = {
  ok: true;
  alert: boolean;
  alertText: string | null;
  heartbeat: {
    at: string;
    ageSeconds: number;
    ago: string | null;
    receiver: Receiver;
    receiverLabel: string;
    app: string | null;
    uptimeSeconds: number | null;
    localIp: string | null;
    version: string | null;
  } | null;
  lastCastAt: string | null;
  writes: SystemWrite[];
  log: LogLine[];
};

export function parseHeartbeat(body: unknown): HeartbeatInput | null {
  const parsed = heartbeatSchema.safeParse(body);
  return parsed.success ? parsed.data : null;
}

export function parseCommand(body: unknown): { kind: CommandKind; minutes: number | null } | null {
  if (!body || typeof body !== "object") return null;
  const record = body as { command?: unknown; minutes?: unknown };
  if (record.command !== "cast_now" && record.command !== "release" && record.command !== "restart_service") return null;
  if (record.command === "release") {
    const minutes = typeof record.minutes === "number" ? record.minutes : Number(record.minutes);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 240) return null;
    return { kind: "release", minutes };
  }
  return { kind: record.command, minutes: null };
}

export function cleanIp(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(trimmed)) {
    const parts = trimmed.split(".").map(Number);
    if (parts.every((part) => part >= 0 && part <= 255)) return trimmed;
  }
  if (trimmed.includes(":") && /^[0-9a-f:]+$/i.test(trimmed) && trimmed.length <= 45) return trimmed;
  return null;
}

export function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

export function redactLine(line: string): string {
  const cleaned = line
    .replace(/[^\P{C}\n\t]/gu, "")
    .replace(/([?&]token=)[^&\s]+/gi, "$1redacted")
    .replace(/\bBearer\s+\S+/gi, "Bearer redacted")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, 300);
}

export function heartbeatAlert(seenAt: string | null, now: Date): { silent: boolean; text: string | null } {
  if (!seenAt) return { silent: true, text: ro.remote.piNever };
  const age = now.getTime() - new Date(seenAt).getTime();
  if (!Number.isFinite(age) || age >= SILENT_AFTER_MS) return { silent: true, text: ro.remote.piSilent };
  return { silent: false, text: null };
}

export function seenAgo(seconds: number | null): string | null {
  if (seconds === null || seconds < 0) return null;
  if (seconds < 45) return ro.remote.justNow;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.round(minutes / 60)} h`;
}

export function receiverLabel(receiver: Receiver): string {
  if (receiver === "idle") return ro.remote.receiverIdle;
  if (receiver === "backdrop") return ro.remote.receiverBackdrop;
  if (receiver === "dashboard") return ro.remote.receiverDashboard;
  if (receiver === "other") return ro.remote.receiverOther;
  return ro.remote.receiverUnknown;
}

export function commandLabel(kind: CommandKind, minutes: number | null): string {
  if (kind === "cast_now") return ro.remote.commandCast;
  if (kind === "restart_service") return ro.remote.commandRestart;
  return `${ro.remote.commandRelease} ${minutes ?? 30} min`;
}

export function buildSystemView(input: {
  now: Date;
  status: PiSnapshot | null;
  log: LogLine[];
  audits: AuditSummary[];
}): SystemView {
  const seenAt = input.status?.heartbeatAt ?? null;
  const alert = heartbeatAlert(seenAt, input.now);
  const ageMs = seenAt ? input.now.getTime() - new Date(seenAt).getTime() : null;
  const heartbeat =
    input.status && seenAt && ageMs !== null && Number.isFinite(ageMs)
      ? {
          at: seenAt,
          ageSeconds: Math.max(0, Math.round(ageMs / 1000)),
          ago: seenAgo(Math.max(0, ageMs / 1000)),
          receiver: input.status.receiver,
          receiverLabel: receiverLabel(input.status.receiver),
          app: input.status.app,
          uptimeSeconds: input.status.uptimeSeconds,
          localIp: input.status.localIp,
          version: input.status.version,
        }
      : null;
  const writes = input.audits
    .filter((row) => !READS.has(row.tool))
    .slice(0, 20)
    .map((row) => ({
      id: row.id,
      tool: row.tool,
      label: toolLabel(row.tool),
      at: row.createdAt,
      ok: row.ok,
      reason: row.reason,
      undone: row.undone,
      canUndo: row.canUndo,
    }));
  return {
    ok: true,
    alert: alert.silent,
    alertText: alert.text,
    heartbeat,
    lastCastAt: input.status?.lastCastAt ?? null,
    writes,
    log: input.log.slice(-40),
  };
}

function toolLabel(tool: string): string {
  if (tool in ro.remote.tools) return ro.remote.tools[tool as keyof typeof ro.remote.tools];
  return tool;
}
