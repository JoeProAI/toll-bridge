import { NextResponse, type NextRequest } from "next/server";
import { toCents } from "@/lib/money";
import { openTab, TollError } from "@/lib/tab/engine";
import { depsFor } from "@/server/deps";
import { baseUrlFrom, errorResponse, jsonBody, withPendingCookie } from "@/server/http";

export const dynamic = "force-dynamic";

// Open a tab: creates a PayPal Orders v2 order with intent AUTHORIZE.
export async function POST(req: NextRequest) {
  try {
    const body = await jsonBody<{ budget: string | number }>(req);
    let cents: number;
    try {
      cents = toCents(String(body.budget ?? "5.00"));
    } catch {
      throw new TollError(400, "bad_budget", "budget must look like 5.00");
    }
    const d = depsFor({ baseUrl: baseUrlFrom(req) });
    const r = await openTab(d, cents);
    const res = NextResponse.json(
      {
        order_id: r.orderId,
        status: r.status,
        approve_url: r.approveUrl,
        pending_token: r.pendingToken,
        mode: r.pending.mode,
        next: "Have the payer approve the hold at approve_url, then POST /api/tabs/claim with pending_token.",
      },
      { status: 201 },
    );
    return withPendingCookie(res, r.pendingToken);
  } catch (e) {
    return errorResponse(e);
  }
}
