import { NextResponse, type NextRequest } from "next/server";
import { checkRsl, publicRsl } from "@/lib/rsl";
import { errorResponse } from "@/server/http";

export const dynamic = "force-dynamic";

// Runs our RSL discovery on a URL: Link header, then <link rel=license>, then robots.txt.
export async function GET(req: NextRequest) {
  try {
    const url = req.nextUrl.searchParams.get("url")?.trim();
    if (!url || !/^https?:\/\//.test(url)) return NextResponse.json({ error: { code: "bad_url", message: "Give a full http(s) URL." } }, { status: 400 });
    return NextResponse.json(publicRsl(await checkRsl(url)));
  } catch (e) {
    return errorResponse(e);
  }
}
