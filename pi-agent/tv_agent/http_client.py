"""Outbound calls. The token stays in the Authorization header and out of errors."""

from __future__ import annotations

import json
import re
import urllib.error
import urllib.request

_TOKEN = re.compile(r"(token=)[^&\s]+", re.IGNORECASE)
_BEARER = re.compile(r"Bearer\s+\S+", re.IGNORECASE)


def scrub(text: str) -> str:
    cleaned = _BEARER.sub("Bearer redacted", _TOKEN.sub(r"\1redacted", text))
    return cleaned[:500]


def request_json(method: str, url: str, token: str, payload: dict[str, object] | None = None, timeout: float = 10) -> dict[str, object]:
    data = None if payload is None else json.dumps(payload).encode()
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
        "User-Agent": "tv-agent/1",
    }
    if data is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            raw = response.read().decode()
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"http {exc.code}") from None
    except urllib.error.URLError:
        raise RuntimeError("network") from None
    if not raw:
        return {}
    body = json.loads(raw)
    return body if isinstance(body, dict) else {}
