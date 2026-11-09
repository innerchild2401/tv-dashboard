"""Chromecast watchdog decisions. No network and no device access."""

from __future__ import annotations

from dataclasses import dataclass, field
from urllib.parse import parse_qsl, urlsplit

IDLE_APP_ID = "E8C28D3C"
DASH_APP_ID = "84912283"
# Bump when cast-matching / no-flash rules change so /remote/system shows the Pi got the update.
AGENT_VERSION = "2"


@dataclass(frozen=True)
class Settings:
    loop_seconds: int = 15
    idle_seconds: int = 60
    heartbeat_seconds: int = 60
    backoff_cap_seconds: int = 300
    dashboard_refresh_seconds: int = 0


@dataclass
class Sight:
    looked: bool
    found: bool
    app_id: str | None = None
    app_name: str | None = None
    dash_url: str | None = None


@dataclass
class Command:
    id: str
    kind: str
    minutes: int | None = None


@dataclass
class Memory:
    idle_for: float = 0.0
    idle_marked_at: float | None = None
    backoff_until: float = 0.0
    backoff_step: int = 0
    last_heartbeat: float = -1_000_000_000.0
    hands_off_until: float = 0.0
    last_cast_url: str | None = None
    last_cast_at: str | None = None
    last_cast_mono: float = -1_000_000_000.0
    receiver: str = "unknown"
    app_name: str | None = None
    app_id: str | None = None
    log: list[str] = field(default_factory=list)


@dataclass
class Step:
    receiver: str
    cast: bool
    heartbeat: bool
    restart: bool
    notes: list[str] = field(default_factory=list)


def same_dashboard(left: str | None, right: str | None) -> bool:
    """True when both URLs are this TV dashboard.

    Ignores ephemeral query keys such as ``view`` so in-page / classic rotation
    never looks like a foreign DashCast URL. Token is compared only when both
    sides include one (some receivers omit it from the reported URL).
    """
    if not left or not right:
        return False
    a = _parts(left)
    b = _parts(right)
    if a["origin"] != b["origin"] or a["path"] != b["path"]:
        return False
    if a["token"] and b["token"] and a["token"] != b["token"]:
        return False
    return True


def classify(sight: Sight, expected_url: str, last_cast_url: str | None) -> str:
    """Classify the receiver. Prefer app_id over media "off" — DashCast can look idle while still showing."""
    app_id = (sight.app_id or "").upper()
    name = (sight.app_name or "").casefold()
    if app_id in ("", IDLE_APP_ID) or name in {"backdrop", "default media receiver"}:
        if "backdrop" in name:
            return "backdrop"
        return "idle"
    if app_id == DASH_APP_ID or name == "dashcast":
        # Already on DashCast: only replace when the URL is a different dashboard.
        # Never treat a live session as dead just because the player looks "off".
        if sight.dash_url:
            return "dashboard" if same_dashboard(sight.dash_url, expected_url) else "dashboard_wrong"
        if last_cast_url and same_dashboard(last_cast_url, expected_url):
            return "dashboard"
        # App is DashCast but URL unknown after restart — trust the app, do not re-cast.
        return "dashboard"
    return "other"


def should_look(memory: Memory, now: float, commands: list[Command]) -> bool:
    if any(command.kind == "cast_now" for command in commands):
        return True
    return now >= memory.backoff_until


def note_failure(memory: Memory, now: float, settings: Settings) -> None:
    step = settings.loop_seconds if memory.backoff_step <= 0 else min(settings.backoff_cap_seconds, memory.backoff_step * 2)
    memory.backoff_step = step
    memory.backoff_until = now + step


def note_success(memory: Memory) -> None:
    memory.backoff_step = 0
    memory.backoff_until = 0.0


def plan(
    memory: Memory,
    sight: Sight,
    commands: list[Command],
    settings: Settings,
    now: float,
    expected_url: str,
) -> Step:
    notes: list[str] = []
    forced = False
    restart = False
    for command in commands:
        if command.kind == "restart_service":
            restart = True
            notes.append("restart")
        elif command.kind == "release":
            minutes = command.minutes if command.minutes and 1 <= command.minutes <= 240 else 30
            memory.hands_off_until = now + minutes * 60
            _reset_idle(memory)
            notes.append("release")
        elif command.kind == "cast_now":
            forced = True
            memory.hands_off_until = 0.0
            notes.append("cast_now")

    if not sight.looked:
        _freeze_idle(memory, now)
    elif not sight.found:
        _reset_idle(memory)
        memory.receiver = "unknown"
        memory.app_name = None
        memory.app_id = None
    else:
        memory.receiver = classify(sight, expected_url, memory.last_cast_url)
        memory.app_name = _short(sight.app_name)
        memory.app_id = _short(sight.app_id)
        if memory.receiver in {"idle", "backdrop"}:
            _mark_idle(memory, now)
        else:
            _reset_idle(memory)

    receiver = memory.receiver
    auto = False
    # Hard rule: never load_url for view rotation / keepalive while DashCast is already
    # showing this dashboard. Recast only cold start (idle/backdrop), wrong URL, or
    # explicit cast_now. dashboard_refresh_seconds is a force=true fallback only.
    if receiver in {"idle", "backdrop"}:
        auto = memory.idle_for >= settings.idle_seconds and now >= memory.hands_off_until and now >= memory.backoff_until
    elif receiver == "dashboard_wrong":
        auto = now >= memory.hands_off_until and now >= memory.backoff_until
    elif receiver == "dashboard" and settings.dashboard_refresh_seconds > 0:
        if memory.last_cast_mono < 0:
            memory.last_cast_mono = now
        elif (
            now >= memory.hands_off_until
            and now >= memory.backoff_until
            and now - memory.last_cast_mono >= settings.dashboard_refresh_seconds
        ):
            auto = True
            notes.append("refresh")
    return Step(
        receiver=receiver,
        cast=(forced and sight.found) or auto,
        heartbeat=now - memory.last_heartbeat >= settings.heartbeat_seconds,
        restart=restart,
        notes=notes,
    )


def remember(memory: Memory, line: str) -> None:
    clean = " ".join(line.split())
    if not clean or (memory.log and memory.log[-1] == clean):
        return
    memory.log.append(clean[:300])
    del memory.log[:-20]


def wire_receiver(receiver: str) -> str:
    if receiver == "dashboard_wrong":
        return "dashboard"
    if receiver in {"idle", "backdrop", "dashboard", "other", "unknown"}:
        return receiver
    return "unknown"


def _reset_idle(memory: Memory) -> None:
    memory.idle_for = 0.0
    memory.idle_marked_at = None


def _freeze_idle(memory: Memory, now: float) -> None:
    if memory.idle_marked_at is not None:
        memory.idle_marked_at = now


def _mark_idle(memory: Memory, now: float) -> None:
    if memory.idle_marked_at is not None:
        memory.idle_for += max(0.0, now - memory.idle_marked_at)
    memory.idle_marked_at = now


def _short(value: str | None) -> str | None:
    if not value:
        return None
    trimmed = value.strip()
    return trimmed[:80] if trimmed else None


def _parts(url: str) -> dict[str, str]:
    parts = urlsplit(url.strip())
    token = ""
    for key, item in parse_qsl(parts.query, keep_blank_values=True):
        if key.casefold() == "token":
            token = item
            break
    path = parts.path.rstrip("/") or "/"
    origin = f"{parts.scheme.lower()}://{parts.netloc.lower()}"
    return {"origin": origin, "path": path, "token": token}
