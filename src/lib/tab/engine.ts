import { createHash, randomBytes } from "node:crypto";
import type { ChatModel } from "../ai/model";
import { MAX_BUDGET_CENTS, MAX_CALLS_PER_TAB, MIN_INPUT_CHARS, PRICES_CENTS, QUOTE_TTL_MS, type ToolName } from "../config";
import { toCents, toValue } from "../money";
import { approveLink, firstAuthorization, PayPalApiError, type CardSource, type PayPalClient } from "../paypal/client";
import { FixturePayPal } from "../paypal/fixtures";
import { resolveSource, SourceError } from "../tools/source";
import type { Brief } from "../tools/brief";
import { runWring } from "../tools/wring";
import { verify, type Verdict } from "../verify/verifier";
import { seal, unseal } from "./token";
import type { CallRecord, PendingTab, Quote, Reconciled, TabState } from "./types";

export interface Deps {
  paypal: PayPalClient;
  generator: ChatModel;
  judge: ChatModel;
  secret: string;
  baseUrl: string;
  now?: () => Date;
}

export class TollError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

const rid = (prefix: string) => `${prefix}_${randomBytes(9).toString("base64url")}`;
const nowIso = (d: Deps) => (d.now?.() ?? new Date()).toISOString();
export const hashInput = (text: string) => createHash("sha256").update(text).digest("hex");

function syncFixtures(d: Deps, holder: { fx?: TabState["fx"] }) {
  if (d.paypal instanceof FixturePayPal) holder.fx = d.paypal.state;
}

export function sealTab(d: Deps, tab: TabState): string {
  return seal("tab", tab, d.secret);
}
export function openTabToken(secret: string, token: string): TabState {
  return unseal<TabState>("tab", token, secret);
}
export function openPendingToken(secret: string, token: string): PendingTab {
  return unseal<PendingTab>("pending", token, secret);
}

// 1. Open: create an AUTHORIZE order for the budget. The payer approves it in PayPal.
export async function openTab(d: Deps, budgetCents: number, opts: { payer?: "paypal" | "card" } = {}) {
  if (!Number.isInteger(budgetCents) || budgetCents < PRICES_CENTS.wring || budgetCents > MAX_BUDGET_CENTS) {
    throw new TollError(400, "bad_budget", `Budget must be between ${toValue(PRICES_CENTS.wring)} and ${toValue(MAX_BUDGET_CENTS)} USD.`);
  }
  const id = rid("tab");
  const order = await d.paypal.createOrder({
    amount: { currency_code: "USD", value: toValue(budgetCents) },
    referenceId: id,
    customId: id,
    description: `Toll Bridge tab: hold for paid agent tool calls (${toValue(budgetCents)} USD max)`,
    returnUrl: `${d.baseUrl}/open/return`,
    cancelUrl: `${d.baseUrl}/open?cancelled=1`,
    requestId: `order-${id}`,
    payer: opts.payer,
  });
  const pending: PendingTab = { v: 1, id, mode: d.paypal.mode, orderId: order.id, heldCents: budgetCents, createdAt: nowIso(d) };
  syncFixtures(d, pending);
  return { pending, pendingToken: seal("pending", pending, d.secret), orderId: order.id, approveUrl: approveLink(order), status: order.status };
}

// 2. Claim: once approved, authorize the order and turn it into a tab.
// Safe to repeat: a completed order is adopted instead of re-authorized.
export async function claimTab(d: Deps, pending: PendingTab, opts: { card?: CardSource } = {}): Promise<TabState> {
  let order = await d.paypal.getOrder(pending.orderId);
  const waiting = order.status === "CREATED" || order.status === "PAYER_ACTION_REQUIRED";
  if (waiting && !opts.card) {
    throw new TollError(409, "awaiting_approval", "The payer hasn't approved this hold in PayPal yet.", { orderId: order.id });
  }
  if (order.status === "APPROVED" || (waiting && opts.card)) {
    order = await d.paypal.authorizeOrder(pending.orderId, { requestId: `auth-${pending.id}`, card: opts.card });
  }
  const auth = firstAuthorization(order);
  if (!auth) throw new TollError(409, "no_authorization", `Order is ${order.status} with no authorization.`);
  if (auth.status !== "CREATED") {
    throw new TollError(402, "authorization_unusable", `PayPal authorization is ${auth.status}.`, { authorizationId: auth.id });
  }
  const tab: TabState = {
    v: 1,
    id: pending.id,
    mode: pending.mode,
    orderId: order.id,
    authorizationId: auth.id,
    currency: "USD",
    heldCents: toCents(auth.amount?.value ?? toValue(pending.heldCents)),
    status: "open",
    openedAt: nowIso(d),
    expiresAt: auth.expiration_time,
    payer: order.payer?.email_address,
    calls: [],
  };
  syncFixtures(d, tab);
  return tab;
}

// PayPal is the source of truth for money: held, captured, remaining.
export async function reconcile(d: Deps, tab: TabState): Promise<Reconciled> {
  const order = await d.paypal.getOrder(tab.orderId);
  const pu = order.purchase_units?.[0];
  const auth = pu?.payments?.authorizations?.find((a) => a.id === tab.authorizationId);
  const caps = (pu?.payments?.captures ?? []).map((c) => ({
    id: c.id,
    status: c.status,
    cents: c.amount ? toCents(c.amount.value) : 0,
    invoiceId: c.invoice_id,
    at: c.create_time,
  }));
  const held = auth?.amount ? toCents(auth.amount.value) : tab.heldCents;
  const captured = caps.filter((c) => c.status === "COMPLETED" || c.status === "PENDING").reduce((s, c) => s + c.cents, 0);
  const authStatus = auth?.status ?? "UNKNOWN";
  const remaining = authStatus === "CREATED" || authStatus === "PARTIALLY_CAPTURED" ? Math.max(0, held - captured) : 0;
  return {
    orderStatus: order.status,
    authorizationStatus: authStatus,
    heldCents: held,
    capturedCents: captured,
    remainingCents: remaining,
    captures: caps,
    expiresAt: auth?.expiration_time,
    source: d.paypal.mode === "fixtures" ? "fixtures" : "paypal-sandbox",
  };
}

function assertOpen(tab: TabState) {
  if (tab.status !== "open") throw new TollError(410, "tab_closed", "This tab is closed. Its hold was released.");
  if (tab.calls.length >= MAX_CALLS_PER_TAB) throw new TollError(429, "call_limit", `A tab allows ${MAX_CALLS_PER_TAB} calls.`);
}

// 3. Quote: the 402 answer. Prices a call against what's left on the hold.
export async function quote(d: Deps, tab: TabState, tool: ToolName, sourceText: string) {
  assertOpen(tab);
  const price = PRICES_CENTS[tool];
  if (!price) throw new TollError(404, "unknown_tool", `No tool called ${tool}.`);
  const truth = await reconcile(d, tab);
  if (truth.remainingCents < price) {
    throw new TollError(402, "insufficient_hold", `This call costs ${toValue(price)} but only ${toValue(truth.remainingCents)} is left on the hold.`, {
      remaining: toValue(truth.remainingCents),
    });
  }
  const q: Quote = {
    qid: rid("q"),
    tab: tab.id,
    tool,
    priceCents: price,
    inputHash: hashInput(sourceText),
    exp: (d.now?.() ?? new Date()).getTime() + QUOTE_TTL_MS,
  };
  return {
    quote: q,
    quoteToken: seal("quote", q, d.secret),
    price: { currency_code: "USD", value: toValue(price) },
    remaining: { currency_code: "USD", value: toValue(truth.remainingCents) },
    terms: "Charged only if the result passes verification. Failed calls cost nothing.",
  };
}

export interface CallResult {
  tab: TabState;
  record: CallRecord;
  brief: Brief | null;
  verdict: Verdict;
  replayed: boolean;
  sourceText: string;
}

// 4. Call: run the tool, verify, capture only on PASS.
export async function callTool(d: Deps, tab: TabState, quoteToken: string, rawInput: string): Promise<CallResult> {
  const t0 = Date.now();
  let q: Quote;
  try {
    q = unseal<Quote>("quote", quoteToken, d.secret);
  } catch {
    throw new TollError(402, "bad_quote", "That quote isn't valid. Ask for a new one.");
  }
  if (q.tab !== tab.id) throw new TollError(402, "bad_quote", "That quote belongs to a different tab.");
  const prior = tab.calls.find((c) => c.qid === q.qid);
  if (prior) {
    return { tab, record: prior, brief: null, verdict: { pass: prior.verdict === "pass", score: prior.score, checks: [], reasons: prior.reasons }, replayed: true, sourceText: "" };
  }
  assertOpen(tab);
  if ((d.now?.() ?? new Date()).getTime() > q.exp) throw new TollError(402, "quote_expired", "That quote expired. Ask for a new one.");

  let source: { text: string; url?: string };
  try {
    source = await resolveSource(rawInput);
  } catch (e) {
    throw new TollError(422, "bad_source", e instanceof SourceError ? e.message : "Couldn't read that input.");
  }
  if (hashInput(source.text) !== q.inputHash) throw new TollError(402, "quote_mismatch", "The input changed after it was quoted. Ask for a new quote.");
  if (source.text.length < MIN_INPUT_CHARS) throw new TollError(422, "input_too_short", `Give wring at least ${MIN_INPUT_CHARS} characters.`);

  const truth = await reconcile(d, tab);
  if (truth.remainingCents < q.priceCents) {
    throw new TollError(402, "insufficient_hold", `Only ${toValue(truth.remainingCents)} is left on the hold.`, { remaining: toValue(truth.remainingCents) });
  }

  let brief: Brief | null = null;
  let verdict: Verdict;
  let model: string | undefined;
  let attempts = 1;
  try {
    // One self-repair attempt if the mechanical checks fail. The judge's
    // verdict is final. Either way the agent pays only for a passing result.
    let out = await runWring(d.generator, source.text);
    verdict = await verify(source.text, out.brief, d.judge);
    if (!verdict.pass && verdict.checks.some((c) => c.name !== "judge" && !c.pass)) {
      attempts = 2;
      out = await runWring(d.generator, source.text, verdict.reasons);
      verdict = await verify(source.text, out.brief, d.judge);
    }
    brief = out.brief;
    model = out.model;
  } catch (e) {
    verdict = { pass: false, score: 0, checks: [], reasons: [`the tool failed to run: ${(e as Error).message}`.slice(0, 160)] };
  }

  const record: CallRecord = {
    id: rid("call"),
    qid: q.qid,
    tool: q.tool,
    priceCents: q.priceCents,
    verdict: verdict.pass ? "pass" : "fail",
    score: verdict.score,
    checks: verdict.checks.map((c) => [c.name, c.pass]),
    reasons: verdict.reasons.slice(0, 3).map((r) => r.slice(0, 160)),
    title: (brief?.title || source.text.slice(0, 60)).slice(0, 80),
    inputHash: q.inputHash,
    source: source.url,
    model,
    attempts,
    at: nowIso(d),
    ms: 0,
  };

  if (verdict.pass) {
    try {
      const cap = await d.paypal.captureAuthorization(tab.authorizationId, {
        amount: { currency_code: "USD", value: toValue(q.priceCents) },
        finalCapture: false,
        invoiceId: `${tab.id}-${q.qid}`.slice(0, 127),
        noteToPayer: `Toll Bridge: ${q.tool} result passed checks (score ${verdict.score}/10)`,
        requestId: `cap-${tab.id}-${q.qid}`,
      });
      record.captureId = cap.id;
      record.captureStatus = cap.status;
    } catch (e) {
      record.chargeError = e instanceof PayPalApiError ? `${e.issue ?? e.status}` : (e as Error).message.slice(0, 120);
      brief = null;
    }
  }
  record.ms = Date.now() - t0;
  const next: TabState = { ...tab, calls: [...tab.calls, record] };
  syncFixtures(d, next);
  return { tab: next, record, brief, verdict, replayed: false, sourceText: source.text };
}

// 5. Close: void whatever is still held. Captures stay; the rest goes back.
export async function closeTab(d: Deps, tab: TabState) {
  if (tab.status === "closed") return { tab, truth: await reconcile(d, tab), voided: false };
  const before = await reconcile(d, tab);
  let action: "void" | "none" = "none";
  if (before.authorizationStatus === "CREATED" || before.authorizationStatus === "PARTIALLY_CAPTURED") {
    await d.paypal.voidAuthorization(tab.authorizationId, { requestId: `void-${tab.id}` });
    action = "void";
  }
  const truth = await reconcile(d, tab);
  const next: TabState = {
    ...tab,
    status: "closed",
    closedAt: nowIso(d),
    closeAction: action,
    voidedCents: action === "void" ? truth.heldCents - truth.capturedCents : 0,
  };
  syncFixtures(d, next);
  return { tab: next, truth, voided: action === "void" };
}

export function summarize(tab: TabState, truth: Reconciled) {
  const passed = tab.calls.filter((c) => c.verdict === "pass");
  const failed = tab.calls.filter((c) => c.verdict === "fail");
  return {
    tab_id: tab.id,
    mode: tab.mode,
    status: tab.status,
    order_id: tab.orderId,
    authorization_id: tab.authorizationId,
    authorization_status: truth.authorizationStatus,
    held: toValue(truth.heldCents),
    captured: toValue(truth.capturedCents),
    remaining: toValue(truth.remainingCents),
    voided: tab.status === "closed" ? toValue(tab.voidedCents ?? 0) : "0.00",
    calls: tab.calls.length,
    passed: passed.length,
    failed: failed.length,
    not_charged: toValue(failed.reduce((s, c) => s + c.priceCents, 0)),
    expires_at: truth.expiresAt,
    truth_source: truth.source,
  };
}
