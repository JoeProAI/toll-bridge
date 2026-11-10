import { NextResponse, type NextRequest } from "next/server";
import { FixturePayPal } from "@/lib/paypal/fixtures";
import { TollError } from "@/lib/tab/engine";
import { seal } from "@/lib/tab/token";
import { tabSecret } from "@/lib/config";
import { depsFor } from "@/server/deps";
import { errorResponse, jsonBody, readPending, withPendingCookie } from "@/server/http";

export const dynamic = "force-dynamic";

// Fixtures mode only: stands in for the payer clicking approve in PayPal.
export async function POST(req: NextRequest) {
  try {
    const body = await jsonBody<{ pending_token: string }>(req);
    const pending = readPending(req, body.pending_token);
    if (pending.mode !== "fixtures") throw new TollError(400, "not_fixtures", "Real sandbox holds are approved in PayPal, not here.");
    const d = depsFor({ mode: "fixtures", fx: pending.fx });
    (d.paypal as FixturePayPal).approve(pending.orderId);
    const next = { ...pending, fx: (d.paypal as FixturePayPal).state };
    const token = seal("pending", next, tabSecret());
    return withPendingCookie(NextResponse.json({ order_id: pending.orderId, status: "APPROVED", pending_token: token }), token);
  } catch (e) {
    return errorResponse(e);
  }
}
