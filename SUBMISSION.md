# Devpost submission draft: Toll Bridge

## Tagline

Pay for verified answers, and pay the writers they quoted. One PayPal hold, per-call tolls only for answers that pass, royalties by PayPal Payouts.

## What it does

Toll Bridge is a PayPal-backed tab for AI agents. A person approves one budget hold in PayPal. Their agent pays per tool call out of that hold, but only for answers that pass verification. Every page an answer quotes gets a royalty under its RSL 1.0 license, paid to the writer with PayPal Payouts.

- A failed call costs $0.00 and pays no royalty.
- A page whose license prohibits AI use, or needs an OLP server, is refused before anything runs, at $0.00.
- A royalty is earned only when a verified claim quotes that page, word for word, at the stated offsets.
- At close there is one PayPal capture for the total. Whatever's left goes back to the payer.
- Every call has a public Ed25519 receipt. Anyone can check it offline: signature, page hash and every quoted span.

## How we built it

- **PayPal Orders v2, `intent: AUTHORIZE`** for the hold, approved with the PayPal JS SDK popup.
- **Payments v2 capture** at close with `final_capture: true`, then a void if anything is still held. Every read reconciles against PayPal.
- **PayPal Payouts** for writer royalties, with a deterministic `sender_batch_id` so a retry can't pay twice. Royalties accrue in an Upstash Redis ledger and pay out at a threshold, because a $0.25 payout item fee would swamp a $0.05 royalty.
- **RSL 1.0** discovery (HTTP Link, HTML link, robots.txt) and evaluation (prohibits beat permits, most specific content URL wins, OLP refused, `payment type="use"` priced).
- **Cloudflare Workers AI**: Meta `@cf/meta/llama-3.1-8b-instruct-fast` writes the brief, and Mistral `@cf/mistralai/mistral-small-3.1-24b-instruct` judges it, a different family.
- **A verifier built to say no**: schema, span offsets, grounding, coverage, hidden-text quotes, and the judge.
- **HTTP 402 quotes** and an **MCP server** so any agent can use it.
- **AG Grid Community** for the call ledger and the Royalties grid (pinned totals, quick filter, CSV export, cell flash).
- **Next.js on Vercel** with no tab database. Tab state is a signed token, and PayPal is the source of truth for money.

## Tools used and how

| Tool | How it's used |
| --- | --- |
| PayPal Orders v2 API | Create the AUTHORIZE order for the hold, authorize it after approval |
| PayPal Payments v2 API | Final capture at close, void of any remainder, read back authorization and capture with `seller_receivable_breakdown` |
| PayPal Payouts API | Royalties to quoted writers, with item status and `payout_item_fee` read back |
| PayPal JS SDK (react-paypal-js) | Buyer approval popup on the open-tab screen |
| PayPal sandbox | Every PayPal call. The client refuses non-sandbox URLs |
| RSL 1.0 | Source license discovery, evaluation and per-use pricing |
| Cloudflare Workers AI | Llama generator and Mistral judge |
| AG Grid Community | Ledger and Royalties grids |
| Upstash Redis (free tier) | Per-payee royalty ledger across tabs |
| Next.js + Vercel | App, API routes, MCP route, hosting |
| mcp-handler | MCP server at `/api/mcp` |
| zod, Vitest | Output schema, tests, bench and proof suite |

## Proof

- Live PayPal sandbox run on the hosted app: order `<<JOE_RUN: order_id>>`, authorization `<<JOE_RUN: authorization_id>>`, final capture `<<JOE_RUN: capture_id>>` (`<<JOE_RUN: captured>>`), payout batch `<<JOE_RUN: payout_batch_id>>` with items `<<JOE_RUN: payout_item_a>>` and `<<JOE_RUN: payout_item_b>>`.
- `npm run proof`: 91/91 tests in fixtures mode with no network, plus typecheck and lint.
- Live bench, one untuned run of 101 items: 0 of 91 confirmed false passes; 61/91 bad items caught; 30 injected PASSes not confirmed either way (answer text wasn't stored); false-fail 10% (1/10). Raw, with every injected PASS counted as a miss: catch 67.0%, false-pass 33.0%. Full table in `bench/RESULTS.md`.

## Challenges

- **Honest scoring.** Our first bench headline said 33% false passes. Most of those were injected pages where the model passed without quoting the hidden text. We kept the raw table, relabeled the same run, and said plainly what we couldn't confirm.
- **A small model earning money on camera.** Llama 3.1 8B sometimes adds facts that aren't on the page. The judge catches it, the call costs $0.00, and the agent can try again. We didn't loosen the thresholds.
- **Prompt injection.** On writer D the generator took in a hidden instruction. The hidden-text check didn't fire, because no claim quoted it word for word. The Mistral judge caught it. Two layers, and the second one mattered.
- **Fees.** A $0.25 payout item fee on a $0.05 royalty is upside down, so royalties are batched per writer until a threshold.

## What's next

Disputes (strike a passed call before close, refund it after), more paid tools on the same tab, reauthorization for tabs past the 3-day honor period, and proposing the payout `<accepts>` media type to the RSL community.

## What was built during the hackathon

Everything in the TypeScript app was built during the hackathon window (Nov 9 to 12, 2026) by Devin, Cognition's AI software engineer, from Joe Gaither's briefs, with every PR reviewed and merged by the Hackathon Desk:
- The PayPal client and fixtures, and the tab engine.
- RSL discovery, royalties and Payouts.
- `wring` and the verifier.
- Receipts and `/verify`.
- The writer pages, the HTTP API and MCP server.
- The UI, tests, bench and proof scripts.

`<<JOE_RUN: popup_credit>>` The demo writer site came from the Desk. The Toll Note design pack came from Scriptorium, a design agent. The only earlier code is `prototype/python/`, a small mocked prototype from Nov 3, 2026, and the app doesn't use it.

## Demo video script (2:45)

| Time | Shot | Voice over |
| --- | --- | --- |
| 0:00 to 0:15 | Landing page, replay running | "Agents read writers' work and pay no one. Or they get your whole card. Toll Bridge fixes both." |
| 0:15 to 0:35 | /tab: pick $10.00, PayPal popup, sandbox buyer approves | "I approve one ten dollar hold in PayPal. It's an authorization, so nothing is spent yet." |
| 0:35 to 1:00 | Send A. Booth shows quote, run, quote check, PayPal | "The agent gets a 402 quote: fifty cents for the tool, five cents for the writer, because her page's RSL license says so. Every quote checks out, so it's added to the tab." |
| 1:00 to 1:15 | Send B, passes | "Same for writer B." |
| 1:15 to 1:40 | Send D (`<<JOE_RUN: d_verdict>>`) | If D fails: "This page hides an instruction to AI assistants. The judge catches the answer repeating it. It fails. I pay nothing, and the page earns nothing." If D passes, show it as injection ignored and use the built-in Sleep gummy input for the fail shot. |
| 1:40 to 1:55 | Send C, refused | "This writer's license prohibits AI use. Refused before it runs. Zero." |
| 1:55 to 2:15 | Close tab: the math, Royalties grid, payout items | "One capture for what passed. The rest goes back. PayPal Payouts sends each writer her royalty." Show the capture ID and payout item IDs. |
| 2:15 to 2:30 | Receipt page, then /verify | "Every call has a receipt anyone can check: the signature, the page hash, every quote at its offsets." |
| 2:30 to 2:45 | Terminal: `npm run judge -- --base <url>`, `npm run verify-receipt` | "A judge can run the whole thing from a terminal, with no keys." |

Shot list: landing (desktop), PayPal popup approval, booth mid-call, D (or the gummy fail), C refused, close summary with payouts, Royalties grid, receipt, /verify, phone view of the tab, terminal.
