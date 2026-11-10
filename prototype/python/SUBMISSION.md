# Submission Kit — Toll Bridge (Wringer Lite)

Prize page: https://paypalaihackathon.devpost.com/ (deadline Nov 12, 2026, 3:00 PM ET)

## 200-word pitch

AI agents are about to buy things from each other, and nobody has built the
corner store. Toll Bridge is a pay-per-call micro-tool: an agent discovers
`wring` over MCP or HTTP, gets a 402 response with a $0.05 quote, pays through
a real PayPal Orders v2 handshake (authorize → capture), and receives a
wrung result — summary, claims with source spans, open questions, confidence.
Unpaid calls get the quote; failed wrings auto-refund. A ledger records every
quote, payment id, cost, and result hash, so the toll booth has books. The
whole thing runs with zero keys: PayPal is mocked with identical API shapes,
the Daytona sandbox falls back to a local runner, and the default model is a
deterministic heuristic — so judges see the full agent-commerce loop in one
command. Wringer Lite shows the shape of agentic commerce: machine-readable
pricing, machine-payable tolls, machine-checkable receipts. The bridge is
open. Exact change only.

## 90-second demo script

1. (0:00) `python3 scripts/demo_agent.py` — an agent calls `wring`, gets 402
   with a quote.
2. (0:15) Agent "pays": mocked PayPal order → authorize → capture; receipt
   printed with capture id.
3. (0:35) Agent retries with the receipt → wrung result prints (summary,
   claims with spans, open questions, confidence).
4. (0:55) Ledger prints: quote, payment, wring entries with cost and result
   hash — point out the refund path test.
5. (1:10) `python3 -m toll_bridge.http_server 8770` → demo page: approach the
   booth, pay $0.05, lamp goes green, cross the bridge, JSON lands.
6. (1:25) `python -m unittest discover -s tests -v` — 20 passing tests.

## Prize rules checklist (from the Devpost page)

- [x] Meaningfully integrates a PayPal technology — Orders v2
      authorize/capture/refund shapes (mocked, swap-in real client).
- [x] Meaningfully incorporates AI — agent-callable tool; LLM behind
      `Model` interface (heuristic default keeps tests deterministic).
- [x] Working prototype / judges can run it — zero-key quickstart above.
- [x] Documented — README with run steps.
- [ ] Public open-source code repository — MIT LICENSE included; Joe lifts
      `rigs/toll-bridge/` into its own public repo.
- [ ] Public YouTube demo video under 3 minutes — Joe records from the demo
      script above.
- [ ] Text description on Devpost — adapt the pitch.

## Open questions for Joe

- MCP `wring` requires a receipt argument — should unpaid `wring` calls also
  auto-return a fresh quote in the error data? (They do today.)
- Real PayPal authorizations expire (~3 days honored window); lite version
  doesn't model expiry — worth noting on the submission?
