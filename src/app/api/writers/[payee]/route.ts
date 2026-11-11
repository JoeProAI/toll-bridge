import { NextResponse, type NextRequest } from "next/server";
import { toValue } from "@/lib/money";
import { kvFromEnv } from "@/lib/royalty/kv";
import { payeeKey, payeeLedger } from "@/lib/royalty/ledger";
import type { RslPayee } from "@/lib/rsl";
import { depsFor } from "@/server/deps";
import { errorResponse } from "@/server/http";
import type { PayoutItem } from "@/lib/paypal/types";

export const dynamic = "force-dynamic";

export function payeeFromParam(raw: string): RslPayee {
  const v = decodeURIComponent(raw).trim();
  const m = v.match(/^(EMAIL|PAYPAL_ID):(.+)$/i);
  if (m) return { recipient_type: m[1].toUpperCase() as RslPayee["recipient_type"], receiver: m[2] };
  return v.includes("@") ? { recipient_type: "EMAIL", receiver: v } : { recipient_type: "PAYPAL_ID", receiver: v };
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ payee: string }> }) {
  try {
    const payee = payeeFromParam((await ctx.params).payee);
    const kv = kvFromEnv();
    if (!kv) {
      return NextResponse.json({
        payee,
        ledger: null,
        note: "No royalty ledger is configured here, so each tab pays its writers when it closes. Those payouts are on the tab's close summary.",
      });
    }
    const led = await payeeLedger(kv, payeeKey(payee));
    const d = depsFor();
    const batches = new Map<string, PayoutItem[]>();
    for (const id of new Set(led.payouts.map((p) => p.batchId).filter((x): x is string => !!x))) {
      try {
        batches.set(id, (await d.paypal.getPayoutBatch(id)).items ?? []);
      } catch {
        batches.set(id, []);
      }
    }
    return NextResponse.json({
      payee,
      ledger: "kv",
      accrued: toValue(led.accruedCents),
      paid: toValue(led.paidCents),
      unpaid: toValue(Math.max(0, led.accruedCents - led.paidCents)),
      earnings: led.earnings.map((e) => ({ tab_id: e.tabId, call_id: e.callId, source_url: e.sourceUrl ?? null, page_sha256: e.pageSha256 ?? null, policy_hash: e.policyHash ?? null, amount: toValue(e.cents), sentences: e.sentences, at: e.at })),
      payouts: led.payouts.map((p) => {
        const item = p.batchId ? batches.get(p.batchId)?.find((i) => i.payout_item.sender_item_id === p.senderItemId) : undefined;
        return {
          tab_id: p.tabId,
          amount: toValue(p.cents),
          sender_batch_id: p.senderBatchId,
          payout_batch_id: p.batchId ?? null,
          payout_item_id: item?.payout_item_id ?? null,
          status: item?.transaction_status ?? null,
          transaction_id: item?.transaction_id ?? null,
          payout_item_fee: item?.payout_item_fee?.value ?? null,
        };
      }),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
