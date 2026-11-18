"use client";

import { useEffect, useRef, useState } from "react";
import { ro } from "@/i18n/ro";
import {
  LIVE_PLAY_START_MS,
  detectCastUa,
  ensureAudible,
  playWithRetries,
  preferLiveEngine,
  prepareVideoElement,
  sleep,
  type LiveEngine,
} from "@/lib/live/playback";
import type { LiveModel } from "@/lib/state/types";

type Mode = "stream" | "failed";

type LiveProbeApi = {
  currentTime: number;
  paused: boolean;
  muted: boolean;
  volume: number;
  readyState: number;
  mode: Mode;
  playing: boolean;
  engine: LiveEngine | "none";
  ua: string;
  buildId: string;
};

declare global {
  interface Window {
    __livePlayer?: LiveProbeApi;
  }
}

export function LiveView({ view, buildId }: { view: LiveModel; buildId: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const engineRef = useRef<LiveEngine | "none">("none");
  const [mode, setMode] = useState<Mode>("stream");
  const [status, setStatus] = useState<string>(ro.liveTvLoading);
  const [playing, setPlaying] = useState(false);
  const [engine, setEngine] = useState<LiveEngine | "none">("none");
  const [muted, setMuted] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [diag, setDiag] = useState({
    paused: true,
    readyState: 0,
    ua: "…",
    volume: 1,
  });

  useEffect(() => {
    const video = videoRef.current;
    if (!video || mode !== "stream") return;

    let cancelled = false;
    let hls: { destroy: () => void } | null = null;
    let watchdog: ReturnType<typeof setTimeout> | null = null;
    let unmuted = false;
    const uaInfo = detectCastUa();
    engineRef.current = "none";
    setEngine("none");

    const publish = () => {
      if (typeof window === "undefined") return;
      setCurrentTime(video.currentTime);
      setMuted(video.muted);
      setDiag({
        paused: video.paused,
        readyState: video.readyState,
        ua: uaInfo.label,
        volume: video.volume,
      });
      window.__livePlayer = {
        currentTime: video.currentTime,
        paused: video.paused,
        muted: video.muted,
        volume: video.volume,
        readyState: video.readyState,
        mode,
        playing: !video.paused && video.currentTime > 0.05,
        engine: engineRef.current,
        ua: uaInfo.label,
        buildId,
      };
    };

    const pickEngine = (next: LiveEngine) => {
      engineRef.current = next;
      setEngine(next);
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
      setPlaying(true);
      setStatus(view.label);
      publish();
      if (!unmuted) {
        unmuted = true;
        void ensureAudible(video).then((ok) => {
          if (!cancelled) {
            setMuted(video.muted);
            publish();
            if (ok) setStatus(`${view.label} · sunet`);
          }
        });
      }
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
      pickEngine("native");
      prepareVideoElement(video, true);
      video.src = view.streamUrl;
      video.load();
      const started = await playWithRetries(video, undefined, { preferUnmuted: uaInfo.castLike });
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

      pickEngine("hlsjs");
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
      prepareVideoElement(video, true);
      const started = await playWithRetries(video, undefined, { preferUnmuted: uaInfo.castLike });
      if (!started) throw new Error("hls-play");
      if (!(await waitForProgress())) throw new Error("hls-stall");
    };

    const start = async () => {
      const begun = Date.now();
      armWatchdog(begun);
      try {
        // Chromium / DashCast often claims native HLS but never advances currentTime.
        // Prefer MSE (hls.js) whenever available; native only when MSE is missing.
        const mod = await import("hls.js");
        const mseOk = mod.default.isSupported();
        const pick = preferLiveEngine(mseOk, uaInfo);
        if (!cancelled && pick === "hlsjs") {
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
    video.addEventListener("volumechange", publish);
    video.addEventListener("error", onError);
    publish();

    return () => {
      cancelled = true;
      if (watchdog) clearTimeout(watchdog);
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("playing", onTime);
      video.removeEventListener("volumechange", publish);
      video.removeEventListener("error", onError);
      if (hls) hls.destroy();
      video.pause();
      video.removeAttribute("src");
      video.load();
      if (typeof window !== "undefined" && window.__livePlayer) delete window.__livePlayer;
    };
  }, [mode, view.streamUrl, view.label, buildId]);

  return (
    <section
      className="live-tv"
      aria-label={view.label}
      data-live-provider={view.provider}
      data-live-playing={playing ? "1" : "0"}
      data-live-mode={mode}
      data-live-engine={engine}
      data-live-muted={muted ? "1" : "0"}
      data-build-id={buildId}
    >
      <header className="live-tv-bar">
        <strong>{view.label}</strong>
        <span>{status}</span>
        <span className="live-tv-hint">{view.hint}</span>
      </header>
      <p className="live-tv-diag" data-live-diag="" aria-hidden="true">
        build {buildId.slice(0, 12)} · {engine} · {diag.ua} · t=
        {currentTime.toFixed(1)}s · {diag.paused ? "paused" : "play"} ·{" "}
        {muted ? "MUTE" : "SUNET"} · vol={diag.volume.toFixed(1)} · rs={diag.readyState}
      </p>
      {mode === "stream" ? (
        <video
          ref={videoRef}
          className="live-tv-video"
          playsInline
          autoPlay
          // Start muted for autoplay policy; ensureAudible unmutes after progress.
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
