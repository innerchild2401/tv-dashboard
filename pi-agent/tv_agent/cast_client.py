"""Chromecast discovery and DashCast. Imported only when the service runs."""

from __future__ import annotations

import logging
import threading
import time
import uuid

from tv_agent.config import Config
from tv_agent.decide import DASH_APP_ID, IDLE_APP_ID, Sight

log = logging.getLogger("tv_agent")


def observe(config: Config) -> Sight:
    cast, browser = _connect(config)
    try:
        if cast is None:
            return Sight(looked=True, found=False)
        holder: dict[str, str | None] = {"url": None}
        cast.register_handler(_capture(holder))
        cast.wait(timeout=config.discovery_timeout_seconds)
        url = holder["url"]
        return Sight(
            looked=True,
            found=True,
            app_id=cast.app_id,
            app_name=cast.app_display_name,
            dash_url=url if isinstance(url, str) else None,
        )
    finally:
        _close(cast, browser)


def load(config: Config, *, relaunch: bool = False) -> None:
    cast, browser = _connect(config)
    try:
        if cast is None:
            raise RuntimeError("chromecast not found")
        cast.wait(timeout=config.discovery_timeout_seconds)
        if relaunch:
            _relaunch_dashcast(cast, config)
        else:
            _load_url(
                cast,
                config.tv_url(),
                float(config.discovery_timeout_seconds),
                config.dashcast_force,
                config.dashcast_reload_seconds,
            )
    finally:
        _close(cast, browser)


# Free Antena 3 HLS master (same URL as the dashboard). No secrets.
ANTENA3_HLS_URL = "https://live3vox.antenaplay.ro/a3free/a3free.m3u8"

# Player states that mean the receiver is actually consuming media (not a black zombie).
_ACTIVE_MEDIA_STATES = frozenset({"PLAYING", "BUFFERING"})


def play_hls(config: Config, url: str = ANTENA3_HLS_URL) -> None:
    """Cast Antena 3 HLS as native media with volume, then verify playback.

    Chosen path (HH-32): hardened ``pychromecast`` ``MediaController`` on the
    Default Media Receiver. Alternatives considered and skipped:

    - ``catt``: same DMR underneath, extra Pi dependency.
    - Custom Cast receiver: needs a Cast developer app + hosted receiver.
    - Fragile fire-and-forget DMR (HH-30/31): left this TV black / unrecovered.

    Safety contract: if media does not reach PLAYING/BUFFERING with content
    within the discovery timeout, raise — the watchdog loop must quit the media
    app and restore DashCast so Cast is never left dead. Soft in-page pin on the
    dashboard remains the secondary fallback when this path fails or is skipped.
    """
    cast, browser = _connect(config)
    try:
        if cast is None:
            raise RuntimeError("chromecast not found")
        timeout = float(config.discovery_timeout_seconds)
        cast.wait(timeout=timeout)
        # application/x-mpegURL is what Chromecast expects for HLS live.
        cast.media_controller.play_media(
            url,
            "application/x-mpegURL",
            stream_type="LIVE",
            autoplay=True,
            title="Antena 3",
        )
        cast.media_controller.block_until_active(timeout=timeout)
        _ensure_audible_volume(cast)
        if not _wait_media_active(cast, timeout):
            raise RuntimeError("hls media not playing")
        log.info("cast_hls: media active on %s", getattr(cast, "app_id", None) or "?")
    finally:
        _close(cast, browser)


def _ensure_audible_volume(cast) -> None:
    """Floor a near-silent Cast volume so live TV is actually heard."""
    try:
        status = getattr(cast, "status", None)
        level = getattr(status, "volume_level", None) if status is not None else None
        muted = bool(getattr(status, "volume_muted", False)) if status is not None else False
        if muted:
            cast.set_volume_muted(False)
        if level is None or float(level) < 0.15:
            cast.set_volume(0.4)
            log.info("cast_hls: volume raised to 0.4 (was %s muted=%s)", level, muted)
    except Exception as exc:  # noqa: BLE001 — volume is best-effort
        log.warning("cast_hls: volume adjust failed: %s", exc)


def _wait_media_active(cast, timeout: float) -> bool:
    """True when MediaController reports PLAYING/BUFFERING with a content id/type."""
    deadline = time.monotonic() + max(3.0, timeout)
    mc = cast.media_controller
    while time.monotonic() < deadline:
        try:
            status = mc.status
        except Exception:  # noqa: BLE001
            status = None
        state = (getattr(status, "player_state", None) or "").upper()
        content = getattr(status, "content_id", None) or getattr(status, "content_type", None)
        if state in _ACTIVE_MEDIA_STATES and content:
            return True
        time.sleep(0.4)
    return False


def _relaunch_dashcast(cast, config: Config) -> None:
    """Quit foreign apps (esp. Default Media Receiver) and bring DashCast back.

    Retries so stop_antena3_live does not leave a black DMR / zombie DashCast
    that logs \"already running\" but never shows the panel.
    """
    timeout = float(config.discovery_timeout_seconds)
    url = config.tv_url()
    last_error: BaseException | None = None
    for attempt in range(1, 4):
        try:
            cast.wait(timeout=timeout)
            app_id = (getattr(cast, "app_id", None) or "").upper()
            if app_id and app_id not in ("", IDLE_APP_ID):
                log.info("cast_now recover: quitting app %s (attempt %s)", app_id, attempt)
                try:
                    cast.quit_app()
                except Exception as exc:  # noqa: BLE001 — keep retrying
                    log.warning("quit_app failed: %s", exc)
                time.sleep(2.0)
                cast.wait(timeout=timeout)
            _load_url(cast, url, timeout, False, config.dashcast_reload_seconds)
            cast.wait(timeout=timeout)
            active = (getattr(cast, "app_id", None) or "").upper()
            if active == DASH_APP_ID:
                log.info("cast_now recover: DashCast active (attempt %s)", attempt)
                return
            last_error = RuntimeError(f"dashcast not active after load (app={active or 'none'})")
            log.warning("%s", last_error)
        except Exception as exc:  # noqa: BLE001 — retry
            last_error = exc
            log.warning("cast_now recover attempt %s failed: %s", attempt, exc)
        time.sleep(1.5)
    raise last_error or RuntimeError("dashcast relaunch failed")


def _connect(config: Config):
    import pychromecast

    names = [config.chromecast_name] if config.chromecast_name else None
    hosts = [config.chromecast_ip] if config.chromecast_ip else None
    timeout = float(config.discovery_timeout_seconds)
    chromecasts, browser = pychromecast.get_listed_chromecasts(
        friendly_names=names,
        known_hosts=hosts,
        discovery_timeout=timeout,
        timeout=timeout,
        tries=1,
    )
    try:
        cast = chromecasts[0] if chromecasts else None
        if cast is None and config.chromecast_ip:
            cast = pychromecast.get_chromecast_from_host(
                (config.chromecast_ip, 8009, uuid.UUID(int=0), "Chromecast", config.chromecast_name or "Chromecast"),
                timeout=timeout,
                tries=1,
            )
        return cast, browser
    except Exception:
        _close(None, browser)
        raise


def _capture(holder: dict[str, str | None]):
    from pychromecast.controllers.dashcast import DashCastController

    class CapturingDash(DashCastController):
        def receive_message(self, message, data):  # noqa: ANN001
            if isinstance(data, dict) and isinstance(data.get("url"), str):
                holder["url"] = data["url"]
            return super().receive_message(message, data)

    return CapturingDash()


def _load_url(cast, url: str, timeout: float, force: bool, reload_seconds: int) -> None:
    from pychromecast.controllers.dashcast import DashCastController

    controller = DashCastController()
    cast.register_handler(controller)
    done = threading.Event()
    failed = {"value": False}

    def callback(msg_sent: bool, _response: dict | None) -> None:
        failed["value"] = not msg_sent
        done.set()

    # Upstream DashCastController:
    # - force=True disables reload_seconds AND makes every later load_url() relaunch the app (splash).
    # - force=False loads in an iframe; reload_seconds soft-reloads the page; controllers stay in control.
    # Call this only for cold start / wrong dashboard — never for view rotation or keepalive.
    # Await the launch callback before considering the cast up (no double load_url).
    reload = 0 if force else max(0, reload_seconds)
    controller.load_url(url, force=force, reload_seconds=reload, callback_function=callback)
    if not done.wait(timeout):
        raise TimeoutError("dashcast")
    if failed["value"]:
        raise RuntimeError("dashcast")


def _close(cast, browser) -> None:
    if cast is not None:
        try:
            cast.disconnect(timeout=1)
        except Exception:
            pass
    if browser is not None:
        try:
            browser.stop_discovery()
        except Exception:
            pass
