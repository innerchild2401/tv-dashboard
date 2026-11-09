/* Classic Chromecast / DashCast fallback.
 * ES5 only: Next/React bundles may fail to parse on old Cast Chromium.
 * Keeps the wall clock moving and advances to the next view when React never mounts
 * (or mounts but fails to rotate past dwell).
 */
(function () {
  var TIME_ZONE = "Europe/Bucharest";
  var TICK_MS = 1000;
  var STUCK_MS = 90000;
  /* Keep in sync with lib/tv/fit.ts — design canvas + Cast overscan safe area. */
  var DESIGN_W = 1280;
  var DESIGN_H = 720;
  var SAFE_FRACTION = 0.9;
  var advancedUntil = "";

  function fitScale() {
    var width = Math.max(1, window.innerWidth || 0) * SAFE_FRACTION;
    var height = Math.max(1, window.innerHeight || 0) * SAFE_FRACTION;
    return Math.min(width / DESIGN_W, height / DESIGN_H);
  }

  function applyFit() {
    try {
      var scale = fitScale();
      if (!isFinite(scale) || scale <= 0) scale = SAFE_FRACTION;
      document.documentElement.style.setProperty("--tv-scale", scale.toFixed(4));
    } catch (err) {}
  }

  function pad(value) {
    return value < 10 ? "0" + value : String(value);
  }

  function clockLabel(date) {
    try {
      var parts = new Intl.DateTimeFormat("en-US", {
        timeZone: TIME_ZONE,
        hourCycle: "h23",
        hour: "2-digit",
        minute: "2-digit",
      }).formatToParts(date);
      var hour = "00";
      var minute = "00";
      for (var i = 0; i < parts.length; i += 1) {
        if (parts[i].type === "hour") hour = parts[i].value;
        if (parts[i].type === "minute") minute = parts[i].value;
      }
      if (hour === "24") hour = "00";
      return hour + ":" + minute;
    } catch (err) {
      return pad(date.getHours()) + ":" + pad(date.getMinutes());
    }
  }

  function root() {
    return document.querySelector("[data-tv-root]");
  }

  function reactLive(node) {
    return !!(node && node.getAttribute("data-tv-live") === "1");
  }

  function holdActive(node) {
    var dwell = document.querySelector("[data-tv-dwell]");
    return !!(dwell && dwell.getAttribute("data-tv-hold") === "1");
  }

  function paintClock() {
    var label = clockLabel(new Date());
    var nodes = document.querySelectorAll("[data-tv-clock]");
    for (var i = 0; i < nodes.length; i += 1) {
      if (nodes[i].textContent !== label) nodes[i].textContent = label;
    }
    return label;
  }

  function advanceToNext(node) {
    var next = node && node.getAttribute("data-next-view");
    try {
      if (next) {
        var url = new URL(window.location.href);
        url.searchParams.set("view", next);
        window.location.assign(url.toString());
        return;
      }
      window.location.reload();
    } catch (err) {
      try {
        window.location.reload();
      } catch (err2) {}
    }
  }

  function paintDwell(node, now) {
    if (!node) return;
    var until = node.getAttribute("data-until");
    if (!until) return;
    var end = Date.parse(until);
    if (isNaN(end)) return;

    var live = reactLive(node);
    if (!live) {
      var seconds = Math.max(0, Math.round((end - now) / 1000));
      var dwell = document.querySelector("[data-tv-dwell]");
      if (dwell && dwell.getAttribute("data-tv-hold") !== "1") {
        dwell.textContent = seconds + "s";
      }
    }

    /* When React is live it rotates via /api/state — never full-navigate (DashCast flash). */
    if (live) return;
    if (holdActive(node)) return;
    if (now < end) return;
    if (until === advancedUntil) return;
    advancedUntil = until;
    advanceToNext(node);
  }

  var lastLabel = "";
  var lastAdvance = Date.now();
  var lastDayKey = "";

  function dayKey(date) {
    try {
      var parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(date);
      var year = "1970";
      var month = "01";
      var day = "01";
      for (var i = 0; i < parts.length; i += 1) {
        if (parts[i].type === "year") year = parts[i].value;
        if (parts[i].type === "month") month = parts[i].value;
        if (parts[i].type === "day") day = parts[i].value;
      }
      return year + "-" + month + "-" + day;
    } catch (err) {
      return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
    }
  }

  /* Soft digit crossfade for Momente when React never mounts. */
  function paintCountdowns() {
    var nodes = document.querySelectorAll("[data-tv-countdown]");
    for (var i = 0; i < nodes.length; i += 1) {
      var expected = nodes[i].getAttribute("data-tv-countdown") || "";
      if (nodes[i].textContent === expected) continue;
      nodes[i].className = (nodes[i].className || "").replace(/\bis-tick\b/g, "").replace(/\s+/g, " ").trim() + " is-tick";
      nodes[i].textContent = expected;
      (function (el) {
        window.setTimeout(function () {
          el.className = (el.className || "").replace(/\bis-tick\b/g, "").replace(/\s+/g, " ").trim();
        }, 180);
      })(nodes[i]);
    }
  }

  function tick() {
    var now = Date.now();
    var label = paintClock();
    var node = root();
    paintDwell(node, now);
    paintCountdowns();
    var key = dayKey(new Date(now));
    if (lastDayKey && key !== lastDayKey && node && node.getAttribute("data-view") === "momente") {
      try {
        window.location.reload();
        return;
      } catch (err) {}
    }
    lastDayKey = key;
    if (label !== lastLabel) {
      lastLabel = label;
      lastAdvance = now;
    } else if (now - lastAdvance > STUCK_MS && !reactLive(node)) {
      advanceToNext(node);
    }
  }

  function arm() {
    applyFit();
    tick();
    window.setInterval(tick, TICK_MS);
  }

  function onWake() {
    lastAdvance = Date.now();
    applyFit();
    tick();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", arm);
  } else {
    arm();
  }

  if (document.addEventListener) {
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState !== "hidden") onWake();
    });
    window.addEventListener("pageshow", onWake);
    window.addEventListener("focus", onWake);
    window.addEventListener("resize", applyFit);
  }
})();
