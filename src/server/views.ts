import { PRICES_CENTS } from "@/lib/config";
import { toValue } from "@/lib/money";
import { signReceipt, receiptPayload } from "@/lib/receipt";
import { receiptKey } from "./deps";
import { earnsRoyalty, pollPayout, type PayoutPlan } from "@/lib/royalty/ledger";
import { reconcile, royaltyDeps, sealTab, summarize, type Deps } from "@/lib/tab/engine";
import type { CallRecord, TabState } from "@/lib/tab/types";

export function callView(c: CallRecord) {
  return {
    call_id: c.id,
    quote_id: c.qid,
    tool: c.tool,
    price: toValue(c.priceCents),
    verdict: c.verdict,
    score: c.score,
    checks: Object.fromEntries(c.checks),
    reasons: c.reasons,
    title: c.title,
    source_url: c.source,
    charged: c.verdict === "pass" && !c.chargeError ? toValue(c.chargeCents ?? c.priceCents) : "0.00",
    tool_fee: toValue(c.priceCents),
    royalty: c.royalty ? { amount: toValue(c.royalty.cents), earned: earnsRoyalty(c), payee: c.royalty.payee, license_url: c.royalty.licenseUrl, policy_hash: c.royalty.policyHash } : null,
    rsl: c.rsl ?? null,
    page_sha256: c.pageSha256 ?? null,
    verified_spans: c.spans ?? [],
    judge_model: c.judgeModel ?? null,
    capture_fee: c.captureFeeCents != null ? toValue(c.captureFeeCents) : null,
    capture_id: c.captureId ?? null,
    capture_status: c.captureStatus ?? null,
    charge_error: c.chargeError ?? null,
    attempts: c.attempts ?? 1,
    model: c.model,
    at: c.at,
    ms: c.ms,
  };
}

// Published production rates (paypal.com/us/business/paypal-business-fees,
// "Last Updated: November 4, 2026"). Shown next to sandbox numbers, never added to them.
export const PUBLISHED_RATES = {
  label: "published production rate",
  source: "https://www.paypal.com/us/business/paypal-business-fees",
  checkout: "3.49% + 0.49 USD",
  payouts_api_us: "0.25 USD per item",
};

function payoutView(p: PayoutPlan | undefined) {
  if (!p) return null;
  return {
    ledger: p.ledger,
    note:
      p.ledger === "kv"
        ? "Royalties accrue per writer across tabs and pay out once a writer's balance reaches the threshold."
        : "No royalty ledger is configured, so this tab pays its own royalties right away.",
    sender_batch_id: p.senderBatchId,
    payout_batch_id: p.batchId ?? null,
    batch_status: p.batchStatus ?? null,
    error: p.error ?? null,
    items: p.items.map((i) => ({
      payee: i.payee,
      amount: toValue(i.cents),
      sender_item_id: i.senderItemId,
      payout_item_id: i.itemId ?? null,
      status: i.status ?? null,
      transaction_id: i.transactionId ?? null,
      payout_item_fee: i.feeCents != null ? toValue(i.feeCents) : null,
    })),
    accruing: p.accruing.map((a) => ({ payee: a.payee, unpaid: toValue(a.unpaidCents), threshold: toValue(a.thresholdCents) })),
  };
}

function feesView(tab: TabState) {
  const captureFees = [
    ...tab.calls.filter((c) => c.captureFeeCents != null).map((c) => ({ capture_id: c.captureId!, cents: c.captureFeeCents! })),
    ...(tab.finalCapture?.feeCents != null ? [{ capture_id: tab.finalCapture.id, cents: tab.finalCapture.feeCents }] : []),
  ];
  const payoutFees = (tab.payout?.items ?? []).filter((i) => i.feeCents != null).map((i) => ({ payout_item_id: i.itemId ?? null, cents: i.feeCents! }));
  const total = [...captureFees, ...payoutFees].reduce((s, f) => s + f.cents, 0);
  const reported = captureFees.length + payoutFees.length > 0;
  return {
    source: tab.mode === "fixtures" ? "fixtures (modeled on what the sandbox charged)" : "reported by the PayPal sandbox",
    capture_fees: captureFees.map((f) => ({ capture_id: f.capture_id, paypal_fee: toValue(f.cents) })),
    payout_item_fees: payoutFees.map((f) => ({ payout_item_id: f.payout_item_id, fee: toValue(f.cents) })),
    total: toValue(total),
    published_rates: reported && total > 0 ? null : PUBLISHED_RATES,
  };
}

export async function tabView(d: Deps, tabIn: TabState) {
  let tab = tabIn;
  if (tab.payout && (tab.payout.items.some((i) => !i.status || ["PENDING", "UNCLAIMED", "ONHOLD"].includes(i.status)) || !tab.payout.batchId)) {
    tab = { ...tab, payout: await pollPayout(royaltyDeps(d), tab.payout, tab) };
  }
  const truth = await reconcile(d, tab);
  return {
    tab: summarize(tab, truth),
    paypal: {
      order_id: tab.orderId,
      order_status: truth.orderStatus,
      authorization_id: tab.authorizationId,
      authorization_status: truth.authorizationStatus,
      captures: truth.captures.map((c) => ({ id: c.id, status: c.status, amount: toValue(c.cents), invoice_id: c.invoiceId, at: c.at })),
    },
    final_capture: tab.finalCapture ? { id: tab.finalCapture.id, status: tab.finalCapture.status, amount: toValue(tab.finalCapture.cents), paypal_fee: tab.finalCapture.feeCents != null ? toValue(tab.finalCapture.feeCents) : null, net: tab.finalCapture.netCents != null ? toValue(tab.finalCapture.netCents) : null } : null,
    payout: payoutView(tab.payout),
    fees: feesView(tab),
    calls: tab.calls.map(callView),
    prices: Object.fromEntries(Object.entries(PRICES_CENTS).map(([k, v]) => [k, toValue(v)])),
    tab_token: sealTab(d, tab),
  };
}

export function receiptFor(d: Deps, tab: TabState, c: CallRecord, snapshot?: string) {
  return signReceipt(receiptPayload(tab, c), receiptKey(), d.baseUrl, snapshot);
}
