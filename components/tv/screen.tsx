"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { HomeView } from "@/components/views/home-view";
import { MomenteView } from "@/components/views/momente-view";
import { SiteView } from "@/components/views/site-view";
import { TikTokView } from "@/components/views/tiktok-view";
import { TodayView } from "@/components/views/today-view";
import { VisionView } from "@/components/views/vision-view";
import { WeekView } from "@/components/views/week-view";
import { ro } from "@/i18n/ro";
import type { TvState } from "@/lib/state/types";
import { tvFitScale } from "@/lib/tv/fit";
import { NIGHTLY_RELOAD_KEY, nightlyReloadKey, shouldNightlyReload } from "@/lib/tv/reload";
import { POLL_MS, nextTvState, tvPathWithView, withLiveClock } from "@/lib/tv/session";
import { CLOCK_MS, delayUntil, onTvWake, scheduleEvery } from "@/lib/tv/timers";
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
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [live, setLive] = useState(false);
  const refetchRef = useRef<(opts?: { rotateFallback?: boolean }) => void>(() => {});
  const rootRef = useRef<HTMLElement | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const pull = async (opts?: { rotateFallback?: boolean }) => {
      const current = stateRef.current;
      try {
        const headers = new Headers();
        if (token) headers.set("Authorization", `Bearer ${token}`);
        const response = await fetch(statePath(), { headers, cache: "no-store" });
        if (!response.ok) {
          if (opts?.rotateFallback) advanceByUrl(current);
          return;
        }
        const body: unknown = await response.json();
        const next = nextTvState(current, body);
        if (opts?.rotateFallback && next.until === current.until && next.currentView === current.currentView) {
          advanceByUrl(current);
          return;
        }
        setState(next);
      } catch {
        if (opts?.rotateFallback) advanceByUrl(current);
      }
    };
    refetchRef.current = (opts) => {
      void pull(opts);
    };
  }, [token]);

  useEffect(() => {
    const fit = () => {
      // Uniform letterbox of the 1280×720 design into the Cast/TV safe viewport.
      const scale = tvFitScale(window.innerWidth, window.innerHeight);
      document.documentElement.style.setProperty("--tv-scale", scale.toFixed(4));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  useEffect(() => {
    const stop = scheduleEvery(() => {
      setNowMs(Date.now());
      setLive(true);
      const node = rootRef.current;
      if (node) node.setAttribute("data-tv-live", "1");
    }, CLOCK_MS);
    return stop;
  }, []);

  useEffect(() => {
    const stop = scheduleEvery(() => refetchRef.current(), POLL_MS);
    return stop;
  }, []);

  useEffect(() => {
    if (state.hold === "paused" || state.hold === "locked") return;
    return delayUntil(new Date(state.until).getTime(), () => refetchRef.current({ rotateFallback: true }));
  }, [state.until, state.hold]);

  useEffect(() => {
    return onTvWake(() => {
      setNowMs(Date.now());
      setLive(true);
      refetchRef.current();
    });
  }, []);

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
    const stop = scheduleEvery(check, POLL_MS);
    return stop;
  }, []);

  useEffect(() => {
    if (!realtime) return;
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    void import("@supabase/realtime-js")
      .then(({ RealtimeClient }) => {
        if (cancelled) return;
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
        cleanup = () => {
          void client.removeChannel(channel);
          void client.disconnect();
        };
      })
      .catch(() => {
        // Realtime is a nudge only; poll + dwell timers keep the TV moving.
      });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [realtime]);

  const shown = withLiveClock(state, nowMs, live);
  const holdFixed = shown.hold === "paused" || shown.hold === "locked";
  const dwellLabel = shown.hold === "paused" ? ro.paused : shown.hold === "locked" ? ro.lockedView : `${shown.dwellRemaining}s`;
  return (
    <main
      ref={rootRef}
      className={["tv-frame", shown.dimmed ? "is-dim" : "", shown.quiet ? "is-quiet" : ""].filter(Boolean).join(" ")}
      data-theme={shown.chrome.theme}
      data-tv-root=""
      data-view={shown.currentView}
      data-next-view={shown.nextView}
      data-until={shown.until}
      data-tv-live={live ? "1" : "0"}
      style={{ "--accent": shown.chrome.accent } as CSSProperties}
    >
      <div className="tv-slot">
        <div className="tv-stage">
          <Chrome chrome={shown.chrome} dwellLabel={dwellLabel} holdFixed={holdFixed}>
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
  if (state.currentView === "momente" && state.momente) return <MomenteView view={state.momente} />;
  if (state.currentView === "site" && state.site) return <SiteView view={state.site} />;
  if (state.currentView === "tiktok" && state.tiktok) return <TikTokView view={state.tiktok} />;
  if (state.currentView === "vision" && state.vision) return <VisionView view={state.vision} />;
  if (state.currentView === "home" && state.home) return <HomeView view={state.home} />;
  return null;
}

function statePath(): string {
  // Prefer unforced live rotation via /api/state. Cast SSR uses ?view= on full navigation.
  return "/api/state";
}

function advanceByUrl(state: TvState) {
  if (state.hold === "paused" || state.hold === "locked") return;
  window.location.assign(tvPathWithView(window.location.href, state.nextView));
}
