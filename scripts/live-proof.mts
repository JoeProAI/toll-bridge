// Live PayPal SANDBOX proof: opens a real tab, runs 3 calls (2 should pass,
// 1 should fail), closes it, and writes proof/receipts.json + proof/PROOF.md
// with IDs read back from PayPal. Never runs against production.
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { DEMO_INPUTS } from "../src/lib/demo/inputs";
import { paypalCredentials } from "../src/lib/config";
import { toValue } from "../src/lib/money";
import { PayPalApiError } from "../src/lib/paypal/client";
import { callTool, claimTab, closeTab, openTab, quote, reconcile, summarize, TollError } from "../src/lib/tab/engine";
import type { PendingTab, TabState } from "../src/lib/tab/types";
import { depsFor } from "../src/server/deps";

if (!paypalCredentials()) {
  console.log("live proof skipped: PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET not set");
  process.exit(0);
}
if ((process.env.PAYPAL_ENV ?? "sandbox") !== "sandbox") throw new Error("PAYPAL_ENV must be sandbox");

const d = depsFor({ mode: "live-sandbox", baseUrl: process.env.PUBLIC_BASE_URL ?? "http://localhost:3000" });
const BUDGET = 200;
const log = (...a: unknown[]) => console.log("proof>", ...a);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const events: { at: string; step: string; detail: unknown }[] = [];
const ev = (step: string, detail: unknown) => {
  events.push({ at: new Date().toISOString(), step, detail });
  log(step, typeof detail === "string" ? detail : JSON.stringify(detail));
};

// Sandbox technique: authorize the order with a sandbox test card as the
// payment source, so no browser is needed. If the sandbox app can't take
// cards, fall back to a buyer approval URL and wait for it.
async function getTab(): Promise<{ tab: TabState; approval: "sandbox-card" | "buyer-approval" }> {
  const card = {
    number: process.env.PROOF_CARD_NUMBER ?? "4111111111111111",
    expiry: process.env.PROOF_CARD_EXPIRY ?? "2030-12",
    security_code: process.env.PROOF_CARD_CVV ?? "123",
    name: "Toll Bridge Proof",
  };
  if (process.env.PROOF_APPROVAL !== "buyer") {
    const o = await openTab(d, BUDGET, { payer: "card" });
    ev("order.created", { order_id: o.orderId, status: o.status, approval: "sandbox-card" });
    try {
      return { tab: await claimTab(d, o.pending, { card }), approval: "sandbox-card" };
    } catch (e) {
      ev("card.authorize.failed", e instanceof PayPalApiError ? { status: e.status, issue: e.issue, debug_id: e.debugId } : String(e));
    }
  }
  const o = await openTab(d, BUDGET);
  ev("order.created", { order_id: o.orderId, status: o.status, approval: "buyer-approval" });
  console.log(`\nApprove the ${toValue(BUDGET)} USD hold with a sandbox buyer account:\n\n    ${o.approveUrl}\n\nWaiting up to 15 minutes...`);
  const pending: PendingTab = o.pending;
  const until = Date.now() + 15 * 60_000;
  while (Date.now() < until) {
    try {
      return { tab: await claimTab(d, pending), approval: "buyer-approval" };
    } catch (e) {
      if (!(e instanceof TollError && e.code === "awaiting_approval")) throw e;
      await sleep(4000);
    }
  }
  throw new Error("timed out waiting for buyer approval");
}

const started = new Date().toISOString();
const got = await getTab();
const approval = got.approval;
let tab = got.tab;
ev("order.authorized", { authorization_id: tab.authorizationId, held: toValue(tab.heldCents) });

const plan = ["seawall", "outage", "gummies"];
interface ProofCall {
  input: string;
  expected: string;
  verdict: string;
  score?: number;
  checks: Record<string, boolean>;
  reasons: string[];
  attempts: number;
  model?: string;
  price: string;
  charged: string;
  title?: string;
  at: string;
  paypal_capture: { id: string; status: string; amount: unknown; final_capture?: boolean; invoice_id?: string; create_time?: string } | null;
}
const calls: ProofCall[] = [];
for (const id of plan) {
  const input = DEMO_INPUTS.find((x) => x.id === id)!;
  const q = await quote(d, tab, "wring", input.text);
  ev("quote", { input: id, quote_id: q.quote.qid, price: q.price.value, remaining: q.remaining.value, http_status: 402 });
  const r = await callTool(d, tab, q.quoteToken, input.text);
  tab = r.tab;
  const capture = r.record.captureId ? await d.paypal.getCapture(r.record.captureId) : null;
  ev(r.record.verdict === "pass" ? "call.pass.captured" : "call.fail.not_charged", {
    input: id,
    expected: input.expect,
    score: r.record.score,
    capture_id: r.record.captureId ?? null,
    reasons: r.record.reasons,
  });
  calls.push({
    input: id,
    expected: input.expect,
    verdict: r.record.verdict,
    score: r.record.score,
    checks: Object.fromEntries(r.record.checks),
    reasons: r.record.reasons,
    attempts: r.record.attempts ?? 1,
    model: r.record.model,
    price: toValue(r.record.priceCents),
    charged: r.record.captureId ? toValue(r.record.priceCents) : "0.00",
    title: r.record.title,
    at: r.record.at,
    paypal_capture: capture && { id: capture.id, status: capture.status, amount: capture.amount, final_capture: capture.final_capture, invoice_id: capture.invoice_id, create_time: capture.create_time },
  });
}

const mid = await reconcile(d, tab);
ev("before.close", { authorization_status: mid.authorizationStatus, captured: toValue(mid.capturedCents), remaining: toValue(mid.remainingCents) });
const closed = await closeTab(d, tab);
tab = closed.tab;
const auth = await d.paypal.getAuthorization(tab.authorizationId);
const order = await d.paypal.getOrder(tab.orderId);
const s = summarize(tab, closed.truth);
ev("tab.closed", { voided: s.voided, authorization_status: auth.status });

const sha = (() => {
  try {
    return execSync("git rev-parse HEAD").toString().trim();
  } catch {
    return "unknown";
  }
})();
const testsFile = "node_modules/.cache/toll-bridge/tests.json";
const tests = existsSync(testsFile) ? JSON.parse(readFileSync(testsFile, "utf8")) : null;
const matched = calls.every((c) => c.verdict === c.expected);

const receipts = {
  kind: "live-sandbox",
  paypal_base: "https://api-m.sandbox.paypal.com",
  started_at: started,
  finished_at: new Date().toISOString(),
  git_sha: sha,
  approval_technique: approval,
  tests,
  tab: { id: tab.id, order_id: tab.orderId, order_status: order.status, authorization_id: tab.authorizationId, authorization_status: auth.status },
  math: { held: s.held, captured: s.captured, voided: s.voided, not_charged: s.not_charged, passed: s.passed, failed: s.failed },
  expectation_met: matched,
  calls,
  events,
};
mkdirSync("proof", { recursive: true });
writeFileSync("proof/receipts.json", JSON.stringify(receipts, null, 2) + "\n");

const row = (c: (typeof calls)[number]) =>
  `| ${c.input} | ${c.expected} | ${c.verdict.toUpperCase()} | ${c.score ?? "-"} | ${c.charged} | ${c.paypal_capture?.id ?? "none"} | ${c.paypal_capture?.status ?? "-"} | ${c.reasons.join("; ").replace(/\|/g, "/") || "-"} |`;
const md = `# Live sandbox proof

This run hit the real PayPal sandbox (\`api-m.sandbox.paypal.com\`). Every ID below was read back from PayPal after the run.

- Run: ${receipts.started_at} to ${receipts.finished_at}
- Git SHA: \`${sha}\`
- Hold approved by: ${approval === "sandbox-card" ? "sandbox test card as the order's payment source (no browser)" : "sandbox buyer account in PayPal"}
- Tests in the same proof run: ${tests ? `${tests.passed}/${tests.total} passed across ${tests.files} files` : "not recorded (run \`npm run proof\`)"}
- Expectation (2 pass, 1 fail): ${matched ? "met" : "NOT met, see verdicts"}

## PayPal objects

| What | ID | Status |
| --- | --- | --- |
| Order (intent AUTHORIZE) | \`${tab.orderId}\` | ${order.status} |
| Authorization (the hold) | \`${tab.authorizationId}\` | ${auth.status} |
${calls.filter((c) => c.paypal_capture).map((c) => `| Capture for ${c.input} | \`${c.paypal_capture!.id}\` | ${c.paypal_capture!.status} |`).join("\n")}

## Math

| Held | Captured | Voided | Not charged (failed calls) |
| --- | --- | --- | --- |
| ${s.held} | ${s.captured} | ${s.voided} | ${s.not_charged} |

## Calls

| Input | Expected | Verdict | Score | Charged | Capture ID | Capture status | Reasons |
| --- | --- | --- | --- | --- | --- | --- | --- |
${calls.map(row).join("\n")}

## Timeline

${events.map((e) => `- ${e.at} \`${e.step}\` ${JSON.stringify(e.detail)}`).join("\n")}
`;
writeFileSync("proof/PROOF.md", md);
log(`wrote proof/receipts.json and proof/PROOF.md. held ${s.held}, captured ${s.captured}, voided ${s.voided}`);
if (!matched) process.exitCode = 2;
