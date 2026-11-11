import { NextResponse, type NextRequest } from "next/server";
import { TollError } from "@/lib/tab/engine";
import { depsFor } from "@/server/deps";
import { errorResponse, readTab } from "@/server/http";
import { callView } from "@/server/views";

export const dynamic = "force-dynamic";

// A receipt is the live PayPal capture plus the verdict that earned it.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const tab = readTab(req);
    const call = tab.calls.find((c) => c.captureId === id || c.id === id);
    if (!call) throw new TollError(404, "no_receipt", "That receipt isn't on this tab.");
    const d = depsFor({ mode: tab.mode, fx: tab.fx });
    const capture = call.captureId ? await d.paypal.getCapture(call.captureId) : null;
    return NextResponse.json({
      call: callView(call),
      capture,
      order_id: tab.orderId,
      authorization_id: tab.authorizationId,
      mode: tab.mode,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
