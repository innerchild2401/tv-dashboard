/** Wall-clock helpers for DashCast / Chromecast. Prefer setTimeout chains over rAF. */

export const CLOCK_MS = 1_000;

export function scheduleEvery(callback: () => void, ms: number): () => void {
  let cancelled = false;
  let timer: number | undefined;

  const run = () => {
    if (cancelled) return;
    callback();
    timer = window.setTimeout(run, ms);
  };

  timer = window.setTimeout(run, 0);
  return () => {
    cancelled = true;
    if (timer !== undefined) window.clearTimeout(timer);
  };
}

export function delayUntil(untilMs: number, callback: () => void, skewMs = 250): () => void {
  const wait = untilMs - Date.now() + skewMs;
  if (wait <= 0) {
    const immediate = window.setTimeout(callback, 0);
    return () => window.clearTimeout(immediate);
  }
  const timer = window.setTimeout(callback, wait);
  return () => window.clearTimeout(timer);
}

export function onTvWake(callback: () => void): () => void {
  const wake = () => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    callback();
  };
  document.addEventListener("visibilitychange", wake);
  window.addEventListener("pageshow", wake);
  window.addEventListener("focus", wake);
  return () => {
    document.removeEventListener("visibilitychange", wake);
    window.removeEventListener("pageshow", wake);
    window.removeEventListener("focus", wake);
  };
}
