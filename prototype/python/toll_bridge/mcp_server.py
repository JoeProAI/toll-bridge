"""MCP server: exposes `wring` as a pay-per-call tool over stdio JSON-RPC 2.0.

Implements the current MCP spec surface needed for discovery + call:
initialize, tools/list, tools/call. Payment flows through tool calls:
`wring_quote` -> `wring_pay` -> `wring` with a receipt.

Run: python -m toll_bridge.mcp_server
"""

from __future__ import annotations

import json
import sys

from .toll import PaymentRequired, Receipt, TollGate

PROTOCOL_VERSION = "2025-06-18"

TOOLS = [
    {
        "name": "wring_quote",
        "description": "Get a price quote for one wring call (free).",
        "inputSchema": {
            "type": "object",
            "properties": {
                "mode": {"type": "string", "enum": ["summary", "claims", "brief"]},
            },
        },
    },
    {
        "name": "wring_pay",
        "description": "Pay the toll for a quote. Returns a payment receipt.",
        "inputSchema": {
            "type": "object",
            "required": ["quote_id"],
            "properties": {"quote_id": {"type": "string"}},
        },
    },
    {
        "name": "wring",
        "description": (
            "Wring messy input into a structured result (summary, claims with "
            "source spans, open questions, confidence). Requires a paid receipt."
        ),
        "inputSchema": {
            "type": "object",
            "required": ["input", "receipt"],
            "properties": {
                "input": {"type": "string"},
                "mode": {"type": "string", "enum": ["summary", "claims", "brief"]},
                "receipt": {
                    "type": "object",
                    "required": ["quote_id", "order_id", "capture_id"],
                    "properties": {
                        "quote_id": {"type": "string"},
                        "order_id": {"type": "string"},
                        "capture_id": {"type": "string"},
                    },
                },
            },
        },
    },
]


def _result(id_, value):
    return {
        "jsonrpc": "2.0",
        "id": id_,
        "result": {
            "content": [{"type": "text", "text": json.dumps(value)}],
            "structuredContent": value,
        },
    }


def _error(id_, code, message, data=None):
    err = {"code": code, "message": message}
    if data is not None:
        err["data"] = data
    return {"jsonrpc": "2.0", "id": id_, "error": err}


def make_handler(gate: TollGate):
    def handle(request: dict) -> dict | None:
        method = request.get("method")
        id_ = request.get("id")
        if method == "initialize":
            return {
                "jsonrpc": "2.0",
                "id": id_,
                "result": {
                    "protocolVersion": PROTOCOL_VERSION,
                    "capabilities": {"tools": {}},
                    "serverInfo": {"name": "toll-bridge", "version": "0.1.0"},
                },
            }
        if method == "notifications/initialized":
            return None
        if method == "tools/list":
            return {"jsonrpc": "2.0", "id": id_, "result": {"tools": TOOLS}}
        if method == "tools/call":
            params = request.get("params", {})
            name, args = params.get("name"), params.get("arguments", {})
            try:
                if name == "wring_quote":
                    return _result(id_, gate.quote(args.get("mode", "brief")))
                if name == "wring_pay":
                    return _result(id_, gate.pay(args["quote_id"]).to_dict())
                if name == "wring":
                    r = args["receipt"]
                    return _result(
                        id_,
                        gate.call(
                            args["input"],
                            args.get("mode", "brief"),
                            payment=Receipt(r["quote_id"], r["order_id"], r["capture_id"]),
                        ),
                    )
                return _error(id_, -32602, f"unknown tool {name!r}")
            except PaymentRequired as exc:
                # 402-equivalent: a tool error carrying the quote to pay.
                return _error(id_, -32000, "payment_required", exc.quote)
            except Exception as exc:  # noqa: BLE001
                return _error(id_, -32603, str(exc))
        if method == "ping":
            return {"jsonrpc": "2.0", "id": id_, "result": {}}
        if id_ is None:
            return None
        return _error(id_, -32601, f"method not found: {method}")

    return handle


def main() -> None:  # pragma: no cover - thin I/O loop
    handle = make_handler(TollGate())
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            request = json.loads(line)
        except json.JSONDecodeError:
            continue
        response = handle(request)
        if response is not None:
            sys.stdout.write(json.dumps(response) + "\n")
            sys.stdout.flush()


if __name__ == "__main__":  # pragma: no cover
    main()
