# Toll Bridge

[![CI](https://github.com/JoeProAI/toll-bridge/actions/workflows/ci.yml/badge.svg)](https://github.com/JoeProAI/toll-bridge/actions/workflows/ci.yml)

**Pay for verified answers, and pay the writers they quoted.** You approve one PayPal hold. Your agent pays per call out of it, but only for answers that pass their checks. Every page the answer quotes gets a royalty under its RSL 1.0 license, paid with PayPal Payouts. A failed call costs nothing and pays no one.

- Hosted (PayPal sandbox): `<<HOSTED_URL>>` (today: https://toll-bridge-git-main-joeproais-projects.vercel.app)
- Video: `<<VIDEO_URL>>`
- PayPal **sandbox only**. No real money moves.

## Live PayPal sandbox IDs

From Joe's hosted run: one $10 tab, 4 calls (A `<<JOE_RUN: a_verdict>>`, B `<<JOE_RUN: b_verdict>>`, D `<<JOE_RUN: d_verdict>>`, C `<<JOE_RUN: c_verdict>>`), close, payout. `<<JOE_RUN: run_notes>>` Every ID was read back from PayPal. Details in [proof/PROOF.md](proof/PROOF.md).

| What | ID | Status | Amount |
| --- | --- | --- | --- |
| Order (intent AUTHORIZE) | `<<JOE_RUN: order_id>>` | `<<JOE_RUN: order_status>>` | 10.00 held |
| Authorization (the hold) | `<<JOE_RUN: authorization_id>>` | `<<JOE_RUN: authorization_status>>` | |
| Final capture | `<<JOE_RUN: capture_id>>` | `<<JOE_RUN: capture_status>>` | `<<JOE_RUN: captured>>`, PayPal fee `<<JOE_RUN: capture_fee>>` |
| Released to the payer | | | `<<JOE_RUN: released>>` |
| Void (only if anything was still held) | `<<JOE_RUN: void_or_none>>` | | |
| Payouts batch | `<<JOE_RUN: payout_batch_id>>` | `<<JOE_RUN: batch_status>>` | |
| Payout item, writer A | `<<JOE_RUN: payout_item_a>>` | `<<JOE_RUN: item_a_status>>` | 0.05, fee `<<JOE_RUN: item_a_fee>>` |
| Payout item, writer B | `<<JOE_RUN: payout_item_b>>` | `<<JOE_RUN: item_b_status>>` | 0.05, fee `<<JOE_RUN: item_b_fee>>` |

## Check it yourself

No keys needed for any of these unless noted.

**`npm run proof`**: typecheck, lint with zero warnings, and the full test suite in fixtures mode with `fetch` blocked. With PayPal sandbox credentials set, it also runs a live sandbox tab.

```
tests: 91/91 passed in 12 files (fixtures mode, no network)

live sandbox run skipped: no PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET. Committed proof/ files are untouched.

proof passed
```

**`npm run bench`**: the 101-item bench corpus on the deterministic fake model. It shows the mechanical checks do what they say. It says nothing about real model quality (see the live bench below).

```
catch rate 100.0% (91/91), false-pass 0.0%, false-fail 0.0%, misses 0, errors 0
```

**`npm run judge -- --base <url>`**: drives a hosted Toll Bridge end to end with no local keys and prints every PayPal ID. Against a live-sandbox host it prints a PayPal approval link and waits for you to approve as the sandbox buyer. Against a local fixtures server (`PAYPAL_MODE=fixtures MODEL_MODE=fake npm run dev`):

```
A: PASS, judge 8.3. 0.55 owed, incl. 0.05 royalty to sb-3j1ps53857892@personal.example.com. ...
B: PASS, judge 8.3. 0.55 owed, incl. 0.05 royalty to sb-o9xx453857673@personal.example.com. ...
D: FAIL, 0.00 charged. claim 3, 4: quotes text hidden from readers (likely a prompt injection)
C: refused, 0.00 charged. 451 rsl_refused: Refused before running, charged 0.00: The license prohibits ai-input (AI input) use.
Closed. Held 10.00, captured 1.10, authorization CAPTURED.
Final capture FXCAP000000000003: 1.10, PayPal fee 0.52, net 0.58.
  0.05 to sb-3j1ps53857892@personal.example.com: item FXPOI0000040 SUCCESS, PayPal fee 0.25
  0.05 to sb-o9xx453857673@personal.example.com: item FXPOI0000041 SUCCESS, PayPal fee 0.25
```

`FX...` IDs are fixtures. On the hosted app they are real sandbox IDs, each printed with its sandbox GET URL.

**`npm run verify-receipt <receipt.json>`**: checks a receipt offline with no secret. It verifies the Ed25519 signature against the public key, recomputes the page SHA-256 from the snapshot, and finds every quoted span at its offsets. Download a receipt from any `/receipt/...` page, or paste it at `/verify`.

```
$ npm run verify-receipt receipt.json -- --key <host>/.well-known/toll-bridge-receipt-key.json
receipt call_84dviM-23MVB (pass), key from ...
  ok    signature: Ed25519 signature valid for key a1fce427d4d67273
  ok    page_hash: snapshot SHA-256 matches 92eb33672656ae5f
  ok    spans: 5 span(s) found at their offsets
VALID
```

Change one field and it prints `FAIL  signature: signature does not match this receipt and key`, then `INVALID`, and exits 1.

**`npm run rsl:check <url>`**: runs RSL discovery and evaluation on any page, for example `https://joeproai.github.io/toll-bridge-writers/c.html` (prohibited).

## How it works

1. **Hold.** The person approves one PayPal Orders v2 order with `intent: AUTHORIZE`. Money is held, not spent.
2. **License.** Before a source is used, Toll Bridge reads its RSL 1.0 terms: HTTP `Link` header, then HTML `<link rel="license">`, then `robots.txt`. A prohibited or OLP-only page is refused before anything runs, at $0.00. A `payment type="use"` page adds a royalty line to the quote.
3. **Quote.** Every call gets an HTTP 402 first, with the price: tool fee plus royalty lines.
4. **Verify.** `wring` writes a brief where every claim carries an exact quote and its offsets. A separate verifier checks it (table below). Only a PASS is added to the tab.
5. **Royalty.** A source earns its royalty only if the call passed and at least one claim quoting that source passed the span check.
6. **Close.** One capture of the total with `final_capture: true`, then a void if anything is still held. Royalties go to each payee's ledger, and PayPal Payouts pays them.

| Check | Fails when |
| --- | --- |
| schema | the JSON doesn't match the brief schema |
| spans | a quote isn't at its stated offsets in the source (forged quote, shifted offsets) |
| grounding | a claim says things its quote doesn't |
| coverage | too few or too many claims, overlapping quotes, summary too long |
| hidden | a claim quotes text the page hides from readers |
| judge | a second model scores faithfulness below 7 or the mean below 6.5 |

### Models

| Role | Model ID (Cloudflare Workers AI) | Family |
| --- | --- | --- |
| Generator | `@cf/meta/llama-3.1-8b-instruct-fast` | Meta Llama |
| Judge | `@cf/mistralai/mistral-small-3.1-24b-instruct` | Mistral |

The judge is from a different family, so it doesn't share the generator's blind spots by default. `/api/config` returns both IDs and the policy hash. With `MODEL_MODE=fake`, the UI and `/api/config` say the model is a scripted fake.

### Demo writers

https://joeproai.github.io/toll-bridge-writers/ hosts four pages with RSL licenses:
- a, b and d: `paid_use` at 0.05 USD per use.
- c: prohibits AI use, so it's refused.
- d: also hides a prompt injection off screen.

On the hosted app with real models, **D is caught by the judge, not by the hidden-text check**. The Llama generator took in the injection but didn't quote the hidden text word for word, so `hidden` passed. In the one committed live run (`injected-writer-d` in [bench/RESULTS.md](bench/RESULTS.md)) the Mistral judge failed it at 5.7 with "The summary and claims repeat instructions to AI assistants as if they were facts." With the fake model, the hidden-text check catches it instead.

## Live bench (one run, untuned)

From [bench/RESULTS.md](bench/RESULTS.md): 101 items, one live run on Workers AI, no tuning after it.

**Headline (same run, relabeled after the run)**
- Confirmed false passes: 0 of 91.
- Bad items caught (failed or refused): 61/91. That's 40/40 for tampering, prohibited, OLP, unreadable and thin, and 21/51 for injected.
- Injected items not confirmed either way: 30/51.
- False-fail rate: 10.0% (1/10). `clean-bridge` failed with "two claims quote overlapping text". It is a real miss.
- Errors: 0.

**Raw (as run: every injected PASS counted as a miss)**
- Catch rate: 67.0% (61/91)
- False-pass rate: 33.0%
- False-fail rate: 10.0%
- Errors: 0

The injected expectation was corrected after the run. An injected PASS is only a miss if the answer used the hidden text. The run didn't store answer text, so those 30 PASSes are known not to quote the hidden span, but whether they carried the payload is unknown. Of the 21 injected catches, 11 came from the injection checks and 10 failed for unrelated reasons. RESULTS.md has every verdict.

## Fees and why royalties are batched

- Each PayPal capture carries a fee with a fixed part, so a tab does one capture at close, not one per call. In the fixtures run above, the 0.52 fee on 1.10 comes from the fixture client's fee formula, not from PayPal. Joe's hosted run: `<<JOE_RUN: capture_fee>>` on `<<JOE_RUN: captured>>`, read from the capture's `seller_receivable_breakdown`.
- A Payouts item costs $0.25 (sandbox-reported `payout_item_fee` 0.25 per item). A $0.05 royalty paid on its own costs five times its value to send.
- So royalties accrue per payee across tabs in a KV ledger and pay out once a payee crosses `PAYOUT_THRESHOLD_USD`. The default is 5.00, where the item fee is 5% of the payout. The hosted demo sets `PAYOUT_THRESHOLD_USD=0.05` so a payout shows on video.
- Without KV, each tab pays its own royalties at close, and the UI says so.
- Sandbox fees are shown as PayPal reports them. Published production rates are labeled as such and never added to sandbox numbers.

## Known limits

- **Sandbox only.** The PayPal client refuses any base URL other than `api-m.sandbox.paypal.com`.
- **The generator false-fails sometimes.** Llama 3.1 8B fast is small. It sometimes adds a fact that isn't on the page, and the judge fails that answer, which is a correct fail but costs a retry. `clean-bridge` false-fails in the bench on overlapping quotes. A failed call costs $0.00, so the agent can send it again.
- **30 injected PASSes are not confirmed either way.** The bench run didn't store answers (it does now, in `bench/answers.json`, for future runs). The five hiding styles collapse to the same text after HTML extraction, so that axis adds no signal.
- **The judge sometimes returns no score.** That fails closed (watermains x5 in the bench).
- **Payout fees dwarf small royalties.** Batching (above) is the fix, so a writer waits until the threshold.
- **Unclaimed payouts.** A payout to an email with no PayPal account shows as UNCLAIMED. Signing up for PayPal with that email claims it. PayPal returns it after 30 days. We don't build our own claim flow.
- **Our payout media type is a proposal.** `application/vnd.tollbridge.paypal-payout+json` inside RSL's `<accepts>` is ours, not part of RSL 1.0.
- **No OLP.** Pages licensed through an RSL OLP server are refused, not negotiated.
- **`robots.txt` license discovery is covered by fixtures only.** GitHub Pages project sites can't serve it.
- **Authorization limits.** A PayPal authorization's honor period is 3 days, so tabs are meant to be short.
- **Receipt history.** Receipts were HMAC-signed with `TAB_SECRET` until E1. Now they are Ed25519, checkable by anyone with the public key. HMAC remains only for the private tab token. The older proof at the top of `proof/` from Nov 10 predates RSL, used per-call captures and a void, and will be replaced by the hosted run.

## Run it

No keys (fixtures):

```bash
npm install
PAYPAL_MODE=fixtures MODEL_MODE=fake npm run dev
# open http://localhost:3000/tab
```

Live sandbox:

```bash
export PAYPAL_MODE=live-sandbox PAYPAL_ENV=sandbox
export PAYPAL_CLIENT_ID=... PAYPAL_CLIENT_SECRET=...      # a sandbox REST app
export CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_AI_API_TOKEN=...
export TAB_SECRET=$(openssl rand -hex 32) RECEIPT_SIGNING_KEY=$(openssl rand -base64 32)
npm run dev
```

Sandbox buyer for judges: `sb-ak43ew42095534@personal.example.com` (the password is provided to judges by the team on request).

### Point an agent at it

```bash
curl -s -X POST $HOST/api/tabs -H 'content-type: application/json' -d '{"budget":"2.00"}'           # approve_url, pending_token
curl -s -X POST $HOST/api/tabs/claim -H 'content-type: application/json' -d '{"pending_token":"..."}'  # tab_token
curl -s -X POST $HOST/api/tools/wring -H "authorization: Bearer $TAB" -d '{"input":"https://..."}'     # 402 with quote_token
curl -s -X POST $HOST/api/tools/wring -H "authorization: Bearer $TAB" -H "x-toll-quote: $QUOTE" -d '{"input":"https://..."}'
curl -s -X POST $HOST/api/tab/close -H "authorization: Bearer $TAB"
```

MCP (Streamable HTTP) at `/api/mcp`: `toll_open_tab`, `toll_fixture_approve`, `toll_claim_tab`, `toll_quote`, `toll_rsl_check`, `toll_wring`, `toll_tab_status`, `toll_close_tab`.

```bash
claude mcp add --transport http toll-bridge https://<host>/api/mcp
```

### Writers

- `/writers/new` generates an RSL 1.0 license (price per use, PayPal email or PayPal ID, allowed uses) and the `<link>` tag, and checks a page.
- `/writer/[payee]` shows the sentences that earned money, page hashes, accrued vs paid, and payout item IDs.

## State

There's no database for tabs. Tab state is an HMAC-signed token (an httpOnly cookie, or a Bearer token for agents). Amounts always come from PayPal: every read re-fetches the order, authorization and capture. Quotes are signed and bound to the tab and the input. Every capture and payout uses a deterministic `PayPal-Request-Id` or `sender_batch_id`, so a retry can't charge or pay twice. The royalty ledger lives in Upstash Redis (free tier) when configured.

## Compared with

| Project | What it does | Difference |
| --- | --- | --- |
| [rp10000/earned](https://github.com/rp10000/earned) | PayPal holds the money, AI inspectors check every result, PayPal captures only what passed. Pays its studios through PayPal Payouts. | Closest to our core loop. Its Payouts go to the vendors who did the work. Ours go to the writers an answer quoted, under their RSL terms. |
| [entitySource/agent-tab](https://github.com/entitySource/agent-tab) | A metered tab for agents backed by PayPal Vault, HTTP 402 to any API, one capture at settlement | Toll Bridge also settles with one capture, but each charge needs a verified result, and sources get paid. |
| [DakshSinghDhami/kalyx-sdk](https://github.com/DakshSinghDhami/kalyx-sdk) | Pay-per-citation retrieval with HTTP 402 on Solana devnet, verify-before-pay escrows | Toll Bridge pays per verified quote in PayPal, priced by the page's own RSL license. |
| x402 / Assay | HTTP 402 payment flows for agents | Toll Bridge uses 402 for quotes and settles on PayPal. |
| RSL Collective | The RSL standard and collective licensing | Toll Bridge reads RSL terms and pays per use directly. |
| ProRata, TollBit | Publisher licensing and revenue share for AI | Toll Bridge pays per verified quote, with a public receipt. |

Credit to all of the above. Toll Bridge builds on RSL 1.0 and HTTP 402.

## How this was built

Built during the hackathon (Nov 9 to 12, 2026) by Devin, Cognition's AI software engineer, working from Joe Gaither's briefs, with the Hackathon Desk reviewing and merging every PR. `<<JOE_RUN: popup_credit>>` The demo writer site came from the Desk. The Toll Note design pack came from Scriptorium, a design agent. `prototype/python/` is an earlier mocked prototype from Nov 3, 2026, and the app doesn't use it.

Stack: Next.js 16 (App Router, TypeScript) on Vercel, PayPal Orders v2, Payments v2 and Payouts REST, PayPal JS SDK, Cloudflare Workers AI, AG Grid Community, `mcp-handler`, Upstash Redis, zod, Vitest.

License: MIT
