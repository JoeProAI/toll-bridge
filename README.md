# Toll Bridge

**A PayPal tab for AI agents.** You approve one budget hold in PayPal. Your agent pays per tool call out of that hold, and PayPal only captures a call's toll when the result passes its checks. A failed call costs nothing. Whatever's left is voided when the tab closes.

Live: _pending deploy_ (see [the PR](https://github.com/JoeProAI/toll-bridge/pull/1) for status). PayPal **sandbox only**. No real money moves.

## Why

Agents that spend money today either get a whole card (scary) or a human approves every charge (useless). Toll Bridge sits in the middle and uses real PayPal primitives:

1. **Hold.** The person approves one budget in PayPal. It's an Orders v2 order with `intent: AUTHORIZE`, so the money is held, not spent.
2. **Earn.** Every tool call gets a quote first (HTTP 402). The tool runs, then a verifier checks the result. Only a PASS triggers `POST /v2/payments/authorizations/{id}/capture` for that call's price, with `final_capture: false`, so more captures can follow. A FAIL captures nothing.
3. **Void.** Closing the tab calls `POST /v2/payments/authorizations/{id}/void`. Captured tolls stay. The rest goes back.

Every captured cent has a receipt with its PayPal capture ID, read back from PayPal.

## The paid tool: `wring`

Long messy text or a URL in. A brief out: a title, a summary, and 3 to 8 claims, each with an exact quote from the source and its character span. It runs on Cloudflare Workers AI (`@cf/meta/llama-3.1-8b-instruct-fast`).

The verifier is separate from the generator and is built to say no:

| Check | Fails when |
| --- | --- |
| schema | the JSON doesn't match the brief schema |
| spans | a quote isn't found at its stated offsets in the source (span forgery) |
| grounding | a claim says things its quote and nearby sentence don't |
| coverage | too few or too many claims, overlapping quotes, quotes bunched in one corner, summary too long |
| judge | a second LLM prompt scores faithfulness below 7 or the mean below 6.5 |

If the mechanical checks fail, `wring` gets one retry with the reasons. The judge's call is final. The demo input "Sleep gummy sales page" hides an instruction to claim FDA approval, and it's there so the not-charged path shows up every time.

## Try it

### No keys at all (fixtures)

```bash
npm install
PAYPAL_MODE=fixtures MODEL_MODE=fake npm run dev
# open http://localhost:3000/tab
```

Fixtures mode swaps PayPal for a recorded-shape fake (orders, authorizations, partial captures, voids, idempotency, the real error names), and the hold state rides inside the signed tab token. The UI says "PayPal: fixtures" so nobody mistakes it for the real thing. Drop `MODEL_MODE=fake` and set `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_AI_API_TOKEN` to use the real model.

### Live PayPal sandbox

```bash
export PAYPAL_MODE=live-sandbox PAYPAL_ENV=sandbox
export PAYPAL_CLIENT_ID=... PAYPAL_CLIENT_SECRET=...   # a sandbox REST app
export CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_AI_API_TOKEN=...
export TAB_SECRET=$(openssl rand -hex 32)
npm run dev
```

The open-tab page shows the PayPal button. Log in with a sandbox buyer account to approve the hold. The client only ever talks to `api-m.sandbox.paypal.com` and refuses any other base URL.

Sandbox buyer login for judges: _to be added_.

### Point an agent at it

Plain HTTP:

```bash
# 1. open a tab (the human approves at approve_url), then claim it
curl -s -X POST $HOST/api/tabs -d '{"budget":"2.00"}'
curl -s -X POST $HOST/api/tabs/claim -d '{"pending_token":"..."}'   # returns tab_token

# 2. ask for the tool: 402 with a quote
curl -s -X POST $HOST/api/tools/wring -H "authorization: Bearer $TAB" -d '{"input":"https://..."}'

# 3. pay with the quote: runs, verifies, captures only on PASS
curl -s -X POST $HOST/api/tools/wring -H "authorization: Bearer $TAB" -H "x-toll-quote: $QUOTE" -d '{"input":"https://..."}'

# 4. close: voids the rest
curl -s -X POST $HOST/api/tab/close -H "authorization: Bearer $TAB"
```

MCP (Streamable HTTP) at `/api/mcp`, with tools `toll_open_tab`, `toll_fixture_approve`, `toll_claim_tab`, `toll_quote`, `toll_wring`, `toll_tab_status`, `toll_close_tab`:

```json
{ "mcpServers": { "toll-bridge": { "url": "https://<host>/api/mcp" } } }
```

Scripted agent that runs the whole loop (2 pass, 1 fail, close):

```bash
BASE_URL=http://localhost:3000 npm run demo
```

## Proof

```bash
npm run proof
```

It runs typecheck, lint with zero warnings, and the test suite in fixtures mode with `fetch` blocked. The suite covers verifier pass/fail, span forgery, over-budget, double capture and idempotency, void after close, quote expiry and binding, and the live client's request shape against PayPal's published examples. If PayPal sandbox credentials are set, it then runs a live sandbox tab (3 calls, close) and writes `proof/receipts.json` and `proof/PROOF.md` with the real order, authorization, capture and void IDs. Without credentials it says so and leaves `proof/` alone.

## How state works (no database)

Tab state is a signed, compressed token (HMAC-SHA256): an httpOnly cookie for the browser, a Bearer token for agents. It holds IDs and verdicts. Amounts always come from PayPal: every status, quote and close re-reads the order and authorization. That keeps the app on free serverless with nothing to provision. Quotes are signed too, bound to the tab and a hash of the input, and expire in 10 minutes. Captures use a deterministic `PayPal-Request-Id`, so a replayed quote, even with an old tab token, gets the same capture back instead of a second charge.

## PayPal details that matter

- An authorization is valid for 29 days, and its honor period is 3 days. Tabs are meant to be short. The tab shows its expiry.
- Partial captures use `final_capture: false`. A partially captured authorization can still be voided. A fully captured one can't, so closing a used-up tab skips the void.
- A capture over the remaining hold fails with `MAX_CAPTURE_AMOUNT_EXCEEDED`. The app refuses to quote before it gets there.

## Stack

Next.js 16 (App Router, TypeScript) on Vercel, PayPal Orders v2 + Payments v2 REST, PayPal JS SDK (`@paypal/react-paypal-js`), Cloudflare Workers AI, AG Grid Community for the ledger, `mcp-handler` for MCP, zod, Vitest.

`prototype/python/` is the earlier clean-room prototype (mocked PayPal). The TypeScript app replaces it.

License: MIT
