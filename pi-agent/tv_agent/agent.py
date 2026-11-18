"""Run the 15-second Chromecast watchdog."""

from __future__ import annotations

import logging
import socket
import sys
import time
from datetime import datetime, timezone

from tv_agent.cast_client import load, log_media_status, observe, play_hls
from tv_agent.config import Config, read_config
from tv_agent.decide import AGENT_VERSION, Command, Memory, Sight, should_look
from tv_agent.http_client import request_json, scrub
from tv_agent.loop import LoopInput, RestartRequested, run_once

log = logging.getLogger("tv_agent")
# Throttle MediaController peeks while a cast_hls pin is active (~every 30s).
_MEDIA_PEEK_EVERY = 30.0
_last_media_peek = -1_000_000_000.0


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    args = list(sys.argv[1:] if argv is None else argv)
    path = args[0] if args else "/etc/tv-agent.toml"
    try:
        config = read_config(path)
    except OSError:
        log.error("cannot read %s", path)
        return 1
    issues = config.problems()
    if issues:
        log.error("config is incomplete: %s", ", ".join(issues))
        return 1
    return serve(config)


def serve(config: Config) -> int:
    memory = Memory()
    started = time.monotonic()
    while True:
        began = time.monotonic()
        try:
            cycle(config, memory, started)
        except RestartRequested:
            log.info("restart")
            return 0
        except Exception as exc:
            log.error("%s", scrub(str(exc)))
        delay = config.loop_seconds - (time.monotonic() - began)
        if delay > 0:
            time.sleep(delay)


def cycle(config: Config, memory: Memory, started: float) -> None:
    now = time.monotonic()
    try:
        commands = fetch_commands(config)
    except Exception:
        commands = []
        log.error("commands failed")
    if should_look(memory, now, commands):
        try:
            sight = observe(config)
        except Exception:
            sight = Sight(looked=True, found=False)
            log.error("discovery failed")
    else:
        sight = Sight(looked=False, found=False)

    def do_cast() -> None:
        load(config)

    def do_cast_recover() -> None:
        load(config, relaunch=True)

    def do_play_hls() -> None:
        play_hls(config)

    def do_heartbeat(payload: dict[str, object]) -> None:
        request_json("POST", f"{config.server_url.rstrip('/')}/api/pi/heartbeat", config.pi_token, payload)

    run_once(
        LoopInput(
            settings=config.settings(),
            memory=memory,
            now=now,
            expected_url=config.tv_url(),
            commands=commands,
            sight=sight,
            cast=do_cast,
            cast_recover=do_cast_recover,
            play_hls=do_play_hls,
            heartbeat=do_heartbeat,
            wall_iso=datetime.now(timezone.utc).isoformat(),
            uptime_seconds=max(0, int(now - started)),
            local_ip=local_ip(),
            version=AGENT_VERSION,
        )
    )
    global _last_media_peek
    if (
        memory.media_hands_off
        and memory.receiver == "other"
        and now - _last_media_peek >= _MEDIA_PEEK_EVERY
    ):
        _last_media_peek = now
        try:
            log_media_status(config)
        except Exception as exc:  # noqa: BLE001 — peek is best-effort proof
            log.warning("cast_hls: media peek failed: %s", scrub(str(exc)))


def fetch_commands(config: Config) -> list[Command]:
    body = request_json("GET", f"{config.server_url.rstrip('/')}/api/pi/commands", config.pi_token)
    found: list[Command] = []
    raw = body.get("commands")
    if not isinstance(raw, list):
        return found
    for item in raw:
        if not isinstance(item, dict):
            continue
        kind = item.get("kind")
        if kind not in {"cast_now", "release", "restart_service", "cast_hls"}:
            continue
        minutes = item.get("minutes")
        found.append(Command(id=str(item.get("id") or ""), kind=str(kind), minutes=minutes if isinstance(minutes, int) else None))
    return found


def local_ip() -> str | None:
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect(("192.0.2.1", 9))
        address = sock.getsockname()[0]
    except OSError:
        return None
    else:
        return address if isinstance(address, str) else None
    finally:
        sock.close()


if __name__ == "__main__":
    raise SystemExit(main())
