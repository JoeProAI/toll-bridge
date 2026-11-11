/* eslint-disable @typescript-eslint/no-explicit-any */
// For judges: drives a hosted Toll Bridge end to end with no local keys.
//   npm run judge -- --base https://toll-bridge-git-main-joeproais-projects.vercel.app
// Live sandbox: prints the PayPal approval link and waits for you to approve the hold.
// Fixtures deploys: the labeled fixture route stands in for the payer.
const arg = (k: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const BASE = (arg("base") ?? process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const BUDGET = arg("budget") ?? "10.00";
const W = "https://joeproai.github.io/toll-bridge-writers";
const CALLS = (arg("calls") ?? `A=${W}/a.html,B=${W}/b.html,D=${W}/d.html,C=${W}/c.html`).split(",").map((s) => [s.slice(0, s.indexOf("=")), s.slice(s.indexOf("=") + 1)] as [string, string]);
const API = "https://api-m.sandbox.paypal.com";

async function call(path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(BASE + path, body === undefined ? { headers } : { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, any> };
}
const say = (...a: unknown[]) => console.log(...a);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ids: [string, string, string][] = [];
const id = (kind: string, v: string | null | undefined, path: string) => v && ids.push([kind, v, `${API}${path}${v}`]);

const cfg = (await call("/api/config")).json;
say(`Toll Bridge at ${BASE}`);
say(`  PayPal: ${cfg.paypal_mode}   model: ${cfg.model_mode} (writer ${cfg.models?.generator}, judge ${cfg.models?.judge})   policy ${cfg.policy_hash ?? "-"}`);
if (cfg.model_mode === "fake") say("  The model is a deterministic fake. Verdicts are scripted, not AI output.");

const opened = await call("/api/tabs", { budget: BUDGET });
if (opened.status !== 201) throw new Error(`couldn't open a tab: ${JSON.stringify(opened.json)}`);
let pending = opened.json.pending_token as string;
id("order", opened.json.order_id, "/v2/checkout/orders/");
if (opened.json.mode === "fixtures") {
  pending = (await call("/api/fixture/approve", { pending_token: pending })).json.pending_token;
  say(`\n[fixtures] hold of ${BUDGET} approved by the fixture stand-in payer (no real PayPal).`);
} else {
  say(`\nApprove the ${BUDGET} USD hold as the sandbox buyer, then come back here:\n\n  ${opened.json.approve_url}\n`);
}
let tab = "";
for (;;) {
  const c = await call("/api/tabs/claim", { pending_token: pending });
  if (c.status === 201) {
    tab = c.json.tab_token;
    id("authorization", c.json.paypal.authorization_id, "/v2/payments/authorizations/");
    say(`Hold authorized: ${c.json.tab.held} USD, authorization ${c.json.paypal.authorization_id}.`);
    break;
  }
  if (c.json.error?.code !== "awaiting_approval") throw new Error(JSON.stringify(c.json));
  await sleep(3000);
}

for (const [label, input] of CALLS) {
  const auth = { authorization: `Bearer ${tab}` };
  const q = await call("/api/tools/wring", { input }, auth);
  if (q.status !== 402) {
    say(`\n${label}: refused, 0.00 charged. ${q.status} ${q.json.error?.code}: ${q.json.error?.message}`);
    if (q.json.tab_token) tab = q.json.tab_token;
    continue;
  }
  const lines = (q.json.quote.lines ?? []).map((l: any) => (l.kind === "royalty" ? `royalty ${l.amount} to ${l.payee?.receiver}` : `tool fee ${l.amount}`)).join(" + ");
  say(`\n${label}: quote ${q.json.quote.price.value} USD (${lines}). RSL ${q.json.quote.rsl?.status ?? "none"}.`);
  const r = await call("/api/tools/wring", { input }, { ...auth, "x-toll-quote": q.json.quote_token });
  if (r.status !== 200) {
    say(`${label}: ${r.status} ${r.json.error?.code}: ${r.json.error?.message}. 0.00 charged.`);
    if (r.json.tab_token) tab = r.json.tab_token;
    continue;
  }
  tab = r.json.tab_token;
  const c = r.json.call;
  if (c.verdict === "pass") say(`${label}: PASS, judge ${c.score}. ${c.charged} owed${c.royalty?.earned ? `, incl. ${c.royalty.amount} royalty to ${c.royalty.payee.receiver}` : ""}. Receipt ${BASE}/receipt/${c.capture_id ?? c.call_id}`);
  else say(`${label}: FAIL, 0.00 charged. ${c.reasons.join("; ")}`);
}

const closed = await call("/api/tab/close", { tab_token: tab });
if (closed.status !== 200) throw new Error(`close failed: ${JSON.stringify(closed.json)}`);
const v = closed.json;
say(`\nClosed. Held ${v.tab.held}, captured ${v.tab.captured}, authorization ${v.paypal.authorization_status}.`);
for (const c of v.paypal.captures ?? []) id("capture", c.id, "/v2/payments/captures/");
if (v.final_capture) say(`Final capture ${v.final_capture.id}: ${v.final_capture.amount}, PayPal fee ${v.final_capture.paypal_fee ?? "-"}, net ${v.final_capture.net ?? "-"}.`);
let payout = v.payout;
for (let i = 0; payout?.payout_batch_id && i < 10 && payout.items.some((it: any) => !it.status || it.status === "PENDING"); i++) {
  await sleep(4000);
  payout = (await call("/api/tab", undefined, { authorization: `Bearer ${v.tab_token}` })).json.payout ?? payout;
}
if (payout) {
  say(`Royalties: ${payout.note}`);
  id("payout batch", payout.payout_batch_id, "/v1/payments/payouts/");
  for (const it of payout.items) {
    say(`  ${it.amount} to ${it.payee.receiver}: item ${it.payout_item_id ?? "-"} ${it.status ?? "pending"}, PayPal fee ${it.payout_item_fee ?? "-"}`);
    id("payout item", it.payout_item_id, "/v1/payments/payouts-item/");
  }
  for (const a of payout.accruing ?? []) say(`  ${a.unpaid} accruing for ${a.payee.receiver} (pays at ${a.threshold})`);
}
if (v.fees) say(`PayPal fees (${opened.json.mode === "fixtures" ? "fixtures" : "sandbox reported"}): total ${v.fees.total}${v.fees.published_rates ? `; published production rate ${v.fees.published_rates.checkout}, Payouts ${v.fees.published_rates.payouts_api_us}` : ""}`);
say(`\nPayPal ${opened.json.mode === "fixtures" ? "fixture" : "sandbox"} IDs (GET with a sandbox app token):`);
for (const [k, val, url] of ids) say(`  ${k.padEnd(14)} ${val}  ${opened.json.mode === "fixtures" ? "" : url}`);
