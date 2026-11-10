"""Ledger: one entry per toll call.

Every attempted call records quote, payment id, cost, and result hash.
In-memory by default; `JsonlLedger` appends to a file for a persistent trail.
"""

from __future__ import annotations

import json
import time
import uuid
from pathlib import Path


def new_call_id() -> str:
    return f"call-{uuid.uuid4().hex[:12]}"


class Ledger:
    def record(self, entry: dict) -> dict:  # pragma: no cover - interface
        raise NotImplementedError

    def entries(self) -> list[dict]:  # pragma: no cover - interface
        raise NotImplementedError


class MemoryLedger(Ledger):
    def __init__(self):
        self._entries: list[dict] = []

    def record(self, entry: dict) -> dict:
        entry = {"ts": time.time(), **entry}
        self._entries.append(entry)
        return entry

    def entries(self) -> list[dict]:
        return list(self._entries)


class JsonlLedger(Ledger):
    def __init__(self, path: str | Path):
        self.path = Path(path)

    def record(self, entry: dict) -> dict:
        entry = {"ts": time.time(), **entry}
        with self.path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(entry, sort_keys=True) + "\n")
        return entry

    def entries(self) -> list[dict]:
        if not self.path.exists():
            return []
        return [json.loads(line) for line in self.path.read_text().splitlines() if line]
