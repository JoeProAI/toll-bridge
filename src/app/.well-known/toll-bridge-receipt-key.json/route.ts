import { NextResponse, type NextRequest } from "next/server";
import { publicKeyDoc } from "@/lib/receipt";
import { receiptKey } from "@/server/deps";
import { baseUrlFrom, errorResponse } from "@/server/http";

export async function GET(req: NextRequest) {
  try {
    return NextResponse.json(publicKeyDoc(receiptKey(), baseUrlFrom(req)), { headers: { "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*" } });
  } catch (e) {
    return errorResponse(e);
  }
}
