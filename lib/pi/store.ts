import { createServiceClient, databaseConfigured } from "@/lib/db/server";
import { ro } from "@/i18n/ro";
import {
  memoryAppendLog,
  memoryLog,
  memoryPull,
  memoryQueue,
  memoryReceiver,
  memoryStatus,
  memoryWriteStatus,
} from "@/lib/pi/memory";
import {
  blankToNull,
  cleanIp,
  commandLabel,
  receiverLabel,
  redactLine,
  type CommandKind,
  type HeartbeatInput,
  type LogLine,
  type PiSnapshot,
  type QueuedCommand,
} from "@/lib/pi/watch";

function devMemory(): boolean {
  return !databaseConfigured() && process.env.NODE_ENV !== "production";
}

function blocked(): { ok: false; reason: string } | null {
  if (databaseConfigured() || devMemory()) return null;
  return { ok: false, reason: ro.remote.unavailable };
}

export async function saveHeartbeat(
  body: HeartbeatInput,
  now = new Date(),
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const block = blocked();
  if (block) return block;
  const status: PiSnapshot = {
    receiver: body.receiver,
    app: blankToNull(body.app),
    appId: blankToNull(body.appId),
    lastCastAt: body.lastCastAt ?? null,
    uptimeSeconds: body.uptimeSeconds,
    localIp: cleanIp(body.localIp),
    version: body.version,
    heartbeatAt: now.toISOString(),
  };
  const lines = logLines(status, body.log, now);
  try {
    if (databaseConfigured()) {
      const db = createServiceClient();
      const saved = await db.from("pi_status").upsert({
        id: 1,
        receiver: status.receiver,
        app_name: status.app,
        app_id: status.appId,
        last_cast_at: status.lastCastAt,
        uptime_seconds: status.uptimeSeconds,
        local_ip: status.localIp,
        agent_version: status.version,
        heartbeat_at: status.heartbeatAt,
      });
      if (saved.error) return { ok: false, reason: "the dashboard could not save that" };
      await appendDbLog(await unseen(lines));
      return { ok: true };
    }
    memoryWriteStatus(status);
    memoryAppendLog(lines, true);
    return { ok: true };
  } catch {
    return { ok: false, reason: "the dashboard could not save that" };
  }
}

export async function pullCommands(now = new Date()): Promise<QueuedCommand[]> {
  if (!databaseConfigured()) {
    if (!devMemory()) return [];
    const taken = memoryPull(now);
    if (taken.length) memoryAppendLog(taken.map((command) => ({ at: now.toISOString(), line: `livrat: ${commandLabel(command.kind, command.minutes)}` })));
    return taken;
  }
  const db = createServiceClient();
  const selected = await db
    .from("pi_commands")
    .select("id, kind, minutes")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(20);
  if (selected.error) throw new Error("db");
  const rows = selected.data ?? [];
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  const updated = await db
    .from("pi_commands")
    .update({ status: "delivered", delivered_at: now.toISOString() })
    .in("id", ids)
    .eq("status", "queued")
    .select("id");
  if (updated.error) throw new Error("db");
  const delivered = new Set((updated.data ?? []).map((row) => row.id));
  const taken = rows.filter((row) => delivered.has(row.id)).map(commandFrom);
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  await db.from("pi_commands").delete().eq("status", "delivered").lt("delivered_at", cutoff);
  if (taken.length) await appendDbLog(taken.map((command) => ({ at: now.toISOString(), line: `livrat: ${commandLabel(command.kind, command.minutes)}` })));
  return taken;
}

export async function queueCommand(
  kind: CommandKind,
  minutes: number | null,
  now = new Date(),
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const block = blocked();
  if (block) return block;
  const line = `comandă: ${commandLabel(kind, minutes)}`;
  try {
    if (databaseConfigured()) {
      const db = createServiceClient();
      const inserted = await db.from("pi_commands").insert({ kind, minutes, status: "queued" });
      if (inserted.error) return { ok: false, reason: ro.remote.unavailable };
      await appendDbLog([{ at: now.toISOString(), line }]);
      return { ok: true };
    }
    memoryQueue(kind, minutes, now);
    memoryAppendLog([{ at: now.toISOString(), line }]);
    return { ok: true };
  } catch {
    return { ok: false, reason: ro.remote.unavailable };
  }
}

export async function readPi(): Promise<{ status: PiSnapshot | null; log: LogLine[] }> {
  if (!databaseConfigured()) {
    if (!devMemory()) return { status: null, log: [] };
    return { status: memoryStatus(), log: memoryLog() };
  }
  const db = createServiceClient();
  const [status, log] = await Promise.all([
    db.from("pi_status").select("*").eq("id", 1).maybeSingle(),
    db.from("pi_log").select("line, created_at").order("created_at", { ascending: false }).limit(40),
  ]);
  if (status.error || log.error) throw new Error("db");
  const lines = (log.data ?? [])
    .map((row) => ({ at: row.created_at, line: row.line }))
    .reverse();
  return { status: status.data ? statusFrom(status.data) : null, log: lines };
}

function logLines(status: PiSnapshot, extra: string[] | undefined, now: Date): LogLine[] {
  const summary = redactLine(
    `semnal ${receiverLabel(status.receiver)}${status.app ? ` · ${status.app}` : ""}${status.localIp ? ` · ${status.localIp}` : ""}`,
  );
  const lines: LogLine[] = [];
  if (summary) lines.push({ at: now.toISOString(), line: summary });
  for (const entry of extra ?? []) {
    const line = redactLine(entry);
    if (line) lines.push({ at: now.toISOString(), line });
  }
  return lines;
}

async function unseen(lines: LogLine[]): Promise<LogLine[]> {
  const db = createServiceClient();
  const recent = await db.from("pi_log").select("line").order("created_at", { ascending: false }).limit(20);
  const have = new Set((recent.data ?? []).map((row) => row.line));
  return lines.filter((line) => line.line && !have.has(line.line));
}

async function appendDbLog(lines: LogLine[]): Promise<void> {
  const clean = lines.filter((line) => line.line);
  if (!clean.length) return;
  const db = createServiceClient();
  const inserted = await db.from("pi_log").insert(clean.map((line) => ({ line: line.line, created_at: line.at })));
  if (inserted.error) return;
  const oldest = await db.from("pi_log").select("created_at").order("created_at", { ascending: false }).range(79, 79);
  const cutoff = oldest.data?.[0]?.created_at;
  if (cutoff) await db.from("pi_log").delete().lt("created_at", cutoff);
}

function commandFrom(row: { id: string; kind: string; minutes: number | null }): QueuedCommand {
  const kind: CommandKind = row.kind === "cast_now" || row.kind === "restart_service" ? row.kind : "release";
  return { id: row.id, kind, minutes: row.minutes };
}

function statusFrom(row: {
  receiver: string;
  app_name: string | null;
  app_id: string | null;
  last_cast_at: string | null;
  uptime_seconds: number | null;
  local_ip: string | null;
  agent_version: string | null;
  heartbeat_at: string | null;
}): PiSnapshot {
  return {
    receiver: memoryReceiver(row.receiver),
    app: row.app_name,
    appId: row.app_id,
    lastCastAt: row.last_cast_at,
    uptimeSeconds: row.uptime_seconds,
    localIp: row.local_ip,
    version: row.agent_version,
    heartbeatAt: row.heartbeat_at,
  };
}
