"use client";

import { useEffect, useRef, useState } from "react";
import { ro } from "@/i18n/ro";
import type { LiveModel } from "@/lib/state/types";

type Mode = "stream" | "iframe" | "failed";

export function LiveView({ view }: { view: LiveModel }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [mode, setMode] = useState<Mode>("stream");
  const [status, setStatus] = useState<string>(ro.liveTvLoading);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || mode !== "stream") return;

    let cancelled = false;
    let hls: { destroy: () => void } | null = null;

    const failToIframe = () => {
      if (cancelled) return;
      setStatus(ro.liveTvFailed);
      setMode("iframe");
    };

    const markPlaying = () => {
      if (cancelled) return;
      // Unmute after autoplay succeeds when the Cast/Chromium policy allows it.
      try {
        video.muted = false;
      } catch {
        // Keep muted if the receiver rejects unmute.
      }
      setStatus(view.label);
    };

    const startNative = async () => {
      video.muted = true;
      video.playsInline = true;
      video.src = view.streamUrl;
      video.load();
      await video.play();
      markPlaying();
    };

    const startHls = async () => {
      const mod = await import("hls.js");
      const Hls = mod.default;
      if (cancelled) return;
      if (!Hls.isSupported()) {
        failToIframe();
        return;
      }
      const instance = new Hls({
        enableWorker: false,
        lowLatencyMode: false,
        maxBufferLength: 30,
      });
      hls = instance;
      instance.loadSource(view.streamUrl);
      instance.attachMedia(video);
      instance.on(Hls.Events.ERROR, (_event, data) => {
        if (!data?.fatal || cancelled) return;
        failToIframe();
      });
      video.muted = true;
      video.playsInline = true;
      await video.play();
      markPlaying();
    };

    const start = async () => {
      try {
        const canNative =
          typeof video.canPlayType === "function" &&
          (video.canPlayType("application/vnd.apple.mpegurl") !== "" ||
            video.canPlayType("application/x-mpegURL") !== "");
        if (canNative) {
          await startNative();
          return;
        }
        await startHls();
      } catch {
        failToIframe();
      }
    };
    void start();

    const onError = () => failToIframe();
    video.addEventListener("error", onError);
    return () => {
      cancelled = true;
      video.removeEventListener("error", onError);
      if (hls) hls.destroy();
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [mode, view.streamUrl, view.label]);

  return (
    <section className="live-tv" aria-label={view.label} data-live-provider={view.provider}>
      <header className="live-tv-bar">
        <strong>{view.label}</strong>
        <span>{status}</span>
        <span className="live-tv-hint">{view.hint}</span>
      </header>
      {mode === "stream" ? (
        <video ref={videoRef} className="live-tv-video" controls playsInline autoPlay muted />
      ) : null}
      {mode === "iframe" ? (
        <iframe
          className="live-tv-frame"
          title={view.label}
          src={view.pageUrl}
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
          referrerPolicy="no-referrer"
        />
      ) : null}
      {mode === "failed" ? (
        <p className="live-tv-fallback">
          {ro.liveTvFailed} {view.pageUrl}
        </p>
      ) : null}
    </section>
  );
}
