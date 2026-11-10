# Toll Bridge — Wringer Lite

Pay-per-call agent tool. Another AI agent finds `wring`, pays a nickel through
PayPal (Orders v2 authorize/capture shapes, sandbox only), and gets back a
tight, structured result: summary, claims with source spans, open questions,
confidence note.

**Everything runs with zero keys.** PayPal is mocked in-memory with identical
response shapes; the sandbox runner falls back to a local runner; the default
extraction model is a deterministic heuristic (no LLM call).

## Layout

```
toll_bridge/
  core.py        wring(input, mode): chunk -> extract -> merge -> format
  models.py      Model protocol, HeuristicModel (default), FakeModel (tests)
  schema.py      WrungResult JSON schema + validator
  toll.py        TollGate: quote -> pay -> call, refund-on-error
  payments.py    PayPalClient protocol, MockPayPalClient, PayPalHttpClient
  runner.py      LocalRunner, DaytonaRunner (real SDK, mocked in tests)
  ledger.py      MemoryLedger + JsonlLedger
  mcp_server.py  MCP tools over stdio JSON-RPC (tools/list, tools/call)
  http_server.py GET /quote, POST /pay, POST /wring, GET / demo
tests/           20 tests, no network, no keys
web/index.html   toll-booth demo page
scripts/demo_agent.py  end-to-end no-keys demo
```

## Quickstart (no keys)

```bash
cd rigs/toll-bridge
python3 -m unittest discover -s tests -v     # all green
python3 scripts/demo_agent.py                # simulated agent pays the toll
python3 -m toll_bridge.http_server 8770      # then open http://127.0.0.1:8770
```

MCP over stdio: `python3 -m toll_bridge.mcp_server` — tools are
`wring_quote`, `wring_pay`, `wring`.

## The toll

`POST /wring` (or MCP `wring`) without a receipt returns **402** with a quote:
`{quote_id, amount: {currency_code: USD, value: 0.05}, flow: ...}`.
`POST /pay {quote_id}` runs the PayPal handshake — `create_order` →
`authorize` → `capture` — and returns a receipt `{quote_id, order_id,
capture_id}`. Retry the call with the receipt; the wring job runs and the
ledger records quote, payment id, cost, and result hash. If the wring fails
after capture, the capture is refunded and the ledger logs `refund`.

## What a real run needs

- `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENV=sandbox` — swaps
  `MockPayPalClient` for `PayPalHttpClient` (`api-m.sandbox.paypal.com`).
- `DAYTONA_API_KEY` — swaps `LocalRunner` for `DaytonaRunner`, which creates a
  sandbox via the Daytona SDK, uploads `toll_bridge/`, and `code_run`s wring.
- A real LLM behind `models.Model` to replace `HeuristicModel`.

No dependencies beyond Python 3.10+ stdlib for the mocked path; the real path
needs `pip install daytona`.
