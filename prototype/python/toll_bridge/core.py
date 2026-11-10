"""Core wring pipeline: chunk -> extract -> merge -> format.

Deterministic given a deterministic model. `wring(input_text, mode, model)`
returns a schema-validated WrungResult.
"""

from __future__ import annotations

import hashlib
import json

from .models import HeuristicModel, Model
from .schema import validate

MODES = ("summary", "claims", "brief")
DEFAULT_CHUNK_CHARS = 4000


def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def chunk_input(text: str, chunk_chars: int = DEFAULT_CHUNK_CHARS) -> list[str]:
    """Split input into roughly chunk_chars pieces on paragraph boundaries."""
    text = text.strip()
    if not text:
        return []
    paragraphs = [p for p in text.split("\n\n") if p.strip()]
    chunks, current = [], ""
    for para in paragraphs:
        if current and len(current) + len(para) + 2 > chunk_chars:
            chunks.append(current)
            current = para
        else:
            current = f"{current}\n\n{para}" if current else para
    if current:
        chunks.append(current)
    # Hard-split any paragraph that is still too long.
    final: list[str] = []
    for c in chunks:
        while len(c) > chunk_chars:
            final.append(c[:chunk_chars])
            c = c[chunk_chars:]
        final.append(c)
    return final


def _merge(partials: list[dict], chunk_offsets: list[int]) -> dict:
    """Merge per-chunk extractions; rebase spans to global offsets, dedupe."""
    summary_parts, claims, questions = [], [], []
    seen_claims: set[str] = set()
    for partial, offset in zip(partials, chunk_offsets):
        if partial.get("summary"):
            summary_parts.append(partial["summary"])
        for claim in partial.get("claims", []):
            text = claim["text"].strip()
            if not text or text.lower() in seen_claims:
                continue
            seen_claims.add(text.lower())
            span = claim.get("span", {"start": 0, "end": 0})
            claims.append(
                {
                    "text": text,
                    "span": {"start": span["start"] + offset, "end": span["end"] + offset},
                }
            )
        for q in partial.get("questions", []):
            if q not in questions:
                questions.append(q)
    return {"summary": " ".join(summary_parts), "claims": claims, "questions": questions}


def _confidence(merged: dict, input_text: str) -> dict:
    n_claims = len(merged["claims"])
    if not input_text.strip():
        return {"level": "low", "note": "empty input"}
    if n_claims == 0:
        return {"level": "low", "note": "no claims extracted; input may be too thin"}
    coverage = n_claims / max(1, len(input_text) // 1000)
    if coverage >= 2:
        return {"level": "high", "note": f"{n_claims} claims with source spans"}
    return {"level": "medium", "note": f"{n_claims} claims extracted"}


def _chunk_offsets(text: str, chunks: list[str]) -> list[int]:
    offsets, cursor = [], 0
    stripped = text.strip()
    for c in chunks:
        idx = stripped.find(c[:40], cursor)
        if idx < 0:
            idx = cursor
        offsets.append(idx)
        cursor = idx + len(c)
    return offsets


def wring(
    input_text: str,
    mode: str = "brief",
    model: Model | None = None,
    chunk_chars: int = DEFAULT_CHUNK_CHARS,
) -> dict:
    """Wring messy input into a structured result.

    mode: 'summary' (short prose only), 'claims' (claims + spans),
    'brief' (summary + claims + open questions). Returns a WrungResult
    validated against toll_bridge.schema.WRUNG_RESULT_SCHEMA.
    """
    if mode not in MODES:
        raise ValueError(f"unknown mode {mode!r}; expected one of {MODES}")
    model = model or HeuristicModel()
    chunks = chunk_input(input_text, chunk_chars)
    offsets = _chunk_offsets(input_text, chunks)
    partials = [model.extract(c, mode) for c in chunks] or [
        {"summary": "", "claims": [], "questions": []}
    ]
    merged = _merge(partials, offsets)
    result = {
        "mode": mode,
        "summary": merged["summary"],
        "claims": merged["claims"],
        "open_questions": merged["questions"],
        "confidence": _confidence(merged, input_text),
        "input_hash": _sha256(input_text),
        "result_hash": "",  # filled below
    }
    result["result_hash"] = _sha256(
        json.dumps({k: v for k, v in result.items() if k != "result_hash"}, sort_keys=True)
    )
    return validate(result)
