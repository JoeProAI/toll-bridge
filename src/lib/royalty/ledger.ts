import { createHash } from "node:crypto";
import { toCents, toValue } from "../money";
import { existingPayoutBatchId, type PayPalClient } from "../paypal/client";
import type { PayoutBatch } from "../paypal/types";
import type { RslPayee } from "../rsl/types";
import type { CallRecord, TabState } from "../tab/types";
import type { Kv } from "./kv";

export const payeeKey = (p: RslPayee) => `${p.recipient_type}:${p.receiver.trim().toLowerCase()}`;

export interface Earning {
  tabId: string;
  callId: string;
  sourceUrl?: string;
  pageSha256?: string;
  policyHash?: string;
  cents: number;
  sentences: string[];
  at: string;
}

export interface PayoutLine {
  payee: RslPayee;
  cents: number;
  senderItemId: string;
  itemId?: string;
  status?: string;
  feeCents?: number;
  transactionId?: string;
}

export interface PayoutPlan {
  ledger: "kv" | "per-tab";
  senderBatchId: string;
  items: PayoutLine[];
  // Payees whose balance is below the threshold, carried to a later tab.
  accruing: { payee: RslPayee; unpaidCents: number; thresholdCents: number }[];
  batchId?: string;
  batchStatus?: string;
  error?: string;
}

export interface RoyaltyDeps {
  paypal: PayPalClient;
  kv: Kv | null;
  thresholdCents: number;
  now?: () => Date;
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

// Royalties this tab earned: passing calls with a paid_use source and at
// least one claim from it that passed the span check.
export function tabRoyalties(tab: TabState) {
  const by = new Map<string, { payee: RslPayee; cents: number; earnings: Earning[] }>();
  for (const c of tab.calls) {
    if (!earnsRoyalty(c)) continue;
    const k = payeeKey(c.royalty!.payee);
    const row = by.get(k) ?? { payee: c.royalty!.payee, cents: 0, earnings: [] };
    row.cents += c.royalty!.cents;
    row.earnings.push({
      tabId: tab.id,
      callId: c.id,
      sourceUrl: c.source,
      pageSha256: c.pageSha256,
      policyHash: c.royalty!.policyHash,
      cents: c.royalty!.cents,
      sentences: (c.spans ?? []).map((s) => s.quote),
      at: c.at,
    });
    by.set(k, row);
  }
  return by;
}

export function earnsRoyalty(c: CallRecord): boolean {
  return c.verdict === "pass" && !!c.royalty && c.royalty.cents > 0 && (c.spans?.length ?? 0) > 0 && !c.chargeError;
}

// Same tab and payees always give the same id, so a retry can't pay twice.
export function senderBatchIdFor(tabId: string, keys: string[]): string {
  return `tb-${sha(`${tabId}|${[...keys].sort().join(",")}`).slice(0, 28)}`;
}

const K = {
  accrued: (tab: string) => `tb:tab:${tab}:accrued`,
  applied: (tab: string) => `tb:tab:${tab}:paid-applied`,
  logged: (tab: string) => `tb:tab:${tab}:payout-logged`,
  plan: (tab: string) => `tb:tab:${tab}:plan`,
  lock: (p: string) => `tb:lock:${p}`,
  payeeAccrued: (p: string) => `tb:payee:${p}:accrued`,
  payeePaid: (p: string) => `tb:payee:${p}:paid`,
  payeeEarnings: (p: string) => `tb:payee:${p}:earnings`,
  payeePayouts: (p: string) => `tb:payee:${p}:payouts`,
};

async function planWithKv(kv: Kv, tab: TabState, rows: ReturnType<typeof tabRoyalties>, threshold: number): Promise<PayoutPlan> {
  const prior = await kv.get(K.plan(tab.id));
  if (prior) return JSON.parse(prior) as PayoutPlan;

  if (await kv.set(K.accrued(tab.id), "1", { nx: true })) {
    for (const [k, r] of rows) {
      await kv.incrBy(K.payeeAccrued(k), r.cents);
      for (const e of r.earnings) await kv.rpush(K.payeeEarnings(k), JSON.stringify(e));
    }
  }

  // Lock each payee while we read its balance and reserve the payout, so two
  // tabs closing at once can't both pay the same unpaid royalties.
  const locked: string[] = [];
  try {
    const items: PayoutLine[] = [];
    const accruing: PayoutPlan["accruing"] = [];
    for (const [k, r] of rows) {
      if (!(await kv.set(K.lock(k), tab.id, { nx: true, ex: 30 }))) {
        accruing.push({ payee: r.payee, unpaidCents: r.cents, thresholdCents: threshold });
        continue;
      }
      locked.push(k);
      const unpaid = Number((await kv.get(K.payeeAccrued(k))) ?? 0) - Number((await kv.get(K.payeePaid(k))) ?? 0);
      if (unpaid >= threshold && unpaid > 0) items.push({ payee: r.payee, cents: unpaid, senderItemId: "" });
      else accruing.push({ payee: r.payee, unpaidCents: Math.max(0, unpaid), thresholdCents: threshold });
    }
    const plan = finishPlan("kv", tab.id, items, accruing);
    if (!(await kv.set(K.plan(tab.id), JSON.stringify(plan), { nx: true }))) return JSON.parse((await kv.get(K.plan(tab.id)))!) as PayoutPlan;
    if (await kv.set(K.applied(tab.id), "1", { nx: true })) {
      for (const it of plan.items) await kv.incrBy(K.payeePaid(payeeKey(it.payee)), it.cents);
    }
    return plan;
  } finally {
    for (const k of locked) await kv.del(K.lock(k));
  }
}

function finishPlan(ledger: PayoutPlan["ledger"], tabId: string, items: PayoutLine[], accruing: PayoutPlan["accruing"]): PayoutPlan {
  const keys = items.map((i) => payeeKey(i.payee)).sort();
  const sorted = [...items].sort((a, b) => payeeKey(a.payee).localeCompare(payeeKey(b.payee)));
  const senderBatchId = senderBatchIdFor(tabId, keys);
  return { ledger, senderBatchId, items: sorted.map((it, i) => ({ ...it, senderItemId: `${senderBatchId}-${i}` })), accruing };
}

// At close: add this tab's royalties to the ledger and pay whoever is owed.
// With KV, royalties accrue across tabs until a payee crosses the threshold.
// Without KV, each tab pays its own royalties.
export async function settleRoyalties(d: RoyaltyDeps, tab: TabState): Promise<PayoutPlan | undefined> {
  const rows = tabRoyalties(tab);
  if (!rows.size) return undefined;
  const plan = d.kv
    ? await planWithKv(d.kv, tab, rows, d.thresholdCents)
    : finishPlan("per-tab", tab.id, [...rows.values()].map((r) => ({ payee: r.payee, cents: r.cents, senderItemId: "" })), []);
  return sendPayout(d, tab, plan);
}

// Sends the batch if it hasn't gone yet. Safe to call again and again.
export async function sendPayout(d: RoyaltyDeps, tab: TabState, plan: PayoutPlan): Promise<PayoutPlan> {
  if (!plan.items.length || plan.batchId) return plan;
  let next: PayoutPlan;
  try {
    const res = await d.paypal.createPayout({
      senderBatchId: plan.senderBatchId,
      emailSubject: "You earned a royalty from Toll Bridge",
      items: plan.items.map((it) => ({
        recipient_type: it.payee.recipient_type,
        receiver: it.payee.receiver,
        amount: { value: toValue(it.cents), currency: "USD" },
        sender_item_id: it.senderItemId,
        note: `RSL royalty: an AI answer quoted your page and passed verification (tab ${tab.id}).`,
      })),
    });
    next = { ...plan, batchId: res.batch_header.payout_batch_id, batchStatus: res.batch_header.batch_status, error: undefined };
  } catch (e) {
    const existing = existingPayoutBatchId(e);
    if (!existing) return { ...plan, error: (e as Error).message.slice(0, 200) };
    next = { ...plan, batchId: existing, error: undefined };
  }
  if (d.kv) {
    await d.kv.set(K.plan(tab.id), JSON.stringify(next));
    if (await d.kv.set(K.logged(tab.id), "1", { nx: true })) {
      for (const it of next.items) {
        await d.kv.rpush(K.payeePayouts(payeeKey(it.payee)), JSON.stringify({ tabId: tab.id, batchId: next.batchId, senderBatchId: next.senderBatchId, senderItemId: it.senderItemId, cents: it.cents }));
      }
    }
  }
  return pollPayout(d, next);
}

export function applyBatch(plan: PayoutPlan, batch: PayoutBatch): PayoutPlan {
  const byItem = new Map((batch.items ?? []).map((i) => [i.payout_item.sender_item_id, i]));
  return {
    ...plan,
    batchStatus: batch.batch_header.batch_status,
    items: plan.items.map((it) => {
      const got = byItem.get(it.senderItemId);
      if (!got) return it;
      return {
        ...it,
        itemId: got.payout_item_id,
        status: got.transaction_status,
        transactionId: got.transaction_id,
        feeCents: got.payout_item_fee ? toCents(got.payout_item_fee.value) : it.feeCents,
      };
    }),
  };
}

// Read-side refresh: retry a failed send, then read item statuses from PayPal.
export async function pollPayout(d: RoyaltyDeps, plan: PayoutPlan, tab?: TabState): Promise<PayoutPlan> {
  if (!plan.batchId) return tab && plan.items.length ? sendPayout(d, tab, plan) : plan;
  try {
    return applyBatch(plan, await d.paypal.getPayoutBatch(plan.batchId));
  } catch (e) {
    return { ...plan, error: `couldn't read the payout batch: ${(e as Error).message.slice(0, 160)}` };
  }
}

export interface PayeeLedger {
  payee: string;
  accruedCents: number;
  paidCents: number;
  earnings: Earning[];
  payouts: { tabId: string; batchId?: string; senderBatchId: string; senderItemId: string; cents: number }[];
}

export async function payeeLedger(kv: Kv, key: string): Promise<PayeeLedger> {
  const [accrued, paid, earnings, payouts] = await Promise.all([
    kv.get(K.payeeAccrued(key)),
    kv.get(K.payeePaid(key)),
    kv.lrange(K.payeeEarnings(key)),
    kv.lrange(K.payeePayouts(key)),
  ]);
  return {
    payee: key,
    accruedCents: Number(accrued ?? 0),
    paidCents: Number(paid ?? 0),
    earnings: earnings.map((e) => JSON.parse(e) as Earning),
    payouts: payouts.map((p) => JSON.parse(p) as PayeeLedger["payouts"][number]),
  };
}
