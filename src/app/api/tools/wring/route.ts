import { NextResponse, type NextRequest } from "next/server";
import { callTool, quote, RefusedError, sealTab, TollError } from "@/lib/tab/engine";
import { depsFor } from "@/server/deps";
import { errorResponse, jsonBody, readTab, withTabCookie } from "@/server/http";
import { callView, receiptFor } from "@/server/views";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Paid tool. Without X-Toll-Quote it answers 402 with a quote.
// With a valid quote it runs, verifies, and captures only on PASS.
export async function POST(req: NextRequest) {
  try {
    const body = await jsonBody<{ input: string; tab_token: string; quote: string }>(req);
    const tab = readTab(req, body.tab_token);
    const input = typeof body.input === "string" ? body.input : "";
    if (!input.trim()) throw new TollError(400, "no_input", "Send {\"input\": \"long text or a URL\"}.");
    const d = depsFor({ mode: tab.mode, fx: tab.fx });
    const quoteToken = req.headers.get("x-toll-quote") || body.quote;
    if (!quoteToken) {
      let q: Awaited<ReturnType<typeof quote>>;
      try {
        q = await quote(d, tab, "wring", input);
      } catch (e) {
        if (!(e instanceof RefusedError)) throw e;
        const token = sealTab(d, e.tab);
        return withTabCookie(
          NextResponse.json({ error: { code: e.code, message: e.message }, price: "0.00", rsl: e.record.rsl, call: callView(e.record), tab_token: token }, { status: 451 }),
          token,
        );
      }
      return NextResponse.json(
        {
          error: { code: "payment_required", message: `wring costs ${q.price.value} USD, captured from your PayPal hold only if the result passes checks.` },
          quote: { quote_id: q.quote.qid, price: q.price, lines: q.lines, rsl: q.rsl, settlement: q.settlement, remaining: q.remaining, expires_at: new Date(q.quote.exp).toISOString(), terms: q.terms },
          quote_token: q.quoteToken,
          retry: "POST the same body again with header X-Toll-Quote: <quote_token>",
        },
        { status: 402, headers: { "X-Toll-Price": q.price.value, "X-Toll-Currency": "USD" } },
      );
    }
    const r = await callTool(d, tab, quoteToken, input);
    const token = sealTab(d, r.tab);
    const res = NextResponse.json({
      call: callView(r.record),
      replayed: r.replayed,
      verdict: { pass: r.verdict.pass, score: r.verdict.score, checks: r.verdict.checks, reasons: r.verdict.reasons, judge: r.verdict.judge },
      result: r.record.verdict === "pass" && !r.record.chargeError ? r.brief : null,
      rejected_output: r.record.verdict === "pass" && !r.record.chargeError ? null : r.brief,
      receipt: receiptFor(d, r.tab, r.record, r.replayed ? undefined : r.sourceText),
      snapshot: r.replayed ? null : { sha256: r.record.pageSha256, chars: r.sourceText.length },
      tab_token: token,
    });
    return withTabCookie(res, token);
  } catch (e) {
    return errorResponse(e);
  }
}
