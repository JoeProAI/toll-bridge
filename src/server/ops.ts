import { toCents } from "@/lib/money";
import type { FixturePayPal } from "@/lib/paypal/fixtures";
import { callTool, claimTab, closeTab, openPendingToken, openTab, openTabToken, quote, RefusedError, sealTab, TollError } from "@/lib/tab/engine";
import { checkRsl, publicRsl } from "@/lib/rsl";
import { seal } from "@/lib/tab/token";
import { tabSecret } from "@/lib/config";
import { depsFor } from "./deps";
import { callView, receiptFor, tabView } from "./views";

// Shared by the MCP server. Tokens travel in tool arguments, so the
// server stays stateless and works the same on serverless.

const tabFrom = (token: string) => {
  try {
    return openTabToken(tabSecret(), token);
  } catch (e) {
    throw new TollError(401, "bad_tab_token", (e as Error).message);
  }
};
const pendingFrom = (token: string) => {
  try {
    return openPendingToken(tabSecret(), token);
  } catch (e) {
    throw new TollError(401, "bad_pending_token", (e as Error).message);
  }
};

export async function opOpen(budget: string, baseUrl?: string) {
  const d = depsFor({ baseUrl });
  const r = await openTab(d, toCents(budget));
  return { order_id: r.orderId, status: r.status, approve_url: r.approveUrl, pending_token: r.pendingToken, mode: r.pending.mode };
}

export async function opFixtureApprove(pendingToken: string) {
  const pending = pendingFrom(pendingToken);
  if (pending.mode !== "fixtures") throw new TollError(400, "not_fixtures", "Real sandbox holds are approved in PayPal by the payer.");
  const d = depsFor({ mode: "fixtures", fx: pending.fx });
  (d.paypal as FixturePayPal).approve(pending.orderId);
  return { order_id: pending.orderId, status: "APPROVED", pending_token: seal("pending", { ...pending, fx: (d.paypal as FixturePayPal).state }, tabSecret()) };
}

export async function opClaim(pendingToken: string) {
  const pending = pendingFrom(pendingToken);
  const d = depsFor({ mode: pending.mode, fx: pending.fx });
  return tabView(d, await claimTab(d, pending));
}

export async function opStatus(tabToken: string) {
  const tab = tabFrom(tabToken);
  return tabView(depsFor({ mode: tab.mode, fx: tab.fx }), tab);
}

export async function opQuote(tabToken: string, input: string) {
  const tab = tabFrom(tabToken);
  const d = depsFor({ mode: tab.mode, fx: tab.fx });
  try {
    const q = await quote(d, tab, "wring", input);
    return {
      status: 402,
      quote_id: q.quote.qid,
      price: q.price,
      lines: q.lines,
      rsl: q.rsl,
      settlement: q.settlement,
      remaining: q.remaining,
      expires_at: new Date(q.quote.exp).toISOString(),
      terms: q.terms,
      quote_token: q.quoteToken,
    };
  } catch (e) {
    if (!(e instanceof RefusedError)) throw e;
    return { status: 451, refused: true, price: "0.00", message: e.message, rsl: e.record.rsl, call: callView(e.record), tab_token: sealTab(d, e.tab) };
  }
}

export async function opRslCheck(url: string) {
  return publicRsl(await checkRsl(url));
}

export async function opWring(tabToken: string, quoteToken: string, input: string) {
  const tab = tabFrom(tabToken);
  const d = depsFor({ mode: tab.mode, fx: tab.fx });
  const r = await callTool(d, tab, quoteToken, input);
  return {
    call: callView(r.record),
    replayed: r.replayed,
    result: r.record.verdict === "pass" && !r.record.chargeError ? r.brief : null,
    receipt: receiptFor(d, r.tab, r.record, r.replayed ? undefined : r.sourceText),
    tab_token: sealTab(d, r.tab),
  };
}

export async function opClose(tabToken: string) {
  const tab = tabFrom(tabToken);
  const d = depsFor({ mode: tab.mode, fx: tab.fx });
  const r = await closeTab(d, tab);
  return { ...(await tabView(d, r.tab)), voided: r.voided };
}
