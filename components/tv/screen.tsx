"use client";

import { RealtimeClient } from "@supabase/realtime-js";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { HomeView } from "@/components/views/home-view";
import { MonthView } from "@/components/views/month-view";
import { SiteView } from "@/components/views/site-view";
import { TikTokView } from "@/components/views/tiktok-view";
import { TodayView } from "@/components/views/today-view";
import { VisionView } from "@/components/views/vision-view";
import { WeekView } from "@/components/views/week-view";
import { ro } from "@/i18n/ro";
import type { TvState } from "@/lib/state/types";
import { NIGHTLY_RELOAD_KEY, nightlyReloadKey, shouldNightlyReload } from "@/lib/tv/reload";
import { POLL_MS, nextTvState, withLiveClock } from "@/lib/tv/session";
import { Chrome } from "@/components/tv/chrome";

export function TvScreen({
  initial,
  token,
  realtime,
}: {
  initial: TvState;
  token: string;
  realtime: { url: string; anonKey: string; channel: string } | null;
}) {
  const [state, setState] = useState(initial);
  const [nowMs, setNowMs] = useState(0);
  const [live, setLive] = useState(false);
  const refetchRef = useRef<() => void>(() => {});

  useEffect(() => {
    const pull = async () => {
      try {
        const headers = new Headers();
        if (token) headers.set("Authorization", `Bearer ${token}`);
        const response = await fetch(statePath(), { headers, cache: "no-store" });
        if (!response.ok) return;
        const body: unknown = await response.json();
        setState((current) => nextTvState(current, body));
      } catch {
        // The last payload stays on screen while the server is unreachable.
      }
    };
    refetchRef.current = () => {
      void pull();
    };
  }, [token]);

  useEffect(() => {
    const fit = () => {
      const scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
      document.documentElement.style.setProperty("--tv-scale", scale.toFixed(4));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  useEffect(() => {
    const tick = window.setInterval(() => {
      setNowMs(Date.now());
      setLive(true);
    }, 1000);
    return () => window.clearInterval(tick);
  }, []);

  useEffect(() => {
    const poll = window.setInterval(() => refetchRef.current(), POLL_MS);
    return () => window.clearInterval(poll);
  }, []);

  useEffect(() => {
    const delay = new Date(state.until).getTime() - Date.now();
    if (delay < 0) return;
    const timer = window.setTimeout(() => refetchRef.current(), delay + 250);
    return () => window.clearTimeout(timer);
  }, [state.until]);

  useEffect(() => {
    const check = () => {
      let stamp: string | null = null;
      try {
        stamp = window.localStorage.getItem(NIGHTLY_RELOAD_KEY);
      } catch {
        return;
      }
      if (!shouldNightlyReload(new Date(), stamp)) return;
      const key = nightlyReloadKey(new Date());
      if (!key) return;
      try {
        window.localStorage.setItem(NIGHTLY_RELOAD_KEY, key);
      } catch {
        return;
      }
      window.location.reload();
    };
    check();
    const timer = window.setInterval(check, POLL_MS);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!realtime) return;
    const client = new RealtimeClient(`${realtime.url}/realtime/v1`, {
      params: { apikey: realtime.anonKey },
      logger: () => {},
    });
    const channel = client.channel(realtime.channel, {
      config: { broadcast: { self: false } },
    });
    channel.on("broadcast", { event: "changed" }, () => {
      refetchRef.current();
    });
    channel.subscribe();
    return () => {
      void client.removeChannel(channel);
      void client.disconnect();
    };
  }, [realtime]);

  const shown = withLiveClock(state, nowMs, live);
  const dwellLabel = shown.hold === "paused" ? ro.paused : shown.hold === "locked" ? ro.lockedView : `${shown.dwellRemaining}s`;
  return (
    <main
      className={["tv-frame", shown.dimmed ? "is-dim" : "", shown.quiet ? "is-quiet" : ""].filter(Boolean).join(" ")}
      data-theme={shown.chrome.theme}
      style={{ "--accent": shown.chrome.accent } as CSSProperties}
    >
      <div className="tv-slot">
        <div className="tv-stage">
          <Chrome chrome={shown.chrome} dwellLabel={dwellLabel}>
            <ViewBody state={shown} />
          </Chrome>
        </div>
      </div>
    </main>
  );
}

function ViewBody({ state }: { state: TvState }) {
  if (state.quiet) return null;
  if (state.currentView === "today" && state.today) return <TodayView view={state.today} />;
  if (state.currentView === "week" && state.week) return <WeekView view={state.week} />;
  if (state.currentView === "month" && state.month) return <MonthView view={state.month} />;
  if (state.currentView === "site" && state.site) return <SiteView view={state.site} />;
  if (state.currentView === "tiktok" && state.tiktok) return <TikTokView view={state.tiktok} />;
  if (state.currentView === "vision" && state.vision) return <VisionView view={state.vision} />;
  if (state.currentView === "home" && state.home) return <HomeView view={state.home} />;
  return null;
}

function statePath(): string {
  if (process.env.NODE_ENV === "production") return "/api/state";
  const view = new URLSearchParams(window.location.search).get("view");
  return view ? `/api/state?view=${encodeURIComponent(view)}` : "/api/state";
}
