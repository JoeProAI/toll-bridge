import { createHmac } from "node:crypto";
import { toValue } from "./money";
import { earnsRoyalty } from "./royalty/ledger";
import type { CallRecord, TabState } from "./tab/types";

// What a call earned and why, in a form anyone can check against the page
// snapshot: offsets into the fetched text, the hashes, the verdict.
export function receiptPayload(tab: TabState, c: CallRecord) {
  return {
    v: 1,
    kind: "toll-bridge.receipt",
    tab_id: tab.id,
    call_id: c.id,
    quote_id: c.qid,
    tool: c.tool,
    input_url: c.source ?? null,
    page_sha256: c.pageSha256 ?? c.inputHash,
    verified_spans: c.spans ?? [],
    verdict: c.verdict,
    score: c.score,
    checks: Object.fromEntries(c.checks),
    reasons: c.reasons,
    rsl_status: c.rsl?.status ?? null,
    license_url: c.rsl?.licenseUrl ?? null,
    policy_hash: c.rsl?.policyHash ?? null,
    generator_model: c.model ?? null,
    judge_model: c.judgeModel ?? null,
    tool_fee: c.verdict === "pass" ? toValue(c.priceCents) : "0.00",
    royalty: earnsRoyalty(c) ? toValue(c.royalty!.cents) : "0.00",
    payee: earnsRoyalty(c) ? c.royalty!.payee : null,
    settlement: tab.settlement ?? "per-call",
    paypal: { order_id: tab.orderId, authorization_id: tab.authorizationId, capture_id: c.captureId ?? null },
    at: c.at,
  };
}

export type ReceiptPayload = ReturnType<typeof receiptPayload>;

// Keys sorted at every level so the signature doesn't depend on key order.
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v as object)
      .sort()
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonicalJson((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}

export function signReceipt(payload: ReceiptPayload, secret: string) {
  const sig = createHmac("sha256", secret).update(canonicalJson(payload)).digest("base64url");
  return { receipt: payload, signature: { alg: "HS256", value: sig } };
}
