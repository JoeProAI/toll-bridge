"""Plain HTTP endpoint for the toll bridge. Same core as the MCP server.

Routes:
  GET  /quote?mode=brief   -> 200 quote
  POST /pay                -> {quote_id} -> receipt
  POST /wring              -> {input, mode, receipt?}
                             unpaid: 402 {error: "payment_required", quote}
                             paid:   200 {result, receipt, call_id}
  GET  /                   -> demo page (web/index.html)

Run: python -m toll_bridge.http_server [port]
"""

from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from .toll import PaymentRequired, TollGate

WEB_DIR = Path(__file__).resolve().parent.parent / "web"


def make_handler(gate: TollGate):
    class Handler(BaseHTTPRequestHandler):
        def _json(self, status: int, body: dict):
            payload = json.dumps(body).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def _body(self) -> dict:
            length = int(self.headers.get("Content-Length") or 0)
            if not length:
                return {}
            return json.loads(self.rfile.read(length))

        def do_GET(self):
            parsed = urlparse(self.path)
            if parsed.path == "/quote":
                mode = parse_qs(parsed.query).get("mode", ["brief"])[0]
                self._json(200, gate.quote(mode))
            elif parsed.path in ("/", "/index.html"):
                page = WEB_DIR / "index.html"
                body = page.read_bytes() if page.exists() else b""
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            else:
                self._json(404, {"error": "not found"})

        def do_POST(self):
            try:
                if self.path == "/pay":
                    self._json(200, gate.pay(self._body()["quote_id"]).to_dict())
                elif self.path == "/wring":
                    body = self._body()
                    self._json(
                        200,
                        gate.call(
                            body["input"],
                            body.get("mode", "brief"),
                            payment=body.get("receipt"),
                        ),
                    )
                else:
                    self._json(404, {"error": "not found"})
            except PaymentRequired as exc:
                self._json(402, {"error": "payment_required", "quote": exc.quote})
            except Exception as exc:  # noqa: BLE001
                self._json(500, {"error": str(exc)})

        def log_message(self, *args):  # quiet
            pass

    return Handler


def serve(port: int = 8770, gate: TollGate | None = None) -> ThreadingHTTPServer:
    server = ThreadingHTTPServer(("127.0.0.1", port), make_handler(gate or TollGate()))
    return server


def main() -> None:  # pragma: no cover
    import sys

    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8770
    server = serve(port)
    print(f"toll bridge listening on http://127.0.0.1:{port}")
    server.serve_forever()


if __name__ == "__main__":  # pragma: no cover
    main()
