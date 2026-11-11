import { NextResponse, type NextRequest } from "next/server";
import { closeTab, sealTab } from "@/lib/tab/engine";
import { depsFor } from "@/server/deps";
import { errorResponse, jsonBody, readTab, withTabCookie } from "@/server/http";
import { tabView } from "@/server/views";

export const dynamic = "force-dynamic";

// Close: void the remaining authorization.
export async function POST(req: NextRequest) {
  try {
    const body = await jsonBody<{ tab_token: string }>(req);
    const tab = readTab(req, body.tab_token);
    const d = depsFor({ mode: tab.mode, fx: tab.fx });
    const r = await closeTab(d, tab);
    const res = NextResponse.json({ ...(await tabView(d, r.tab)), voided: r.voided });
    return withTabCookie(res, sealTab(d, r.tab));
  } catch (e) {
    return errorResponse(e);
  }
}
