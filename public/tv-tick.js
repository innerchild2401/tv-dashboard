/* Classic Chromecast / DashCast fallback.
 * ES5 only: Next/React bundles may fail to parse on old Cast Chromium.
 * Keeps the wall clock moving and advances to the next view when React never mounts
 * (or mounts but fails to rotate past dwell).
 */
(function () {
  var TIME_ZONE = "Europe/Bucharest";
  var TICK_MS = 1000;
  var STUCK_MS = 90000;
  var LIVE_GRACE_MS = 5000;
  var advancedUntil = "";

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

    if (holdActive(node)) return;
    var grace = live ? LIVE_GRACE_MS : 0;
    if (now < end + grace) return;
    if (until === advancedUntil) return;
    advancedUntil = until;
    advanceToNext(node);
  }

  var lastLabel = "";
  var lastAdvance = Date.now();

  function tick() {
    var now = Date.now();
    var label = paintClock();
    var node = root();
    paintDwell(node, now);
    if (label !== lastLabel) {
      lastLabel = label;
      lastAdvance = now;
    } else if (now - lastAdvance > STUCK_MS && !reactLive(node)) {
      advanceToNext(node);
    }
  }

  function arm() {
    tick();
    window.setInterval(tick, TICK_MS);
  }

  function onWake() {
    lastAdvance = Date.now();
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
  }
})();
