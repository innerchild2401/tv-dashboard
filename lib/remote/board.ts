import { realtimeClientConfig } from "@/lib/realtime/channel";
import { databaseConfigured } from "@/lib/db/server";
import { buildTvState } from "@/lib/state/build";
import { loadSnapshot } from "@/lib/state/load";
import { listCards, listInbox, readControl } from "@/lib/remote/store";
import type { RemoteBoard } from "@/lib/remote/types";

export async function loadRemoteBoard(now = new Date()): Promise<RemoteBoard> {
  const control = await readControl();
  const snapshot = await loadSnapshot(now);
  const tv = buildTvState(snapshot, now, null, control);
  const [cards, inbox] = await Promise.all([listCards(), listInbox()]);
  return {
    ok: true,
    hold: tv.hold,
    dimmed: tv.dimmed,
    viewId: tv.currentView,
    reason: tv.reason,
    notices: tv.notices,
    until: tv.until,
    dwellRemaining: tv.dwellRemaining,
    priority: tv.chrome.priority,
    config: snapshot.config,
    cards,
    tasks: snapshot.tasks,
    shopping: snapshot.shopping,
    inbox,
    events: snapshot.events,
    metrics: snapshot.metrics.map(({ key, value, previous }) => ({ key, value, previous })),
    realtime: realtimeClientConfig(),
    photoUpload: databaseConfigured() ? "signed" : "direct",
  };
}
