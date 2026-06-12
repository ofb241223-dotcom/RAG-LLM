from __future__ import annotations

import re
import time
from collections import deque
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from threading import Lock
from typing import Callable


@dataclass(frozen=True)
class RequestLogEntry:
    id: int
    timestamp: str
    direction: str
    service: str
    method: str
    path: str
    status: int | None
    duration_ms: int
    summary: str = ""


class RequestLogStore:
    def __init__(self, *, max_entries: int = 200) -> None:
        self.max_entries = max_entries
        self._entries: deque[RequestLogEntry] = deque(maxlen=max_entries)
        self._lock = Lock()
        self._sequence = 0

    def record(
        self,
        *,
        direction: str,
        service: str,
        method: str,
        path: str,
        status: int | None,
        duration_ms: int,
        summary: str = "",
    ) -> RequestLogEntry:
        with self._lock:
            self._sequence += 1
            entry = RequestLogEntry(
                id=self._sequence,
                timestamp=datetime.now(UTC).isoformat(),
                direction=direction,
                service=service,
                method=method,
                path=path,
                status=status,
                duration_ms=max(duration_ms, 0),
                summary=_sanitize_summary(summary),
            )
            self._entries.appendleft(entry)
            return entry

    def recent(self, limit: int = 100) -> list[dict[str, object]]:
        safe_limit = max(1, min(limit, self.max_entries))
        with self._lock:
            return [asdict(entry) for entry in list(self._entries)[:safe_limit]]

    def clear(self) -> None:
        with self._lock:
            self._entries.clear()


RequestLogger = Callable[[dict[str, object]], None]


def elapsed_ms(started: float) -> int:
    return int((time.perf_counter() - started) * 1000)


def _sanitize_summary(summary: str) -> str:
    if not summary:
        return ""
    sanitized = re.sub(r"(?i)(authorization|api[_-]?key|token|secret)\s*[:=]\s*[^,\s}]+", r"\1=<redacted>", summary)
    sanitized = re.sub(r"(?i)bearer\s+[A-Za-z0-9._~+/=-]+", "Bearer <redacted>", sanitized)
    return sanitized[:240] + "..." if len(sanitized) > 240 else sanitized
