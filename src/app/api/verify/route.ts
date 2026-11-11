import { NextResponse, type NextRequest } from "next/server";
import { verifyReceipt, type SignedReceipt } from "@/lib/receipt";
import { resolveSource } from "@/lib/tools/source";
import { receiptKey } from "@/server/deps";
import { errorResponse } from "@/server/http";

// Checks a receipt against this deployment's public key (or one you pass).
// With no snapshot, it fetches the page now, which only matches if the page hasn't changed.
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as { receipt?: SignedReceipt | string; snapshot?: string; public_key?: string } | null;
    let signed = body?.receipt;
    if (typeof signed === "string") signed = JSON.parse(signed) as SignedReceipt;
    if (!signed?.receipt || !signed.signature) {
      return NextResponse.json({ error: { code: "bad_receipt", message: "Paste the whole receipt JSON: it needs receipt and signature." } }, { status: 400 });
    }
    const key = body?.public_key || receiptKey().publicRaw.toString("base64url");
    let snapshot = body?.snapshot ?? signed.snapshot ?? null;
    let snapshotFrom = body?.snapshot ? "pasted" : signed.snapshot != null ? "receipt" : null;
    if (snapshot == null && signed.receipt.input_url) {
      try {
        snapshot = (await resolveSource(signed.receipt.input_url)).text;
        snapshotFrom = "fetched now";
      } catch {
        snapshotFrom = null;
      }
    }
    const r = verifyReceipt(signed, key, snapshot);
    return NextResponse.json({ ...r, snapshot_from: snapshotFrom, key_kid: signed.signature.kid, receipt: signed.receipt });
  } catch (e) {
    return errorResponse(e);
  }
}
