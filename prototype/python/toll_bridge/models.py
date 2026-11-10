"""LLM interface for the wring pipeline.

The pipeline talks to a `Model` — anything implementing `extract(chunk, mode)`
returning a partial extraction dict. Production would plug a real LLM here;
the default `HeuristicModel` is a deterministic, no-key extractive stand-in.
Tests use `FakeModel`.
"""

from __future__ import annotations

import re
from typing import Protocol


class Model(Protocol):
    """Extraction model interface. Swap in a real LLM behind this."""

    def extract(self, chunk: str, mode: str) -> dict:
        """Extract a partial result from one input chunk.

        Returns keys: summary, claims (list of {text, span}), questions.
        """
        ...


_SENTENCE_RE = re.compile(r"(?<=[.!?])\s+")

_CLAIM_CUES = re.compile(
    r"\b(is|are|was|were|will|has|have|shows?|found|reports?|claims?|"
    r"increased|decreased|costs?|causes?|according to)\b",
    re.IGNORECASE,
)
_QUESTION_RE = re.compile(r"\?\s*$")


def split_sentences(text: str) -> list[str]:
    return [s.strip() for s in _SENTENCE_RE.split(text) if s.strip()]


class HeuristicModel:
    """Deterministic extractive model. No network, no keys.

    Picks salient sentences as the summary and cue-bearing sentences as
    claims, with character-offset spans into the chunk.
    """

    def extract(self, chunk: str, mode: str) -> dict:
        sentences = split_sentences(chunk)
        claims = []
        questions = []
        for sent in sentences:
            start = chunk.find(sent)
            span = {"start": start, "end": start + len(sent)}
            if _QUESTION_RE.search(sent):
                questions.append(sent)
            elif _CLAIM_CUES.search(sent):
                claims.append({"text": sent, "span": span})
        summary = " ".join(sentences[:2]) if sentences else ""
        if mode == "summary":
            claims, questions = [], []
        elif mode == "claims":
            summary = ""
        return {"summary": summary, "claims": claims, "questions": questions}


class FakeModel:
    """Scripted model for tests. Cycles canned extractions per call."""

    def __init__(self, extractions: list[dict] | None = None):
        self._extractions = list(extractions or [])
        self.calls: list[tuple[str, str]] = []

    def extract(self, chunk: str, mode: str) -> dict:
        self.calls.append((chunk, mode))
        if self._extractions:
            return self._extractions.pop(0)
        return {
            "summary": f"[fake summary of {len(chunk)} chars]",
            "claims": [
                {"text": "fake claim", "span": {"start": 0, "end": min(10, len(chunk))}}
            ],
            "questions": ["fake question?"],
        }
