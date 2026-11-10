"""JSON schema for the wrung result, plus a tiny validator.

Draft 2020-12 shape. Kept dependency-free: `validate` checks the handful of
constraints we actually rely on and raises ValueError with a path on failure.
"""

from __future__ import annotations

WRUNG_RESULT_SCHEMA: dict = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://toll-bridge.dev/schemas/wrung-result.json",
    "title": "WrungResult",
    "type": "object",
    "required": [
        "mode",
        "summary",
        "claims",
        "open_questions",
        "confidence",
        "input_hash",
        "result_hash",
    ],
    "additionalProperties": False,
    "properties": {
        "mode": {"type": "string", "enum": ["summary", "claims", "brief"]},
        "summary": {"type": "string"},
        "claims": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["text", "span"],
                "additionalProperties": False,
                "properties": {
                    "text": {"type": "string"},
                    "span": {
                        "type": "object",
                        "required": ["start", "end"],
                        "additionalProperties": False,
                        "properties": {
                            "start": {"type": "integer", "minimum": 0},
                            "end": {"type": "integer", "minimum": 0},
                        },
                    },
                },
            },
        },
        "open_questions": {"type": "array", "items": {"type": "string"}},
        "confidence": {
            "type": "object",
            "required": ["level", "note"],
            "additionalProperties": False,
            "properties": {
                "level": {"type": "string", "enum": ["low", "medium", "high"]},
                "note": {"type": "string"},
            },
        },
        "input_hash": {"type": "string", "pattern": "^[0-9a-f]{64}$"},
        "result_hash": {"type": "string", "pattern": "^[0-9a-f]{64}$"},
    },
}


def _check(value, schema: dict, path: str) -> None:
    t = schema.get("type")
    if t == "object":
        if not isinstance(value, dict):
            raise ValueError(f"{path}: expected object")
        for k in schema.get("required", []):
            if k not in value:
                raise ValueError(f"{path}.{k}: missing required property")
        if schema.get("additionalProperties") is False:
            extra = set(value) - set(schema.get("properties", {}))
            if extra:
                raise ValueError(f"{path}: unexpected properties {sorted(extra)}")
        for k, sub in schema.get("properties", {}).items():
            if k in value:
                _check(value[k], sub, f"{path}.{k}")
    elif t == "array":
        if not isinstance(value, list):
            raise ValueError(f"{path}: expected array")
        for i, item in enumerate(value):
            _check(item, schema.get("items", {}), f"{path}[{i}]")
    elif t == "string":
        if not isinstance(value, str):
            raise ValueError(f"{path}: expected string")
    elif t == "integer":
        if not isinstance(value, int) or isinstance(value, bool):
            raise ValueError(f"{path}: expected integer")
        if "minimum" in schema and value < schema["minimum"]:
            raise ValueError(f"{path}: below minimum {schema['minimum']}")
    enum = schema.get("enum")
    if enum is not None and value not in enum:
        raise ValueError(f"{path}: {value!r} not in {enum}")
    pattern = schema.get("pattern")
    if pattern:
        import re

        if not re.match(pattern, str(value)):
            raise ValueError(f"{path}: does not match {pattern}")


def validate(result: dict) -> dict:
    """Validate a wrung result against the schema. Returns it unchanged."""
    _check(result, WRUNG_RESULT_SCHEMA, "$")
    return result
