"""Chromecast watchdog decisions. No network and no device access."""

from __future__ import annotations

from dataclasses import dataclass, field
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

IDLE_APP_ID = "E8C28D3C"
DASH_APP_ID = "84912283"
AGENT_VERSION = "1"


@dataclass(frozen=True)
class Settings:
    loop_seconds: int = 15
    idle_seconds: int = 60
    heartbeat_seconds: int = 60
    backoff_cap_seconds: int = 300


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
    if not left or not right:
        return False
    return _norm(left) == _norm(right)


def classify(sight: Sight, expected_url: str, last_cast_url: str | None) -> str:
    app_id = (sight.app_id or "").upper()
    name = (sight.app_name or "").casefold()
    if app_id in ("", IDLE_APP_ID) or name in {"backdrop", "default media receiver"}:
        if "backdrop" in name:
            return "backdrop"
        return "idle"
    if app_id == DASH_APP_ID or name == "dashcast":
        if sight.dash_url:
            return "dashboard" if same_dashboard(sight.dash_url, expected_url) else "dashboard_wrong"
        if last_cast_url and same_dashboard(last_cast_url, expected_url):
            return "dashboard"
        return "dashboard_wrong"
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
    if receiver in {"idle", "backdrop"}:
        auto = memory.idle_for >= settings.idle_seconds and now >= memory.hands_off_until and now >= memory.backoff_until
    elif receiver == "dashboard_wrong":
        auto = now >= memory.hands_off_until and now >= memory.backoff_until
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


def _norm(url: str) -> str:
    parts = urlsplit(url.strip())
    query = [(key, item) for key, item in parse_qsl(parts.query, keep_blank_values=True)]
    query.sort()
    path = parts.path.rstrip("/") or "/"
    return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), path, urlencode(query), ""))
