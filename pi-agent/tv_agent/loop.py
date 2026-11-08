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
    heartbeat: Callable[[dict[str, object]], None]
    wall_iso: str
    uptime_seconds: int
    local_ip: str | None
    version: str = AGENT_VERSION


def run_once(step_input: LoopInput) -> None:
    memory = step_input.memory
    settings = step_input.settings
    sight = step_input.sight
    decided = plan(memory, sight, step_input.commands, settings, step_input.now, step_input.expected_url)
    if decided.cast:
        try:
            step_input.cast()
        except Exception:
            note_failure(memory, step_input.now, settings)
            remember(memory, "cast failed")
        else:
            memory.last_cast_url = step_input.expected_url
            memory.last_cast_at = step_input.wall_iso
            memory.last_cast_mono = step_input.now
            note_success(memory)
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
