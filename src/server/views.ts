import { PRICES_CENTS } from "@/lib/config";
import { toValue } from "@/lib/money";
import { reconcile, sealTab, summarize, type Deps } from "@/lib/tab/engine";
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
    charged: c.captureId ? toValue(c.priceCents) : "0.00",
    capture_id: c.captureId ?? null,
    capture_status: c.captureStatus ?? null,
    charge_error: c.chargeError ?? null,
    attempts: c.attempts ?? 1,
    model: c.model,
    at: c.at,
    ms: c.ms,
  };
}

export async function tabView(d: Deps, tab: TabState) {
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
    calls: tab.calls.map(callView),
    prices: Object.fromEntries(Object.entries(PRICES_CENTS).map(([k, v]) => [k, toValue(v)])),
    tab_token: sealTab(d, tab),
  };
}
