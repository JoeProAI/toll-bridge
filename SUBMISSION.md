# Devpost submission draft: Toll Bridge

## Tagline

Give your agent a PayPal tab, not your card. Approve one hold; pay only for tool calls that pass their checks.

## What it does

Toll Bridge is a PayPal-backed tab for AI agents. A person approves one budget hold in PayPal. Their agent then pays per tool call out of that hold, and PayPal only captures a call's toll when the result passes verification. Failed calls cost nothing. When the tab closes, the remainder is voided back to the payer.

The first paid tool is `wring`: it turns a long messy page into a brief where every claim is tied to an exact quote from the source. A separate verifier checks the schema, that every quote really sits at its stated offsets, that each claim says what its quote says, coverage rules, and an LLM-judge rubric. If the result fails, nothing is captured.

## How we built it

- **PayPal Orders v2, `intent: AUTHORIZE`** for the one-time hold, approved with the PayPal JS SDK.
- **Payments v2 authorization capture** with a per-call `amount` and `final_capture: false`, so one hold pays for many verified calls. `PayPal-Request-Id` makes each capture idempotent.
- **Payments v2 void** on close, with held, captured and voided math read back from PayPal.
- **Cloudflare Workers AI** (Llama 3.1 8B instruct fast) for both the generator and the judge prompts, behind an interface with a deterministic fake for tests.
- **Next.js on Vercel** with no database: state lives in a signed token, and PayPal is the source of truth for money.
- **HTTP 402 quotes** and an **MCP server** (Streamable HTTP) so any agent can use it.
- **AG Grid Community** for the ledger of calls, verdicts and PayPal capture IDs.

## Tools used and how

| Tool | How it's used |
| --- | --- |
| PayPal Orders v2 API | Create the AUTHORIZE order for the hold, authorize it after approval |
| PayPal Payments v2 API | Partial captures per verified call, void on close, read back authorization and capture details |
| PayPal JS SDK (react-paypal-js) | Buyer approval button on the open-tab screen |
| PayPal sandbox | Every PayPal call. The client refuses non-sandbox URLs |
| Cloudflare Workers AI | `wring` generator and the verifier's judge prompt |
| AG Grid Community | Ledger grid with verdicts, amounts, capture IDs, receipt links |
| Next.js + Vercel | App, API routes, MCP route, hosting |
| mcp-handler + MCP SDK | The MCP server at `/api/mcp` |
| zod, Vitest | Output schema, tests and the proof suite |

## Challenges

- Making a small model reliable enough to earn money on camera. The verifier is strict on purpose. The tool gets one retry with the checker's reasons and drops claims it can't quote, and the judge's call stays final.
- Keeping it serverless and free without a database. Signed tokens carry IDs; PayPal carries the money truth.
- Idempotency: a replayed quote must never capture twice, even if an agent reuses an old tab token. A deterministic `PayPal-Request-Id` per quote handles it.

## What's next

More paid tools on the same tab, per-tool price lists, reauthorization for longer tabs past the 3-day honor period, and a PayPal Agent Toolkit flavor of the MCP server.

## What was built during the hackathon

Everything in the TypeScript app was built during the hackathon window (Nov 9 to 11, 2026): the PayPal client and fixtures, the tab engine, `wring` and the verifier, the HTTP API, the MCP server, the UI, the tests and the proof script. The only earlier code is `prototype/python/`, a small mocked prototype from Nov 3, 2026. It used immediate capture plus refunds and isn't used by the app.

## Demo video script (2:45)

| Time | Shot | Voice over |
| --- | --- | --- |
| 0:00 to 0:15 | Landing page, replay meter running | "Agents that spend money get your whole card, or you click approve on every charge. Toll Bridge is the middle." |
| 0:15 to 0:35 | Scroll to Hold, Earn, Void stubs | "One PayPal hold. Each call is checked before PayPal captures its toll. Whatever's left is voided." |
| 0:35 to 1:00 | /tab: pick $2.00, click PayPal, sandbox buyer approves | "I approve a two dollar hold. That's an authorization, so nothing is spent yet." Show the order and authorization IDs. |
| 1:00 to 1:30 | Click "Run the demo agent". Console shows 402 quote, then pass | "The agent asks for a quote, gets a 402 with the price, pays with the quote. The brief passes every check, so PayPal captures fifty cents." Meter chunk bites. |
| 1:30 to 1:50 | Second pass, then the gummy page bounces | "This sales page hides an instruction to claim FDA approval. The verifier catches it. It bounces. I pay nothing." |
| 1:50 to 2:10 | Ledger and a receipt | "Every call is in the ledger with its verdict and PayPal capture ID, read back from PayPal." |
| 2:10 to 2:30 | Close tab: meter sends the rest home, the math table | "I close the tab. PayPal voids the last dollar. Held two, captured one, voided one." |
| 2:30 to 2:45 | Terminal: `npm run demo` or MCP config, then `npm run proof` | "Same thing over plain HTTP or MCP, and one command proves it." |

Shot list: landing (desktop), open tab with PayPal popup, run view mid-call, bounce moment close-up, ledger, receipt page, close summary, phone view of the run screen, terminal with proof output.
