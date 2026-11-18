"""One watchdog cycle, with the network and the Chromecast passed in."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from tv_agent.decide import (
    AGENT_VERSION,
    Command,
    Memory,
    Settings,
    Sight,
    note_failure,
    note_success,
    plan,
    remember,
    wire_receiver,
)


class RestartRequested(Exception):
    pass


@dataclass
class LoopInput:
    settings: Settings
    memory: Memory
    now: float
    expected_url: str
    commands: list[Command]
    sight: Sight
    cast: Callable[[], None]
    cast_recover: Callable[[], None] | None = None
    play_hls: Callable[[], None] | None = None
    heartbeat: Callable[[dict[str, object]], None] = lambda _payload: None
    wall_iso: str = ""
    uptime_seconds: int = 0
    local_ip: str | None = None
    version: str = AGENT_VERSION


def run_once(step_input: LoopInput) -> None:
    memory = step_input.memory
    settings = step_input.settings
    sight = step_input.sight
    decided = plan(memory, sight, step_input.commands, settings, step_input.now, step_input.expected_url)
    if decided.play_hls and step_input.play_hls is not None:
        try:
            step_input.play_hls()
        except Exception:
            # Never leave a dead Default Media Receiver: clear hands-off and restore DashCast.
            memory.hands_off_until = 0.0
            memory.media_hands_off = False
            restored = False
            if step_input.cast_recover is not None:
                try:
                    step_input.cast_recover()
                    restored = True
                    memory.last_cast_url = step_input.expected_url
                    memory.last_cast_at = step_input.wall_iso
                    memory.last_cast_mono = step_input.now
                except Exception:
                    remember(memory, "hls cast failed; recover failed")
            if restored:
                note_success(memory)
                remember(memory, "hls cast failed; dashcast restored")
            else:
                note_failure(memory, step_input.now, settings)
                if step_input.cast_recover is None:
                    remember(memory, "hls cast failed")
        else:
            minutes = decided.play_hls_minutes if 1 <= decided.play_hls_minutes <= 180 else 60
            memory.hands_off_until = step_input.now + minutes * 60
            memory.media_hands_off = True
            note_success(memory)
            remember(memory, "hls cast ok")
    elif decided.cast:
        recover = decided.cast_recover and step_input.cast_recover is not None
        action = step_input.cast_recover if recover else step_input.cast
        try:
            action()
        except Exception:
            note_failure(memory, step_input.now, settings)
            remember(memory, "cast recover failed" if recover else "cast failed")
        else:
            memory.last_cast_url = step_input.expected_url
            memory.last_cast_at = step_input.wall_iso
            memory.last_cast_mono = step_input.now
            note_success(memory)
            if recover:
                remember(memory, "cast recover ok")
            else:
                remember(memory, "cast ok" if "refresh" not in decided.notes else "cast refresh")
    elif sight.looked and sight.found:
        note_success(memory)
        if decided.receiver == "other":
            remember(memory, f"left {memory.app_name or 'app'} alone")
    elif sight.looked and not sight.found:
        note_failure(memory, step_input.now, settings)
        remember(memory, "discovery failed")
    if "release" in decided.notes:
        remember(memory, "hands off")
    if decided.heartbeat:
        try:
            step_input.heartbeat(_payload(step_input))
        except Exception:
            remember(memory, "heartbeat failed")
        else:
            memory.last_heartbeat = step_input.now
    if decided.restart:
        raise RestartRequested()


def _payload(step_input: LoopInput) -> dict[str, object]:
    memory = step_input.memory
    return {
        "receiver": wire_receiver(memory.receiver),
        "app": memory.app_name,
        "appId": memory.app_id,
        "lastCastAt": memory.last_cast_at,
        "uptimeSeconds": step_input.uptime_seconds,
        "localIp": step_input.local_ip,
        "version": step_input.version,
        "log": list(memory.log[-8:]),
    }
