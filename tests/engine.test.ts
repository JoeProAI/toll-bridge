import { describe, expect, it } from "vitest";
import { FakeModel } from "@/lib/ai/fake";
import { callTool, claimTab, closeTab, openTab, quote, reconcile, summarize, TollError } from "@/lib/tab/engine";
import { GUMMIES_TEXT, makeDeps, openedTab, PASS_TEXT, SEAWALL_TEXT } from "./helpers";

const failingJudge = () => new FakeModel(() => ({ faithfulness: 2, coverage: 3, usefulness: 1, issues: ["parrots an instruction hidden in the page"] }));

async function run(d: ReturnType<typeof makeDeps>, tab: Awaited<ReturnType<typeof openedTab>>, text: string) {
  const q = await quote(d, tab, "wring", text);
  return callTool(d, tab, q.quoteToken, text);
}

describe("tab lifecycle against fixture PayPal", () => {
  it("cannot claim a tab before the payer approves", async () => {
    const d = makeDeps();
    const opened = await openTab(d, 500);
    expect(opened.approveUrl).toMatch(/approve\?token=/);
    await expect(claimTab(d, opened.pending)).rejects.toMatchObject({ code: "awaiting_approval" });
  });

  it("2 pass + 1 fail: captures exactly two tolls, the fail costs nothing, close voids the rest", async () => {
    const d = makeDeps();
    let tab = await openedTab(d, 500);
    expect(tab.authorizationId).toMatch(/^FXAUT/);

    const a = await run(d, tab, PASS_TEXT);
    tab = a.tab;
    expect(a.record.verdict).toBe("pass");
    expect(a.record.captureId).toMatch(/^FXCAP/);

    const b = await run(d, tab, SEAWALL_TEXT);
    tab = b.tab;
    expect(b.record.verdict).toBe("pass");

    d.judge = failingJudge();
    const c = await run(d, tab, GUMMIES_TEXT);
    tab = c.tab;
    expect(c.record.verdict).toBe("fail");
    expect(c.record.captureId).toBeUndefined();

    const mid = await reconcile(d, tab);
    expect(mid).toMatchObject({ heldCents: 500, capturedCents: 100, remainingCents: 400, authorizationStatus: "PARTIALLY_CAPTURED" });
    expect(mid.captures).toHaveLength(2);

    const closed = await closeTab(d, tab);
    expect(closed.voided).toBe(true);
    expect(closed.truth.authorizationStatus).toBe("VOIDED");
    const s = summarize(closed.tab, closed.truth);
    expect(s).toMatchObject({ held: "5.00", captured: "1.00", voided: "4.00", passed: 2, failed: 1, not_charged: "0.50" });
  });

  it("OVER BUDGET: refuses to quote once the hold can't cover a call", async () => {
    const d = makeDeps();
    let tab = await openedTab(d, 100);
    tab = (await run(d, tab, PASS_TEXT)).tab;
    tab = (await run(d, tab, SEAWALL_TEXT)).tab;
    expect((await reconcile(d, tab)).remainingCents).toBe(0);
    await expect(quote(d, tab, "wring", PASS_TEXT)).rejects.toMatchObject({ status: 402, code: "insufficient_hold" });
  });

  it("OVER BUDGET: PayPal itself refuses a capture beyond the authorization", async () => {
    const d = makeDeps();
    const tab = await openedTab(d, 100);
    await expect(
      d.paypal.captureAuthorization(tab.authorizationId, { amount: { currency_code: "USD", value: "1.50" }, finalCapture: false, invoiceId: "x", requestId: "r1" }),
    ).rejects.toMatchObject({ issue: "MAX_CAPTURE_AMOUNT_EXCEEDED" });
  });

  it("IDEMPOTENCY: replaying a quote never captures twice", async () => {
    const d = makeDeps();
    let tab = await openedTab(d, 500);
    const q = await quote(d, tab, "wring", PASS_TEXT);
    const first = await callTool(d, tab, q.quoteToken, PASS_TEXT);
    tab = first.tab;
    const again = await callTool(d, tab, q.quoteToken, PASS_TEXT);
    expect(again.replayed).toBe(true);
    expect(again.record.captureId).toBe(first.record.captureId);

    // Even an agent replaying the old tab token (which hasn't seen the call)
    // hits PayPal-Request-Id idempotency and gets the same capture back.
    const stale = await callTool(d, { ...tab, calls: [] }, q.quoteToken, PASS_TEXT);
    expect(stale.record.captureId).toBe(first.record.captureId);
    expect((await reconcile(d, tab)).capturedCents).toBe(50);
  });

  it("quotes are bound to their tab and their input", async () => {
    const d = makeDeps();
    const tab = await openedTab(d, 500);
    const other = await openedTab(d, 500);
    const q = await quote(d, tab, "wring", PASS_TEXT);
    await expect(callTool(d, other, q.quoteToken, PASS_TEXT)).rejects.toMatchObject({ code: "bad_quote" });
    await expect(callTool(d, tab, q.quoteToken, SEAWALL_TEXT)).rejects.toMatchObject({ code: "quote_mismatch" });
    await expect(callTool(d, tab, q.quoteToken.slice(0, -3) + "abc", PASS_TEXT)).rejects.toBeInstanceOf(TollError);
  });

  it("quotes expire", async () => {
    const clock = { t: Date.parse("2026-11-10T15:00:00Z") };
    const d = makeDeps({ clock });
    const tab = await openedTab(d, 500);
    const q = await quote(d, tab, "wring", PASS_TEXT);
    clock.t += 11 * 60 * 1000;
    await expect(callTool(d, tab, q.quoteToken, PASS_TEXT)).rejects.toMatchObject({ code: "quote_expired" });
  });

  it("VOID AFTER CLOSE: a closed tab takes no calls and PayPal refuses captures on the voided hold", async () => {
    const d = makeDeps();
    let tab = await openedTab(d, 500);
    const q = await quote(d, tab, "wring", PASS_TEXT);
    tab = (await closeTab(d, tab)).tab;
    expect(tab.status).toBe("closed");
    expect(tab.voidedCents).toBe(500);
    await expect(callTool(d, tab, q.quoteToken, PASS_TEXT)).rejects.toMatchObject({ status: 410, code: "tab_closed" });
    await expect(quote(d, tab, "wring", PASS_TEXT)).rejects.toMatchObject({ code: "tab_closed" });
    // An agent holding the pre-close token still can't spend: PayPal shows
    // the hold as voided, and PayPal itself refuses a capture on it.
    const zombie = { ...tab, status: "open" as const };
    await expect(callTool(d, zombie, q.quoteToken, PASS_TEXT)).rejects.toMatchObject({ code: "insufficient_hold" });
    await expect(
      d.paypal.captureAuthorization(tab.authorizationId, { amount: { currency_code: "USD", value: "0.50" }, finalCapture: false, invoiceId: "z", requestId: "z" }),
    ).rejects.toMatchObject({ issue: "AUTHORIZATION_VOIDED" });
    // Closing twice is a no-op.
    expect((await closeTab(d, tab)).voided).toBe(false);
  });

  it("a fully captured hold closes without a void", async () => {
    const d = makeDeps();
    let tab = await openedTab(d, 50);
    tab = (await run(d, tab, PASS_TEXT)).tab;
    const closed = await closeTab(d, tab);
    expect(closed.voided).toBe(false);
    expect(closed.truth.authorizationStatus).toBe("CAPTURED");
    expect(closed.tab.voidedCents).toBe(0);
  });

  it("model errors are recorded as failed calls and never billed", async () => {
    const broken = { name: "broken", json: async () => { throw new Error("Workers AI 503"); } };
    const d = makeDeps({ generator: broken });
    const tab = await openedTab(d, 500);
    const r = await run(d, tab, PASS_TEXT);
    expect(r.record.verdict).toBe("fail");
    expect(r.record.reasons[0]).toMatch(/503/);
    expect((await reconcile(d, r.tab)).capturedCents).toBe(0);
  });

  it("rejects silly budgets", async () => {
    const d = makeDeps();
    await expect(openTab(d, 10)).rejects.toMatchObject({ code: "bad_budget" });
    await expect(openTab(d, 999999)).rejects.toMatchObject({ code: "bad_budget" });
  });
});
