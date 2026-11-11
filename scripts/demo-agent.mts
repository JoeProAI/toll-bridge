/* eslint-disable @typescript-eslint/no-explicit-any */
// Scripted agent: opens a tab, runs three paid calls, closes the tab.
// The one human step is approving the hold in PayPal (fixtures mode skips it).
//   BASE_URL=http://localhost:3000 npm run demo
//   BUDGET=2.00 INPUTS=seawall,outage,gummies npm run demo
import { DEMO_INPUTS } from "../src/lib/demo/inputs";

const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const BUDGET = process.env.BUDGET ?? "2.00";
const picks = (process.env.INPUTS ?? "seawall,outage,gummies").split(",");

async function api(path: string, body: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(BASE + path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  return { status: res.status, json: (await res.json()) as Record<string, any> };
}
const say = (...a: unknown[]) => console.log("agent>", ...a);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const opened = await api("/api/tabs", { budget: BUDGET });
if (opened.status !== 201) throw new Error(JSON.stringify(opened.json));
say(`asked for a ${BUDGET} USD hold. PayPal order ${opened.json.order_id} (${opened.json.mode})`);
let pending = opened.json.pending_token as string;

if (opened.json.mode === "fixtures") {
  pending = (await api("/api/fixture/approve", { pending_token: pending })).json.pending_token;
  say("fixtures mode: hold approved by the stand-in payer");
} else {
  say(`waiting for a human to approve the hold:\n\n    ${opened.json.approve_url}\n`);
}

let tabToken = "";
for (;;) {
  const c = await api("/api/tabs/claim", { pending_token: pending });
  if (c.status === 201) {
    tabToken = c.json.tab_token;
    say(`authorized. authorization ${c.json.paypal.authorization_id}, held ${c.json.tab.held}`);
    break;
  }
  if (c.json.error?.code !== "awaiting_approval") throw new Error(JSON.stringify(c.json));
  await sleep(3000);
}

for (const id of picks) {
  const input = DEMO_INPUTS.find((d) => d.id === id)?.text ?? id;
  const auth = { authorization: `Bearer ${tabToken}` };
  const q = await api("/api/tools/wring", { input }, auth);
  if (q.status !== 402) {
    say(`no quote for ${id}: ${q.json.error?.message}`);
    break;
  }
  say(`${id}: quoted ${q.json.quote.price.value} USD (${q.json.quote.remaining.value} left on the hold)`);
  const r = await api("/api/tools/wring", { input }, { ...auth, "x-toll-quote": q.json.quote_token });
  if (r.status !== 200) throw new Error(JSON.stringify(r.json));
  tabToken = r.json.tab_token;
  const call = r.json.call;
  if (call.verdict === "pass") say(`${id}: PASS score ${call.score}. captured ${call.charged} as ${call.capture_id}. "${call.title}"`);
  else say(`${id}: FAIL, not charged. ${call.reasons.join("; ")}`);
}

const closed = await api("/api/tab/close", { tab_token: tabToken });
const t = closed.json.tab;
say(`closed. held ${t.held}, captured ${t.captured}, voided ${t.voided}. authorization is ${t.authorization_status}`);
