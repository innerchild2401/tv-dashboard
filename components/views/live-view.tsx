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
    const start = async () => {
      try {
        video.muted = true;
        video.playsInline = true;
        video.src = view.streamUrl;
        video.load();
        await video.play();
        if (cancelled) return;
        // Unmute after autoplay succeeds when the Cast/Chromium policy allows it.
        video.muted = false;
        setStatus(view.label);
      } catch {
        if (cancelled) return;
        setStatus(ro.liveTvFailed);
        setMode("iframe");
      }
    };
    void start();

    const onError = () => {
      if (cancelled) return;
      setStatus(ro.liveTvFailed);
      setMode("iframe");
    };
    video.addEventListener("error", onError);
    return () => {
      cancelled = true;
      video.removeEventListener("error", onError);
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
