"""Chromecast discovery and DashCast. Imported only when the service runs."""

from __future__ import annotations

import threading
import uuid

from tv_agent.config import Config
from tv_agent.decide import Sight


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


def load(config: Config) -> None:
    cast, browser = _connect(config)
    try:
        if cast is None:
            raise RuntimeError("chromecast not found")
        cast.wait(timeout=config.discovery_timeout_seconds)
        _load_url(cast, config.tv_url(), float(config.discovery_timeout_seconds))
    finally:
        _close(cast, browser)


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


def _load_url(cast, url: str, timeout: float) -> None:
    from pychromecast.controllers.dashcast import DashCastController

    controller = DashCastController()
    cast.register_handler(controller)
    done = threading.Event()
    failed = {"value": False}

    def callback(msg_sent: bool, _response: dict | None) -> None:
        failed["value"] = not msg_sent
        done.set()

    controller.load_url(url, force=True, callback_function=callback)
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
