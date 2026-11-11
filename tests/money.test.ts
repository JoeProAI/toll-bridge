import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FakeModel } from "@/lib/ai/fake";
import { MemoryKv } from "@/lib/royalty/kv";
import { senderBatchIdFor, settleRoyalties, payeeLedger, payeeKey } from "@/lib/royalty/ledger";
import type { FetchedDoc, RslFetcher } from "@/lib/rsl";
import { callTool, closeTab, quote, reconcile, RefusedError, royaltyDeps, summarize } from "@/lib/tab/engine";
import { DEV_RECEIPT_SEED } from "@/lib/config";
import { receiptKeyFromSeed, receiptPayload, signReceipt } from "@/lib/receipt";
import { makeDeps, openedTab, PASS_TEXT } from "./helpers";

const W = "https://joeproai.github.io/toll-bridge-writers";
const fx = (f: string) => readFileSync(join(__dirname, "fixtures/rsl/live", f), "utf8");
const WRITER_A = { recipient_type: "EMAIL", receiver: "sb-3j1ps53857892@personal.example.com" };
const WRITER_B = { recipient_type: "EMAIL", receiver: "sb-o9xx453857673@personal.example.com" };

// The live writer site, recorded. Pages and their licenses, no network.
const writers: RslFetcher = async (url): Promise<FetchedDoc> => {
  const routes: Record<string, [string, string]> = {};
  for (const p of ["a", "b", "c", "d"]) {
    routes[`${W}/${p}.html`] = ["text/html; charset=utf-8", fx(`${p}.html`)];
    routes[`${W}/licenses/writer-${p}.xml`] = ["application/rsl+xml", fx(`writer-${p}.xml`)];
  }
  const r = routes[url];
  const headers = { get: (n: string) => (n.toLowerCase() === "content-type" ? (r?.[0] ?? "text/plain") : null) };
  return r ? { status: 200, url, headers, text: r[1] } : { status: 404, url, headers, text: "not found" };
};

function deps(over: Parameters<typeof makeDeps>[0] = {}) {
  return makeDeps({ fetcher: writers, settlement: "tab", thresholdCents: 5, ...over });
}

async function run(d: ReturnType<typeof deps>, tab: Awaited<ReturnType<typeof openedTab>>, input: string) {
  const q = await quote(d, tab, "wring", input);
  return { q, ...(await callTool(d, tab, q.quoteToken, input)) };
}

describe("RSL quote and call", () => {
  it("quotes the tool fee plus the writer's royalty for a paid_use page", async () => {
    const d = deps();
    const tab = await openedTab(d, 1000);
    const q = await quote(d, tab, "wring", `${W}/a.html`);
    expect(q.price.value).toBe("0.55");
    expect(q.lines).toEqual([
      { kind: "tool_fee", tool: "wring", amount: "0.50" },
      expect.objectContaining({ kind: "royalty", amount: "0.05", payee: WRITER_A }),
    ]);
    expect(q.rsl?.status).toBe("paid_use");
  });

  it("refuses a prohibited page before running, at 0.00, and records it", async () => {
    const d = deps();
    const tab = await openedTab(d, 1000);
    const gen = d.generator as FakeModel;
    const err = await quote(d, tab, "wring", `${W}/c.html`).catch((e) => e);
    expect(err).toBeInstanceOf(RefusedError);
    expect(err.status).toBe(451);
    expect(err.record).toMatchObject({ verdict: "refused", chargeCents: 0, rsl: { status: "prohibited" } });
    expect(err.tab.calls).toHaveLength(1);
    expect(gen.calls).toHaveLength(0);
  });

  it("a page with hidden injected text fails and pays no royalty", async () => {
    const d = deps();
    const tab = await openedTab(d, 1000);
    const r = await run(d, tab, `${W}/d.html`);
    expect(r.record.verdict).toBe("fail");
    expect(r.record.reasons[0]).toMatch(/hidden from readers/);
    expect(r.record.chargeCents).toBe(0);
    expect(r.record.spans).toEqual([]);
  });

  it("a passing call records verified spans at real offsets in the page text", async () => {
    const d = deps();
    const tab = await openedTab(d, 1000);
    const r = await run(d, tab, `${W}/a.html`);
    expect(r.record.verdict).toBe("pass");
    expect(r.record.chargeCents).toBe(55);
    expect(r.record.spans!.length).toBeGreaterThan(0);
    for (const s of r.record.spans!) expect(r.sourceText.slice(s.start, s.end)).toBe(s.quote);
    const signed = signReceipt(receiptPayload(r.tab, r.record), receiptKeyFromSeed(Buffer.from(DEV_RECEIPT_SEED, "base64")), "https://x.test");
    expect(signed.receipt).toMatchObject({ input_url: `${W}/a.html`, royalty: "0.05", tool_fee: "0.50", payee: WRITER_A, rsl_status: "paid_use", generator_model: "fake/deterministic" });
    expect(signed.receipt.policy_hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("tab settlement", () => {
  it("A pass, B pass, injected fail, C refused: one final capture, remainder released, royalties paid", async () => {
    const d = deps({ thresholdCents: 5 });
    let tab = await openedTab(d, 1000);
    tab = (await run(d, tab, `${W}/a.html`)).tab;
    tab = (await run(d, tab, `${W}/b.html`)).tab;
    tab = (await run(d, tab, `${W}/d.html`)).tab;
    try {
      await quote(d, tab, "wring", `${W}/c.html`);
    } catch (e) {
      tab = (e as RefusedError).tab;
    }
    expect((await reconcile(d, tab)).capturedCents).toBe(0);
    expect(summarize(tab, await reconcile(d, tab))).toMatchObject({ accrued: "1.10", remaining: "8.90", passed: 2, failed: 1, refused: 1 });

    const closed = await closeTab(d, tab);
    expect(closed.tab.closeAction).toBe("final-capture");
    expect(closed.voided).toBe(false);
    expect(closed.truth).toMatchObject({ capturedCents: 110, authorizationStatus: "CAPTURED" });
    expect(closed.tab.voidedCents).toBe(890);
    expect(closed.tab.finalCapture).toMatchObject({ cents: 110, feeCents: 52 });
    expect(closed.tab.payout).toMatchObject({ ledger: "per-tab", items: [{ payee: WRITER_A, cents: 5 }, { payee: WRITER_B, cents: 5 }] });
    expect(closed.tab.payout!.batchId).toMatch(/^FXPOB/);
  });

  it("a tab with only failed calls voids the whole hold and pays nobody", async () => {
    const d = deps({ judge: new FakeModel(() => ({ faithfulness: 1, coverage: 1, usefulness: 1, issues: ["no"] })) });
    let tab = await openedTab(d, 500);
    tab = (await run(d, tab, `${W}/a.html`)).tab;
    const closed = await closeTab(d, tab);
    expect(closed.tab.closeAction).toBe("void");
    expect(closed.truth).toMatchObject({ capturedCents: 0, authorizationStatus: "VOIDED" });
    expect(closed.tab.payout).toBeUndefined();
  });

  it("plain text calls carry no royalty (zero-royalty tab)", async () => {
    const d = deps();
    let tab = await openedTab(d, 500);
    tab = (await run(d, tab, PASS_TEXT)).tab;
    const closed = await closeTab(d, tab);
    expect(closed.truth.capturedCents).toBe(50);
    expect(closed.tab.payout).toBeUndefined();
  });

  it("closing twice never captures or pays twice", async () => {
    const d = deps();
    let tab = await openedTab(d, 1000);
    tab = (await run(d, tab, `${W}/a.html`)).tab;
    const first = await closeTab(d, tab);
    const again = await closeTab(d, tab); // stale token that hasn't seen the close
    expect(again.tab.finalCapture!.id).toBe(first.tab.finalCapture!.id);
    expect(again.tab.payout!.batchId).toBe(first.tab.payout!.batchId);
    expect(Object.keys(d.paypal.state.payouts!)).toHaveLength(1);
    expect(again.truth.capturedCents).toBe(55);
  });

  it("per-call mode still captures each pass right away", async () => {
    const d = deps({ settlement: "per-call" });
    let tab = await openedTab(d, 1000);
    const r = await run(d, tab, `${W}/a.html`);
    tab = r.tab;
    expect(r.record.captureId).toMatch(/^FXCAP/);
    expect(r.record.captureFeeCents).toBe(51);
    expect((await reconcile(d, tab)).capturedCents).toBe(55);
    const closed = await closeTab(d, tab);
    expect(closed.tab.closeAction).toBe("void");
    expect(closed.tab.payout?.items[0].cents).toBe(5);
  });

  it("the tab's open hold covers what passing calls owe before quoting more", async () => {
    const d = deps();
    let tab = await openedTab(d, 110);
    tab = (await run(d, tab, `${W}/a.html`)).tab;
    tab = (await run(d, tab, `${W}/b.html`)).tab;
    await expect(quote(d, tab, "wring", PASS_TEXT)).rejects.toMatchObject({ status: 402, code: "insufficient_hold" });
  });
});

describe("royalty ledger and Payouts", () => {
  it("sender_batch_id is deterministic per tab and payee set", () => {
    expect(senderBatchIdFor("tab_1", ["EMAIL:b", "EMAIL:a"])).toBe(senderBatchIdFor("tab_1", ["EMAIL:a", "EMAIL:b"]));
    expect(senderBatchIdFor("tab_1", ["EMAIL:a"])).not.toBe(senderBatchIdFor("tab_2", ["EMAIL:a"]));
  });

  it("with KV, royalties accrue across tabs until the payee crosses the threshold", async () => {
    const kv = new MemoryKv();
    const d = deps({ kv, thresholdCents: 10 });
    let t1 = await openedTab(d, 1000);
    t1 = (await run(d, t1, `${W}/a.html`)).tab;
    const c1 = await closeTab(d, t1);
    expect(c1.tab.payout).toMatchObject({ ledger: "kv", items: [], accruing: [{ unpaidCents: 5, thresholdCents: 10 }] });

    let t2 = await openedTab(d, 1000);
    t2 = (await run(d, t2, `${W}/a.html`)).tab;
    const c2 = await closeTab(d, t2);
    expect(c2.tab.payout!.items).toEqual([expect.objectContaining({ cents: 10, payee: WRITER_A })]);
    const led = await payeeLedger(kv, payeeKey(WRITER_A as never));
    expect(led).toMatchObject({ accruedCents: 10, paidCents: 10 });
    expect(led.earnings).toHaveLength(2);
    expect(led.earnings[0].sentences.length).toBeGreaterThan(0);
    expect(led.payouts).toHaveLength(1);
  });

  it("retrying settlement for the same tab reuses the plan and the PayPal batch", async () => {
    const kv = new MemoryKv();
    const d = deps({ kv });
    let tab = await openedTab(d, 1000);
    tab = (await run(d, tab, `${W}/a.html`)).tab;
    const closed = await closeTab(d, tab);
    const retry = await settleRoyalties(royaltyDeps(d), closed.tab);
    expect(retry!.batchId).toBe(closed.tab.payout!.batchId);
    expect(Object.keys(d.paypal.state.payouts!)).toHaveLength(1);
    expect((await payeeLedger(kv, payeeKey(WRITER_A as never))).paidCents).toBe(5);
  });

  it("recovers the batch id when PayPal says the sender_batch_id already exists", async () => {
    const d = deps();
    let tab = await openedTab(d, 1000);
    tab = (await run(d, tab, `${W}/a.html`)).tab;
    const closed = await closeTab(d, tab);
    const { batchId: _b, ...lost } = closed.tab.payout!;
    const again = await settleRoyalties(royaltyDeps(d), { ...closed.tab, payout: lost as never });
    expect(again!.batchId).toBe(closed.tab.payout!.batchId);
  });

  it("reads payout item status and fee back from PayPal", async () => {
    const d = deps();
    let tab = await openedTab(d, 1000);
    tab = (await run(d, tab, `${W}/a.html`)).tab;
    const closed = await closeTab(d, tab);
    const again = await closeTab(d, closed.tab);
    expect(again.tab.payout!.items[0]).toMatchObject({ status: "SUCCESS", feeCents: 25 });
    expect(again.tab.payout!.items[0].itemId).toMatch(/^FXPOI/);
  });
});
