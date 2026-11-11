import { NextResponse, type NextRequest } from "next/server";
import { depsFor } from "@/server/deps";
import { errorResponse, readTab } from "@/server/http";
import { tabView } from "@/server/views";

export const dynamic = "force-dynamic";

// Tab status, re-read from PayPal every time.
export async function GET(req: NextRequest) {
  try {
    const tab = readTab(req);
    const d = depsFor({ mode: tab.mode, fx: tab.fx });
    return NextResponse.json(await tabView(d, tab));
  } catch (e) {
    return errorResponse(e);
  }
}
