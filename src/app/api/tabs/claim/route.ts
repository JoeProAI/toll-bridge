import { NextResponse, type NextRequest } from "next/server";
import { claimTab, sealTab } from "@/lib/tab/engine";
import { depsFor } from "@/server/deps";
import { baseUrlFrom, errorResponse, jsonBody, readPending, withPendingCookie, withTabCookie } from "@/server/http";
import { tabView } from "@/server/views";

export const dynamic = "force-dynamic";

// After approval: authorize the order and hand back the tab token.
export async function POST(req: NextRequest) {
  try {
    const body = await jsonBody<{ pending_token: string; order_id: string }>(req);
    const pending = readPending(req, body.pending_token);
    if (body.order_id && body.order_id !== pending.orderId) {
      return NextResponse.json({ error: { code: "order_mismatch", message: "That order doesn't match this pending hold." } }, { status: 400 });
    }
    const d = depsFor({ mode: pending.mode, fx: pending.fx, baseUrl: baseUrlFrom(req) });
    const tab = await claimTab(d, pending);
    const view = await tabView(d, tab);
    const res = NextResponse.json(view, { status: 201 });
    withPendingCookie(res, null);
    return withTabCookie(res, sealTab(d, tab));
  } catch (e) {
    return errorResponse(e);
  }
}
