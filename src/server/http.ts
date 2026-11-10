import { NextResponse, type NextRequest } from "next/server";
import { tabSecret } from "@/lib/config";
import { PayPalApiError } from "@/lib/paypal/client";
import { openPendingToken, openTabToken, TollError } from "@/lib/tab/engine";
import { TokenError } from "@/lib/tab/token";
import type { PendingTab, TabState } from "@/lib/tab/types";

export const TAB_COOKIE = "tb_tab";
export const PENDING_COOKIE = "tb_pending";

const cookieOpts = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 3 };

export function bearer(req: NextRequest): string | undefined {
  const h = req.headers.get("authorization");
  if (h?.toLowerCase().startsWith("bearer ")) return h.slice(7).trim();
  return req.headers.get("x-tab-token")?.trim() || undefined;
}

// Cookies cap out near 4 KB, so long tabs are split across a few.
const CHUNK = 3500;
const MAX_CHUNKS = 4;

function readTabCookie(req: NextRequest): string | undefined {
  const parts: string[] = [];
  for (let i = 0; i < MAX_CHUNKS; i++) {
    const v = req.cookies.get(i === 0 ? TAB_COOKIE : `${TAB_COOKIE}_${i}`)?.value;
    if (!v) break;
    parts.push(v);
  }
  return parts.length ? parts.join("") : undefined;
}

export function readTab(req: NextRequest, bodyToken?: string): TabState {
  const token = bodyToken || bearer(req) || readTabCookie(req);
  if (!token) throw new TollError(401, "no_tab", "No open tab. Open one at /open, then send its tab_token as a Bearer token.");
  try {
    return openTabToken(tabSecret(), token);
  } catch (e) {
    throw new TollError(401, "bad_tab_token", (e as Error).message);
  }
}

export function readPending(req: NextRequest, bodyToken?: string): PendingTab {
  const token = bodyToken || req.cookies.get(PENDING_COOKIE)?.value;
  if (!token) throw new TollError(400, "no_pending", "No pending hold. Start from /open.");
  try {
    return openPendingToken(tabSecret(), token);
  } catch (e) {
    throw new TollError(401, "bad_pending_token", (e as Error).message);
  }
}

export function withTabCookie(res: NextResponse, tabToken: string) {
  for (let i = 0; i < MAX_CHUNKS; i++) {
    const name = i === 0 ? TAB_COOKIE : `${TAB_COOKIE}_${i}`;
    const part = tabToken.slice(i * CHUNK, (i + 1) * CHUNK);
    if (part) res.cookies.set(name, part, cookieOpts);
    else res.cookies.delete(name);
  }
  return res;
}

export function withPendingCookie(res: NextResponse, token: string | null) {
  if (token) res.cookies.set(PENDING_COOKIE, token, { ...cookieOpts, maxAge: 60 * 60 * 3 });
  else res.cookies.delete(PENDING_COOKIE);
  return res;
}

export function errorResponse(e: unknown): NextResponse {
  if (e instanceof TollError) {
    return NextResponse.json({ error: { code: e.code, message: e.message, ...e.extra } }, { status: e.status });
  }
  if (e instanceof PayPalApiError) {
    return NextResponse.json(
      { error: { code: "paypal_error", message: `PayPal said ${e.issue ?? e.body.name ?? e.status}.`, paypal: { status: e.status, issue: e.issue, debug_id: e.debugId } } },
      { status: e.status >= 500 ? 502 : 422 },
    );
  }
  if (e instanceof TokenError) return NextResponse.json({ error: { code: "bad_token", message: e.message } }, { status: 401 });
  console.error(e);
  return NextResponse.json({ error: { code: "internal", message: "Something broke on our side. Nothing was charged." } }, { status: 500 });
}

export async function jsonBody<T>(req: NextRequest): Promise<Partial<T>> {
  try {
    return ((await req.json()) ?? {}) as Partial<T>;
  } catch {
    return {};
  }
}

export function baseUrlFrom(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  return process.env.PUBLIC_BASE_URL?.replace(/\/$/, "") || (host ? `${proto}://${host}` : new URL(req.url).origin);
}
