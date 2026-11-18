"use client";

import { useEffect, useRef, useState } from "react";
import { ro } from "@/i18n/ro";
import {
  LIVE_PLAY_START_MS,
  playWithRetries,
  sleep,
  tryUnmute,
} from "@/lib/live/playback";
import type { LiveModel } from "@/lib/state/types";

type Mode = "stream" | "failed";

type LiveProbeApi = {
  currentTime: number;
  paused: boolean;
  muted: boolean;
  readyState: number;
  mode: Mode;
  playing: boolean;
};

declare global {
  interface Window {
    __livePlayer?: LiveProbeApi;
  }
}

export function LiveView({ view }: { view: LiveModel }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [mode, setMode] = useState<Mode>("stream");
  const [status, setStatus] = useState<string>(ro.liveTvLoading);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || mode !== "stream") return;

    let cancelled = false;
    let hls: { destroy: () => void } | null = null;
    let watchdog: ReturnType<typeof setTimeout> | null = null;

    const publish = () => {
      if (typeof window === "undefined") return;
      window.__livePlayer = {
        currentTime: video.currentTime,
        paused: video.paused,
        muted: video.muted,
        readyState: video.readyState,
        mode,
        playing: !video.paused && video.currentTime > 0.05,
      };
    };

    const fail = (message: string) => {
      if (cancelled) return;
      setPlaying(false);
      setStatus(message);
      setMode("failed");
      publish();
    };

    const markPlaying = () => {
      if (cancelled) return;
      if (watchdog) {
        clearTimeout(watchdog);
        watchdog = null;
      }
      tryUnmute(video);
      setPlaying(true);
      setStatus(view.label);
      publish();
    };

    const armWatchdog = (startedAt: number) => {
      watchdog = setTimeout(() => {
        if (cancelled) return;
        if (video.currentTime > 0.2 && !video.paused) {
          markPlaying();
          return;
        }
        fail(ro.liveTvStuck);
      }, Math.max(500, LIVE_PLAY_START_MS - (Date.now() - startedAt)));
    };

    const waitForProgress = async () => {
      const deadline = Date.now() + LIVE_PLAY_START_MS;
      while (!cancelled && Date.now() < deadline) {
        publish();
        if (!video.paused && video.currentTime > 0.15) {
          markPlaying();
          return true;
        }
        await sleep(250);
      }
      return false;
    };

    const startNative = async () => {
      video.muted = true;
      video.playsInline = true;
      video.src = view.streamUrl;
      video.load();
      const started = await playWithRetries(video);
      if (!started) throw new Error("native-play");
      if (!(await waitForProgress())) throw new Error("native-stall");
    };

    const startHls = async () => {
      const mod = await import("hls.js");
      const Hls = mod.default;
      if (cancelled) return;
      if (!Hls.isSupported()) {
        await startNative();
        return;
      }

      const instance = new Hls({
        enableWorker: false,
        lowLatencyMode: false,
        maxBufferLength: 30,
        // Skip VAST/IMA — play the free HLS master only.
        xhrSetup: (xhr) => {
          xhr.withCredentials = false;
        },
      });
      hls = instance;

      await new Promise<void>((resolve, reject) => {
        const onFatal = (_event: unknown, data: { fatal?: boolean }) => {
          if (data?.fatal) reject(new Error("hls-fatal"));
        };
        instance.on(Hls.Events.ERROR, onFatal);
        instance.on(Hls.Events.MANIFEST_PARSED, () => resolve());
        instance.loadSource(view.streamUrl);
        instance.attachMedia(video);
      });

      if (cancelled) return;
      video.muted = true;
      video.playsInline = true;
      const started = await playWithRetries(video);
      if (!started) throw new Error("hls-play");
      if (!(await waitForProgress())) throw new Error("hls-stall");
    };

    const start = async () => {
      const begun = Date.now();
      armWatchdog(begun);
      try {
        // Chromium / DashCast often claims native HLS but never advances currentTime.
        // Prefer MSE (hls.js) whenever available; native only as last resort.
        const mod = await import("hls.js");
        if (!cancelled && mod.default.isSupported()) {
          await startHls();
          return;
        }
        await startNative();
      } catch {
        if (!cancelled) fail(ro.liveTvStuck);
      }
    };
    void start();

    const onTime = () => {
      publish();
      if (!cancelled && !video.paused && video.currentTime > 0.15) markPlaying();
    };
    const onError = () => fail(ro.liveTvStuck);
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("playing", onTime);
    video.addEventListener("error", onError);
    publish();

    return () => {
      cancelled = true;
      if (watchdog) clearTimeout(watchdog);
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("playing", onTime);
      video.removeEventListener("error", onError);
      if (hls) hls.destroy();
      video.pause();
      video.removeAttribute("src");
      video.load();
      if (typeof window !== "undefined" && window.__livePlayer) delete window.__livePlayer;
    };
  }, [mode, view.streamUrl, view.label]);

  return (
    <section
      className="live-tv"
      aria-label={view.label}
      data-live-provider={view.provider}
      data-live-playing={playing ? "1" : "0"}
      data-live-mode={mode}
    >
      <header className="live-tv-bar">
        <strong>{view.label}</strong>
        <span>{status}</span>
        <span className="live-tv-hint">{view.hint}</span>
      </header>
      {mode === "stream" ? (
        <video
          ref={videoRef}
          className="live-tv-video"
          playsInline
          autoPlay
          muted
          // No controls: Cast has no pointer; Chrome UI was the stuck 0:00 symptom.
          controls={false}
          disablePictureInPicture
          disableRemotePlayback
        />
      ) : null}
      {mode === "failed" ? (
        <p className="live-tv-fallback" role="alert">
          {status}{" "}
          <a href={view.pageUrl} rel="noreferrer">
            {view.pageUrl}
          </a>
        </p>
      ) : null}
    </section>
  );
}
