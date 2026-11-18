"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { ro } from "@/i18n/ro";
import {
  LIVE_PLAY_START_MS,
  detectCastUa,
  detectLiveCapabilities,
  ensureAudible,
  loadHlsModule,
  playWithRetries,
  preferLiveEngine,
  prepareVideoElement,
  sleep,
  streamHost,
  videoErrorLabel,
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
  host: string;
  err: string;
};

declare global {
  interface Window {
    __livePlayer?: LiveProbeApi;
  }
}

export function LiveView({
  view,
  buildId,
  onPlayingChange,
  onStuck,
}: {
  view: LiveModel;
  buildId: string;
  onPlayingChange?: (playing: boolean) => void;
  /** Stream never started — parent clears pin + returns to rotation. */
  onStuck?: (reason: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const engineRef = useRef<LiveEngine | "none">("none");
  const errRef = useRef("");
  const stuckSent = useRef(false);
  const [mode, setMode] = useState<Mode>("stream");
  const [status, setStatus] = useState<string>(ro.liveTvLoading);
  const [playing, setPlaying] = useState(false);
  const [engine, setEngine] = useState<LiveEngine | "none">("none");
  const [muted, setMuted] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [err, setErr] = useState("");
  const [diag, setDiag] = useState({
    paused: true,
    readyState: 0,
    ua: "…",
    shortUa: "…",
    volume: 1,
    host: streamHost(view.streamUrl),
  });

  const notifyPlaying = useEffectEvent((value: boolean) => {
    onPlayingChange?.(value);
  });
  const notifyStuck = useEffectEvent((reason: string) => {
    onStuck?.(reason);
  });

  useEffect(() => {
    const video = videoRef.current;
    if (!video || mode !== "stream") return;

    let cancelled = false;
    let hls: { destroy: () => void } | null = null;
    let watchdog: ReturnType<typeof setTimeout> | null = null;
    let unmuted = false;
    const uaInfo = detectCastUa();
    const caps = detectLiveCapabilities(video);
    const host = streamHost(view.streamUrl);
    engineRef.current = "none";
    errRef.current = "";
    setEngine("none");
    setErr("");
    stuckSent.current = false;

    const noteErr = (reason: string) => {
      if (!reason) return;
      errRef.current = reason;
      setErr(reason);
    };

    const publish = () => {
      if (typeof window === "undefined") return;
      const mediaErr = videoErrorLabel(video);
      setCurrentTime(video.currentTime);
      setMuted(video.muted);
      setDiag({
        paused: video.paused,
        readyState: video.readyState,
        ua: uaInfo.label,
        shortUa: uaInfo.shortUa,
        volume: video.volume,
        host,
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
        host,
        err: mediaErr || errRef.current,
      };
    };

    const pickEngine = (next: LiveEngine) => {
      engineRef.current = next;
      setEngine(next);
    };

    const reportStuck = (reason: string) => {
      if (cancelled || stuckSent.current) return;
      stuckSent.current = true;
      noteErr(reason);
      notifyStuck(reason);
    };

    const fail = (message: string, reason: string) => {
      if (cancelled) return;
      setPlaying(false);
      notifyPlaying(false);
      setStatus(message);
      noteErr(reason);
      setMode("failed");
      publish();
      reportStuck(reason);
    };

    const markPlaying = () => {
      if (cancelled) return;
      if (watchdog) {
        clearTimeout(watchdog);
        watchdog = null;
      }
      setPlaying(true);
      notifyPlaying(true);
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
        fail(ro.liveTvStuck, errRef.current || "watchdog-12s");
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
      if (!view.streamUrl) throw new Error("empty-url");
      prepareVideoElement(video, true);
      video.src = view.streamUrl;
      video.load();
      let playErr = "";
      try {
        const started = await playWithRetries(video, undefined, { preferUnmuted: uaInfo.castLike });
        if (!started) playErr = "native-play";
      } catch (cause) {
        playErr = cause instanceof Error ? cause.message || "native-play" : "native-play";
      }
      if (playErr) throw new Error(playErr);
      if (!(await waitForProgress())) throw new Error("native-stall");
    };

    const startHls = async (Hls: NonNullable<Awaited<ReturnType<typeof loadHlsModule>>>) => {
      if (!Hls.isSupported()) {
        await startNative();
        return;
      }

      pickEngine("hlsjs");
      const instance = new Hls({
        enableWorker: false,
        lowLatencyMode: false,
        maxBufferLength: 30,
        xhrSetup: (xhr: XMLHttpRequest) => {
          xhr.withCredentials = false;
        },
      });
      hls = instance;

      await new Promise<void>((resolve, reject) => {
        const onFatal = (_event: unknown, data: { fatal?: boolean; type?: string; details?: string }) => {
          if (data?.fatal) {
            reject(new Error(`hls-fatal:${data.type || data.details || "err"}`));
          }
        };
        instance.on(Hls.Events.ERROR, onFatal as (...args: never[]) => void);
        instance.on(Hls.Events.MANIFEST_PARSED, (() => resolve()) as (...args: never[]) => void);
        if (!view.streamUrl) {
          reject(new Error("empty-url"));
          return;
        }
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
        if (!view.streamUrl) {
          fail(ro.liveTvStuck, "empty-url");
          return;
        }
        // Decide without awaiting hls.js — Cast chunk import can hang and left engine=none.
        const pick = preferLiveEngine(caps.mse, uaInfo);
        pickEngine(pick);

        if (pick === "hlsjs") {
          const Hls = await loadHlsModule();
          if (cancelled) return;
          if (Hls?.isSupported()) {
            await startHls(Hls);
            return;
          }
          noteErr(Hls ? "hls-unsupported" : "hls-import-timeout");
        }

        if (!caps.nativeHls && !caps.mse) {
          noteErr("no-mse-no-native-claim");
        }
        await startNative();
      } catch (cause) {
        const reason = cause instanceof Error ? cause.message : "start-failed";
        if (!cancelled) fail(ro.liveTvStuck, reason);
      }
    };
    void start();

    const onTime = () => {
      publish();
      if (!cancelled && !video.paused && video.currentTime > 0.15) markPlaying();
    };
    const onError = () => {
      const label = videoErrorLabel(video) || "video-error";
      noteErr(label);
      fail(ro.liveTvStuck, label);
    };
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
        build {buildId.slice(0, 12)} · {engine} · {diag.ua} · {diag.host} · t=
        {currentTime.toFixed(1)}s · {diag.paused ? "paused" : "play"} ·{" "}
        {muted ? "MUTE" : "SUNET"} · vol={diag.volume.toFixed(1)} · rs={diag.readyState}
        {err ? ` · err=${err}` : ""} · {diag.shortUa}
      </p>
      {mode === "stream" ? (
        <video
          ref={videoRef}
          className="live-tv-video"
          playsInline
          autoPlay
          muted
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
