import { createHash, randomBytes } from "node:crypto";
import type { ChatModel } from "../ai/model";
import { MAX_BUDGET_CENTS, MAX_CALLS_PER_TAB, MIN_INPUT_CHARS, PRICES_CENTS, QUOTE_TTL_MS, type SettlementMode, type ToolName } from "../config";
import { toCents, toValue } from "../money";
import { approveLink, firstAuthorization, PayPalApiError, type CardSource, type PayPalClient } from "../paypal/client";
import { FixturePayPal } from "../paypal/fixtures";
import type { Kv } from "../royalty/kv";
import { earnsRoyalty, pollPayout, settleRoyalties } from "../royalty/ledger";
import { checkRsl, publicRsl, rslAllowsRun, type RslCheck, type RslFetcher } from "../rsl";
import { resolveSource, SourceError, type ResolvedSource } from "../tools/source";
import { normalize, spanMatches } from "../tools/spans";
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
  // Fetches pages and RSL files. Tests inject recorded fixtures.
  fetcher?: RslFetcher;
  kv?: Kv | null;
  thresholdCents?: number;
  // Settlement for new tabs. Defaults to per-call; the app passes settlementMode().
  settlement?: SettlementMode;
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

// A source whose RSL terms forbid our use. Refused before anything runs, at 0.00.
export class RefusedError extends TollError {
  constructor(
    readonly tab: TabState,
    readonly record: CallRecord,
  ) {
    super(451, "rsl_refused", `Refused before running, charged 0.00: ${record.rsl?.reason ?? "the page's license forbids AI input"}`, { price: "0.00" });
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
  const pending: PendingTab = { v: 1, id, mode: d.paypal.mode, orderId: order.id, heldCents: budgetCents, settlement: d.settlement ?? "per-call", createdAt: nowIso(d) };
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
    settlement: pending.settlement ?? "per-call",
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

export const settlementOf = (tab: TabState): SettlementMode => tab.settlement ?? "per-call";

// Owed by passing calls but not captured yet (tab settlement).
export function accruedCents(tab: TabState): number {
  return tab.calls.filter((c) => c.verdict === "pass" && !c.captureId && !c.chargeError).reduce((s, c) => s + (c.chargeCents ?? c.priceCents), 0);
}

export interface Inspected {
  source: ResolvedSource;
  rsl?: RslCheck;
}

// Reads the input once: page text for the tool, RSL terms for the royalty.
export async function inspectSource(d: Deps, rawInput: string): Promise<Inspected> {
  let source: ResolvedSource;
  try {
    source = await resolveSource(rawInput, d.fetcher);
  } catch (e) {
    throw new TollError(422, "bad_source", e instanceof SourceError ? e.message : "Couldn't read that input.");
  }
  if (!source.url || !source.page) return { source };
  const rsl = await checkRsl(source.url, { fetcher: d.fetcher, page: source.page });
  return { source, rsl };
}

function rslSummary(r: RslCheck): NonNullable<CallRecord["rsl"]> {
  return { status: r.status, reason: r.reason, licenseUrl: r.licenseUrl, via: r.via, policyHash: r.policyHash };
}

// 3. Quote: the 402 answer. Tool fee plus the source's RSL royalty, priced
// against what's left on the hold. Prohibited and OLP sources are refused.
export async function quote(d: Deps, tab: TabState, tool: ToolName, rawInput: string) {
  assertOpen(tab);
  const price = PRICES_CENTS[tool];
  if (!price) throw new TollError(404, "unknown_tool", `No tool called ${tool}.`);
  const { source, rsl } = await inspectSource(d, rawInput);
  const rslRec = rsl ? rslSummary(rsl) : undefined;
  if (rsl && !rslAllowsRun(rsl)) {
    const record: CallRecord = {
      id: rid("call"),
      qid: rid("q"),
      tool,
      priceCents: 0,
      verdict: "refused",
      score: 0,
      checks: [],
      reasons: [rsl.reason.slice(0, 160)],
      title: (source.url ?? "").slice(0, 80),
      inputHash: hashInput(source.text),
      source: source.url,
      rsl: rslRec,
      chargeCents: 0,
      at: nowIso(d),
      ms: 0,
    };
    const next: TabState = { ...tab, calls: [...tab.calls, record] };
    syncFixtures(d, next);
    throw new RefusedError(next, record);
  }
  const royalty = rsl?.status === "paid_use" && rsl.payee && rsl.royaltyCents ? { cents: rsl.royaltyCents, payee: rsl.payee, policyHash: rsl.policyHash, licenseUrl: rsl.licenseUrl } : undefined;
  const total = price + (royalty?.cents ?? 0);
  const truth = await reconcile(d, tab);
  const available = Math.max(0, truth.remainingCents - accruedCents(tab));
  if (available < total) {
    throw new TollError(402, "insufficient_hold", `This call costs ${toValue(total)} but only ${toValue(available)} is left on the hold.`, {
      remaining: toValue(available),
    });
  }
  const q: Quote = {
    qid: rid("q"),
    tab: tab.id,
    tool,
    priceCents: price,
    inputHash: hashInput(source.text),
    sourceUrl: source.url,
    rsl: rslRec,
    royalty,
    exp: (d.now?.() ?? new Date()).getTime() + QUOTE_TTL_MS,
  };
  return {
    quote: q,
    quoteToken: seal("quote", q, d.secret),
    price: { currency_code: "USD", value: toValue(total) },
    lines: [
      { kind: "tool_fee", tool, amount: toValue(price) },
      ...(royalty ? [{ kind: "royalty", amount: toValue(royalty.cents), payee: royalty.payee, license_url: royalty.licenseUrl, policy_hash: royalty.policyHash, terms: "RSL 1.0 payment type=use" }] : []),
    ],
    rsl: rsl ? publicRsl(rsl) : null,
    remaining: { currency_code: "USD", value: toValue(available) },
    settlement: settlementOf(tab),
    terms: royalty
      ? "Charged only if the result passes verification. The royalty is paid to the writer only if a claim quoting their page passes the span check. Failed calls cost nothing."
      : "Charged only if the result passes verification. Failed calls cost nothing.",
    source: { text: source.text, url: source.url },
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

  let source: ResolvedSource;
  try {
    source = await resolveSource(rawInput, d.fetcher);
  } catch (e) {
    throw new TollError(422, "bad_source", e instanceof SourceError ? e.message : "Couldn't read that input.");
  }
  if (hashInput(source.text) !== q.inputHash) throw new TollError(402, "quote_mismatch", "The input changed after it was quoted. Ask for a new quote.");
  if (source.text.length < MIN_INPUT_CHARS) throw new TollError(422, "input_too_short", `Give wring at least ${MIN_INPUT_CHARS} characters.`);

  const total = q.priceCents + (q.royalty?.cents ?? 0);
  const truth = await reconcile(d, tab);
  const available = Math.max(0, truth.remainingCents - accruedCents(tab));
  if (available < total) {
    throw new TollError(402, "insufficient_hold", `Only ${toValue(available)} is left on the hold.`, { remaining: toValue(available) });
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
  verdict = hiddenTextCheck(verdict, brief, source.hidden, source.text);
  const spans = (brief?.claims ?? [])
    .filter((c) => c.span && spanMatches(source.text, c.span, c.quote))
    .slice(0, 6)
    .map((c) => ({ start: c.span!.start, end: c.span!.end, quote: source.text.slice(c.span!.start, c.span!.end) }));

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
    judgeModel: verdict.judge?.model ?? d.judge.name,
    attempts,
    rsl: q.rsl,
    royalty: q.royalty,
    pageSha256: q.inputHash,
    spans: verdict.pass ? spans : [],
    at: nowIso(d),
    ms: 0,
  };

  record.chargeCents = verdict.pass ? q.priceCents + (earnsRoyalty(record) ? record.royalty!.cents : 0) : 0;
  if (verdict.pass && settlementOf(tab) === "per-call") {
    try {
      const cap = await d.paypal.captureAuthorization(tab.authorizationId, {
        amount: { currency_code: "USD", value: toValue(record.chargeCents) },
        finalCapture: false,
        invoiceId: `${tab.id}-${q.qid}`.slice(0, 127),
        noteToPayer: `Toll Bridge: ${q.tool} result passed checks (score ${verdict.score}/10)`,
        requestId: `cap-${tab.id}-${q.qid}`,
      });
      record.captureId = cap.id;
      record.captureStatus = cap.status;
      const fee = cap.seller_receivable_breakdown?.paypal_fee;
      if (fee) record.captureFeeCents = toCents(fee.value);
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

// 5. Close. Per-call: void whatever is still held. Tab: one final capture of
// everything the passing calls owe, then void only if PayPal still holds a
// remainder (a final capture releases it). Then pay the writers.
export async function closeTab(d: Deps, tab: TabState) {
  if (tab.status === "closed") {
    const payout = tab.payout ? await pollPayout(royaltyDeps(d), tab.payout, tab) : undefined;
    return { tab: payout ? { ...tab, payout } : tab, truth: await reconcile(d, tab), voided: false };
  }
  let next: TabState = { ...tab };
  const owed = accruedCents(tab);
  if (settlementOf(tab) === "tab" && owed > 0) {
    const before = await reconcile(d, tab);
    // A stale token may arrive after the close already captured: adopt that capture.
    const prior = before.captures.find((c) => c.invoiceId === `${tab.id}-close`);
    const open = before.authorizationStatus === "CREATED" || before.authorizationStatus === "PARTIALLY_CAPTURED";
    if (prior || open) {
      const passed = tab.calls.filter((c) => c.verdict === "pass").length;
      const cap = prior ? await d.paypal.getCapture(prior.id) : await d.paypal.captureAuthorization(tab.authorizationId, {
        amount: { currency_code: "USD", value: toValue(owed) },
        finalCapture: true,
        invoiceId: `${tab.id}-close`.slice(0, 127),
        noteToPayer: `Toll Bridge: ${passed} verified call${passed === 1 ? "" : "s"}. The rest of the hold is released.`,
        requestId: `cap-${tab.id}-close`,
      });
      const b = cap.seller_receivable_breakdown;
      next.finalCapture = {
        id: cap.id,
        status: cap.status,
        cents: cap.amount ? toCents(cap.amount.value) : owed,
        feeCents: b?.paypal_fee ? toCents(b.paypal_fee.value) : undefined,
        netCents: b?.net_amount ? toCents(b.net_amount.value) : undefined,
      };
      next.calls = tab.calls.map((c) => (c.verdict === "pass" && !c.captureId ? { ...c, captureId: cap.id, captureStatus: cap.status } : c));
    }
  }
  const mid = await reconcile(d, next);
  let voided = false;
  if (mid.authorizationStatus === "CREATED" || mid.authorizationStatus === "PARTIALLY_CAPTURED") {
    await d.paypal.voidAuthorization(tab.authorizationId, { requestId: `void-${tab.id}` });
    voided = true;
  }
  const truth = await reconcile(d, next);
  next = {
    ...next,
    status: "closed",
    closedAt: nowIso(d),
    closeAction: next.finalCapture ? (voided ? "final-capture+void" : "final-capture") : voided ? "void" : "none",
    // What went back to the payer, whether by void or by the final capture's release.
    voidedCents: Math.max(0, truth.heldCents - truth.capturedCents),
  };
  const payout = await settleRoyalties(royaltyDeps(d), next);
  if (payout) next.payout = payout;
  syncFixtures(d, next);
  return { tab: next, truth, voided };
}

export function royaltyDeps(d: Deps) {
  return { paypal: d.paypal, kv: d.kv ?? null, thresholdCents: d.thresholdCents ?? 500, now: d.now };
}

const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// A 5-word phrase from text hidden from readers that shows up anywhere in the
// answer (title, summary, claims) but nowhere in the visible text.
export function hiddenPhraseIn(brief: Brief | null, hidden: string[], text: string): string | null {
  if (!brief || !hidden.length) return null;
  const hn = hidden.map(words).filter(Boolean);
  let visible = ` ${words(text)} `;
  for (const h of hn) visible = visible.split(h).join(" ");
  const ans = ` ${words([brief.title, brief.summary, ...brief.claims.map((c) => `${c.text} ${c.quote}`)].join(" "))} `;
  for (const h of hn) {
    const w = h.split(" ");
    for (let i = 0; i + 5 <= w.length; i++) {
      const g = ` ${w.slice(i, i + 5).join(" ")} `;
      if (ans.includes(g) && !visible.includes(g)) return g.trim();
    }
  }
  return null;
}

// Text a reader can't see (off-screen, display:none) is how a prompt injection
// gets into a brief. Quoting it, or carrying its words into the answer, fails the call.
export function hiddenTextCheck(verdict: Verdict, brief: Brief | null, hidden: string[], text = ""): Verdict {
  if (!brief || !hidden.length) return verdict;
  const hiddenNorm = hidden.map(normalize);
  const bad = brief.claims.map((c, i) => ({ i, q: normalize(c.quote) })).filter(({ q }) => q.length >= 12 && hiddenNorm.some((h) => h.includes(q) || q.includes(h)));
  const phrase = text ? hiddenPhraseIn(brief, hidden, text) : null;
  if (!bad.length && !phrase) return { ...verdict, checks: [...verdict.checks, { name: "hidden", pass: true, detail: "nothing in the answer comes from hidden text" }] };
  const detail = bad.length
    ? `claim ${bad.map((b) => b.i + 1).join(", ")}: quotes text hidden from readers (likely a prompt injection)`
    : `the answer repeats text hidden from readers ("${phrase}"), likely a prompt injection`;
  return { ...verdict, pass: false, score: verdict.pass ? 0 : verdict.score, checks: [...verdict.checks, { name: "hidden", pass: false, detail }], reasons: [detail, ...verdict.reasons] };
}

export function summarize(tab: TabState, truth: Reconciled) {
  const passed = tab.calls.filter((c) => c.verdict === "pass");
  const failed = tab.calls.filter((c) => c.verdict === "fail");
  const refused = tab.calls.filter((c) => c.verdict === "refused");
  const royalties = tab.calls.filter(earnsRoyalty).reduce((s, c) => s + c.royalty!.cents, 0);
  const owed = tab.status === "open" ? accruedCents(tab) : 0;
  return {
    tab_id: tab.id,
    mode: tab.mode,
    status: tab.status,
    order_id: tab.orderId,
    authorization_id: tab.authorizationId,
    authorization_status: truth.authorizationStatus,
    held: toValue(truth.heldCents),
    captured: toValue(truth.capturedCents),
    remaining: toValue(Math.max(0, truth.remainingCents - owed)),
    accrued: toValue(owed),
    settlement: settlementOf(tab),
    royalties_earned: toValue(royalties),
    close_action: tab.closeAction ?? null,
    voided: tab.status === "closed" ? toValue(tab.voidedCents ?? 0) : "0.00",
    calls: tab.calls.length,
    passed: passed.length,
    failed: failed.length,
    refused: refused.length,
    not_charged: toValue(failed.reduce((s, c) => s + c.priceCents, 0)),
    expires_at: truth.expiresAt,
    truth_source: truth.source,
  };
}
