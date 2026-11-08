"""Read /etc/tv-agent.toml. Tokens stay in that file."""

from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import quote

from tv_agent.decide import Settings


@dataclass(frozen=True)
class Config:
    server_url: str
    pi_token: str
    tv_token: str
    chromecast_name: str
    chromecast_ip: str
    loop_seconds: int = 15
    idle_seconds: int = 60
    heartbeat_seconds: int = 60
    backoff_cap_seconds: int = 300
    discovery_timeout_seconds: int = 5

    def settings(self) -> Settings:
        return Settings(
            loop_seconds=self.loop_seconds,
            idle_seconds=self.idle_seconds,
            heartbeat_seconds=self.heartbeat_seconds,
            backoff_cap_seconds=self.backoff_cap_seconds,
        )

    def tv_url(self) -> str:
        return f"{self.server_url.rstrip('/')}/tv?token={quote(self.tv_token, safe='')}"

    def problems(self) -> list[str]:
        missing: list[str] = []
        if not (self.server_url.startswith("https://") or self.server_url.startswith("http://")):
            missing.append("server_url")
        if not self.pi_token:
            missing.append("pi_token")
        if not self.tv_token:
            missing.append("tv_token")
        if not self.chromecast_name and not self.chromecast_ip:
            missing.append("chromecast")
        return missing


def parse_config(text: str) -> Config:
    values: dict[str, str] = {}
    for raw in text.splitlines():
        line = raw.split("#", 1)[0].strip()
        if not line or "=" not in line:
            continue
        key, value = line.split("=", 1)
        item = value.strip()
        if len(item) >= 2 and item[0] == item[-1] and item[0] in {'"', "'"}:
            item = item[1:-1]
        values[key.strip()] = item
    return Config(
        server_url=values.get("server_url", "").strip(),
        pi_token=values.get("pi_token", "").strip(),
        tv_token=values.get("tv_token", "").strip(),
        chromecast_name=values.get("chromecast_name", "").strip(),
        chromecast_ip=values.get("chromecast_ip", "").strip(),
        loop_seconds=_number(values.get("loop_seconds"), 15),
        idle_seconds=_number(values.get("idle_seconds"), 60),
        heartbeat_seconds=_number(values.get("heartbeat_seconds"), 60),
        backoff_cap_seconds=_number(values.get("backoff_cap_seconds"), 300),
        discovery_timeout_seconds=_number(values.get("discovery_timeout_seconds"), 5),
    )


def read_config(path: str) -> Config:
    with open(path, encoding="utf-8") as handle:
        return parse_config(handle.read())


def _number(value: str | None, fallback: int) -> int:
    try:
        parsed = int(str(value).strip())
    except (TypeError, ValueError):
        return fallback
    return parsed if parsed > 0 else fallback
