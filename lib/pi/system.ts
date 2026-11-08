import { agentStore } from "@/lib/agent/tools";
import { ro } from "@/i18n/ro";
import { readPi } from "@/lib/pi/store";
import { buildSystemView, type SystemView } from "@/lib/pi/watch";

export async function loadSystem(now = new Date()): Promise<SystemView | { ok: false; reason: string }> {
  const store = agentStore();
  if (!store) return { ok: false, reason: ro.remote.unavailable };
  try {
    const [pi, audits] = await Promise.all([readPi(), store.recentAudits(40)]);
    return buildSystemView({ now, status: pi.status, log: pi.log, audits });
  } catch {
    return { ok: false, reason: ro.remote.unavailable };
  }
}
