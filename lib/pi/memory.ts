import type { CommandKind, LogLine, PiSnapshot, QueuedCommand, Receiver } from "@/lib/pi/watch";
import { LOG_LIMIT } from "@/lib/pi/watch";

export type StoredCommand = QueuedCommand & {
  status: "queued" | "delivered";
  createdAt: string;
  deliveredAt: string | null;
};

type PiMemory = {
  status: PiSnapshot | null;
  log: LogLine[];
  commands: StoredCommand[];
};

const KEY = Symbol.for("tv-dashboard.pi");

type Bucket = typeof globalThis & { [KEY]?: PiMemory };

function bucket(): PiMemory {
  const host = globalThis as Bucket;
  if (!host[KEY]) host[KEY] = { status: null, log: [], commands: [] };
  return host[KEY];
}

export function resetPiMemory(): void {
  delete (globalThis as Bucket)[KEY];
}

export function memoryStatus(): PiSnapshot | null {
  const status = bucket().status;
  return status ? { ...status } : null;
}

export function memoryWriteStatus(status: PiSnapshot): void {
  bucket().status = { ...status };
}

export function memoryLog(): LogLine[] {
  return bucket().log.map((line) => ({ ...line }));
}

export function memoryAppendLog(lines: LogLine[], distinct = false): void {
  const state = bucket();
  const recent = distinct ? new Set(state.log.slice(-20).map((line) => line.line)) : null;
  for (const line of lines) {
    if (!line.line || recent?.has(line.line)) continue;
    state.log.push({ ...line });
    recent?.add(line.line);
  }
  if (state.log.length > LOG_LIMIT) state.log.splice(0, state.log.length - LOG_LIMIT);
}

export function memoryQueue(kind: CommandKind, minutes: number | null, now: Date): QueuedCommand {
  const command: StoredCommand = {
    id: crypto.randomUUID(),
    kind,
    minutes,
    status: "queued",
    createdAt: now.toISOString(),
    deliveredAt: null,
  };
  bucket().commands.push(command);
  return { id: command.id, kind: command.kind, minutes: command.minutes };
}

export function memoryPull(now: Date): QueuedCommand[] {
  const taken: QueuedCommand[] = [];
  for (const command of bucket().commands) {
    if (command.status !== "queued") continue;
    command.status = "delivered";
    command.deliveredAt = now.toISOString();
    taken.push({ id: command.id, kind: command.kind, minutes: command.minutes });
  }
  const cutoff = now.getTime() - 24 * 60 * 60 * 1000;
  bucket().commands = bucket().commands.filter((command) => {
    if (command.status !== "delivered" || !command.deliveredAt) return true;
    return new Date(command.deliveredAt).getTime() >= cutoff;
  });
  return taken;
}

export function memoryReceiver(value: string): Receiver {
  if (value === "idle" || value === "backdrop" || value === "dashboard" || value === "other") return value;
  return "unknown";
}
