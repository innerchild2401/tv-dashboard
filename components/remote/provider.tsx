"use client";

import { RealtimeClient } from "@supabase/realtime-js";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ro } from "@/i18n/ro";
import type { RemoteBoard } from "@/lib/remote/types";
import { POLL_MS } from "@/lib/tv/session";

type RemoteApi = {
  board: RemoteBoard;
  error: string | null;
  busy: boolean;
  send: (
    path: string,
    body?: unknown,
    method?: string,
    optimistic?: (board: RemoteBoard) => RemoteBoard,
  ) => Promise<boolean>;
  upload: (file: File) => Promise<string | null>;
  logout: () => Promise<void>;
};

const RemoteContext = createContext<RemoteApi | null>(null);

export function useRemote(): RemoteApi {
  const value = useContext(RemoteContext);
  if (!value) throw new Error("remote");
  return value;
}

export function RemoteProvider({ initial, children }: { initial: RemoteBoard | null; children: ReactNode }) {
  const [board, setBoard] = useState<RemoteBoard | null>(initial);
  const [status, setStatus] = useState<"loading" | "login" | "ready">(initial ? "ready" : "login");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const hasBoard = useRef(initial !== null);

  useEffect(() => {
    hasBoard.current = board !== null;
  }, [board]);

  const reload = useCallback(async () => {
    try {
      const response = await fetch("/api/remote/board", { cache: "no-store" });
      if (response.status === 401) {
        setStatus("login");
        setBoard(null);
        return;
      }
      const body = (await response.json()) as RemoteBoard & { reason?: string };
      if (!response.ok || body.ok !== true) {
        setError(body.reason ?? ro.remote.failed);
        return;
      }
      setBoard(body);
      setStatus("ready");
    } catch {
      if (!hasBoard.current) setError(ro.remote.offline);
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

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/sw.js");
  }, []);

  const realtimeUrl = board?.realtime?.url;
  const realtimeKey = board?.realtime?.anonKey;
  const realtimeChannel = board?.realtime?.channel;
  useEffect(() => {
    if (!realtimeUrl || !realtimeKey || !realtimeChannel) return;
    const client = new RealtimeClient(`${realtimeUrl}/realtime/v1`, {
      params: { apikey: realtimeKey },
      logger: () => {},
    });
    const channel = client.channel(realtimeChannel, { config: { broadcast: { self: false } } });
    channel.on("broadcast", { event: "changed" }, () => {
      void reload();
    });
    channel.subscribe();
    return () => {
      void client.removeChannel(channel);
      void client.disconnect();
    };
  }, [realtimeUrl, realtimeKey, realtimeChannel, reload]);

  const send = useCallback(
    async (path: string, body?: unknown, method = "POST", optimistic?: (current: RemoteBoard) => RemoteBoard) => {
      let previous: RemoteBoard | null = null;
      if (optimistic) {
        setBoard((current) => {
          previous = current;
          return current ? optimistic(current) : current;
        });
      }
      setBusy(true);
      setError(null);
      try {
        const response = await fetch(path, {
          method,
          headers: body === undefined ? undefined : { "Content-Type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; reason?: string };
        if (response.status === 401) {
          setStatus("login");
          setBoard(null);
          return false;
        }
        if (!response.ok || payload.ok === false) {
          if (previous) setBoard(previous);
          setError(payload.reason ?? ro.remote.failed);
          return false;
        }
        await reload();
        return true;
      } catch {
        if (previous) setBoard(previous);
        setError(ro.remote.offline);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [reload],
  );

  const upload = useCallback(async (file: File) => {
    setError(null);
    try {
      if (board?.photoUpload === "signed" && file.size <= 5 * 1024 * 1024) {
        const ticket = await fetch("/api/remote/uploads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contentType: file.type || "image/jpeg", bytes: file.size }),
        });
        const ticketBody = (await ticket.json()) as { ok?: boolean; path?: string; signedUrl?: string; reason?: string };
        if (ticket.ok && ticketBody.signedUrl && ticketBody.path) {
          const form = new FormData();
          form.append("cacheControl", "3600");
          form.append("", file);
          const headers: Record<string, string> = {};
          if (board.realtime?.anonKey) {
            headers.apikey = board.realtime.anonKey;
            headers.Authorization = `Bearer ${board.realtime.anonKey}`;
          }
          const put = await fetch(ticketBody.signedUrl, { method: "PUT", body: form, headers });
          if (put.ok) return ticketBody.path;
        }
      }
      if (file.size > 4 * 1024 * 1024) {
        setError(ro.remote.tooLong);
        return null;
      }
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/remote/uploads", { method: "POST", body: form });
      const payload = (await response.json()) as { ok?: boolean; path?: string; reason?: string };
      if (!response.ok || !payload.path) {
        setError(payload.reason ?? ro.remote.badPhoto);
        return null;
      }
      return payload.path;
    } catch {
      setError(ro.remote.offline);
      return null;
    }
  }, [board]);

  const logout = useCallback(async () => {
    await fetch("/api/remote/logout", { method: "POST" });
    setBoard(null);
    setStatus("login");
  }, []);

  if (status === "loading") return <p className="remote-status">{ro.remote.loading}</p>;
  if (status === "login" || !board) return <Login onDone={() => void reload()} error={error} />;

  const api: RemoteApi = { board, error, busy, send, upload, logout };
  return (
    <RemoteContext.Provider value={api}>
      <div className="remote" data-theme={board.config.theme.mode}>
        <header className="remote-top">
          <strong>{ro.appTitle}</strong>
          <button type="button" onClick={() => void logout()}>
            {ro.remote.logout}
          </button>
        </header>
        {board.hold === "locked" ? <p className="lock-banner">{ro.remote.lockedBanner}</p> : null}
        {error ? <p className="remote-error">{error}</p> : null}
        <div className="remote-body">{children}</div>
        <nav className="remote-nav" aria-label={ro.viewsNav}>
          <a href="/remote">{ro.remote.navNow}</a>
          <a href="/remote/edit">{ro.viewsNav}</a>
          <a href="/remote/cards">{ro.remote.cards}</a>
          <a href="/remote/lists">{ro.remote.lists}</a>
          <a href="/remote/inbox">{ro.remote.inbox}</a>
        </nav>
      </div>
    </RemoteContext.Provider>
  );
}

function Login({ onDone, error }: { onDone: () => void; error: string | null }) {
  const [pin, setPin] = useState("");
  const [message, setMessage] = useState<string | null>(error);
  const [busy, setBusy] = useState(false);

  async function submit(next = pin) {
    if (next.length < 4 || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/remote/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: next }),
      });
      const body = (await response.json().catch(() => ({}))) as { ok?: boolean; reason?: string };
      if (!response.ok || !body.ok) {
        setMessage(body.reason ?? ro.remote.wrongPin);
        setPin("");
        return;
      }
      setPin("");
      onDone();
    } catch {
      setMessage(ro.remote.offline);
    } finally {
      setBusy(false);
    }
  }

  function press(digit: string) {
    if (pin.length >= 6) return;
    const next = `${pin}${digit}`;
    setPin(next);
    if (next.length === 6) void submit(next);
  }

  return (
    <main className="remote login">
      <h1>{ro.remote.loginTitle}</h1>
      <p>{ro.remote.loginHint}</p>
      <p className="pin-dots" aria-live="polite">
        {"•".repeat(pin.length)}
        <span className="pin-rest">{"◦".repeat(Math.max(0, 4 - pin.length))}</span>
      </p>
      {message ? <p className="remote-error">{message}</p> : null}
      <div className="pin-pad">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
          <button key={digit} type="button" onClick={() => press(digit)}>
            {digit}
          </button>
        ))}
        <button type="button" onClick={() => setPin((current) => current.slice(0, -1))} aria-label={ro.remote.previous}>
          ⌫
        </button>
        <button type="button" onClick={() => press("0")}>
          0
        </button>
        <button type="button" onClick={() => void submit()} disabled={pin.length < 4 || busy}>
          {ro.remote.unlock}
        </button>
      </div>
    </main>
  );
}
