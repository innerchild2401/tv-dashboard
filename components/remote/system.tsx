"use client";

import { useCallback, useEffect, useState } from "react";
import { useRemote } from "@/components/remote/provider";
import { ro } from "@/i18n/ro";
import type { SystemView } from "@/lib/pi/watch";

const POLL_MS = 15_000;

export function SystemPanel() {
  const { send, busy } = useRemote();
  const [view, setView] = useState<SystemView | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const response = await fetch("/api/remote/system", { cache: "no-store" });
      const body = (await response.json()) as SystemView & { reason?: string };
      if (!response.ok || body.ok !== true) {
        setProblem(body.reason ?? ro.remote.failed);
        return;
      }
      setView(body);
      setProblem(null);
    } catch {
      setProblem(ro.remote.offline);
    }
  }, []);

  useEffect(() => {
    const first = window.setTimeout(() => void reload(), 0);
    const timer = window.setInterval(() => void reload(), POLL_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [reload]);

  async function command(payload: { command: string; minutes?: number }) {
    const ok = await send("/api/remote/system", payload);
    if (ok) await reload();
  }

  return (
    <section className="stack">
      <p className="kicker">{ro.remote.navSystem}</p>
      <h1>{ro.remote.systemTitle}</h1>
      {problem ? <p className="remote-error">{problem}</p> : null}
      {view?.alert ? (
        <p className="alert-banner" role="alert">
          {view.alertText}
        </p>
      ) : null}

      <h2>{ro.remote.heartbeat}</h2>
      {view?.heartbeat ? (
        <div className="stack">
          <p>
            {view.heartbeat.receiverLabel}
            {view.heartbeat.ago ? ` · ${view.heartbeat.ago}` : ""}
          </p>
          <p className="meta">
            {ro.remote.lastSeen}: {when(view.heartbeat.at)}
          </p>
          <p className="meta">
            {ro.remote.appLabel}: {view.heartbeat.app ?? ro.remote.none}
          </p>
          <p className="meta">
            {ro.remote.uptime}: {uptime(view.heartbeat.uptimeSeconds)}
          </p>
          <p className="meta">
            {ro.remote.localIp}: {view.heartbeat.localIp ?? ro.remote.none}
          </p>
          <p className="meta">
            {ro.remote.version}: {view.heartbeat.version ?? ro.remote.none}
          </p>
        </div>
      ) : (
        <p>{ro.remote.piNever}</p>
      )}

      <h2>{ro.remote.lastCast}</h2>
      <p>{view?.lastCastAt ? when(view.lastCastAt) : ro.remote.neverCast}</p>

      <div className="pair">
        <button type="button" disabled={busy} onClick={() => void command({ command: "cast_now" })}>
          {ro.remote.recast}
        </button>
        <button type="button" disabled={busy} onClick={() => void command({ command: "restart_service" })}>
          {ro.remote.restartPi}
        </button>
      </div>
      <form
        className="pair"
        onSubmit={(event) => {
          event.preventDefault();
          const minutes = Number(new FormData(event.currentTarget).get("minutes"));
          void command({ command: "release", minutes });
        }}
      >
        <label>
          {ro.remote.minutes}
          <input name="minutes" type="number" min={1} max={240} defaultValue={30} inputMode="numeric" />
        </label>
        <button type="submit" disabled={busy}>
          {ro.remote.handsOff}
        </button>
      </form>

      <h2>{ro.remote.assistantWrites}</h2>
      {view && view.writes.length > 0 ? (
        <ul className="plain-list">
          {view.writes.map((write) => (
            <li key={write.id}>
              <div>
                <strong>{write.label}</strong>
                <p className="meta">
                  {when(write.at)}
                  {write.undone ? ` · ${ro.remote.undone}` : ""}
                  {!write.ok && write.reason ? ` · ${write.reason}` : ""}
                </p>
              </div>
              {write.canUndo ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void send("/api/remote/undo", { id: write.id }).then((ok) => {
                      if (ok) return reload();
                    })
                  }
                >
                  {ro.remote.undo}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p>{ro.remote.noWrites}</p>
      )}

      <h2>{ro.remote.logTail}</h2>
      {view && view.log.length > 0 ? (
        <pre className="log-tail">{view.log.map((line) => line.line).join("\n")}</pre>
      ) : (
        <p>{ro.remote.emptyLog}</p>
      )}
    </section>
  );
}

function when(iso: string | null): string {
  if (!iso) return ro.remote.none;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return ro.remote.none;
  return new Intl.DateTimeFormat("ro-RO", {
    timeZone: "Europe/Bucharest",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

function uptime(seconds: number | null): string {
  if (seconds === null) return ro.remote.none;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours} h ${minutes} min`;
  return `${minutes} min`;
}
