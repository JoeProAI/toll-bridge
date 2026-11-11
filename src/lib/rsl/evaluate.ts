import type { RslContent, RslDoc, RslLicense } from "./parse";
import { OUR_USAGE, PAYOUT_ACCEPTS_TYPE, type RslPayee, type RslResult } from "./types";

type Verdict = Omit<RslResult, "sourceUrl" | "licenseUrl" | "via" | "policyHash">;

// RFC 9309 path pattern: prefix match, `*` matches anything, trailing `$` anchors the end.
export function pathMatches(pattern: string, path: string): boolean {
  if (pattern === "") return true;
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const re = body.split("*").map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*");
  return new RegExp(`^${re}${anchored ? "$" : ""}`).test(path);
}

function contentPath(contentUrl: string, page: URL): string | null {
  if (/^https?:\/\//i.test(contentUrl)) {
    const u = new URL(contentUrl.replace(/\*/g, "__STAR__").replace(/\$$/, "__END__"));
    if (u.origin !== page.origin) return null;
    return (u.pathname + u.search).replace(/__STAR__/g, "*").replace(/__END__$/, "$");
  }
  return contentUrl;
}

// The <content> that governs this page: the most specific matching scope wins.
export function governingContent(doc: RslDoc, pageUrl: string): RslContent | null {
  const page = new URL(pageUrl);
  const path = page.pathname + page.search;
  let best: { c: RslContent; score: number } | null = null;
  for (const c of doc.contents) {
    const pattern = contentPath(c.url, page);
    if (pattern == null || !pathMatches(pattern, path)) continue;
    const score = pattern.replace(/[*$]/g, "").length;
    if (!best || score > best.score) best = { c, score };
  }
  return best?.c ?? null;
}

const covers = (values: string[]) => values.includes(OUR_USAGE) || values.includes("ai-all");

function usagePermitted(l: RslLicense): boolean {
  const permits = l.permits.filter((t) => t.type === "usage");
  return permits.length === 0 || permits.some((t) => covers(t.values));
}

function usageProhibited(l: RslLicense): boolean {
  return l.prohibits.some((t) => t.type === "usage" && covers(t.values));
}

// Converts an RSL decimal amount to cents, rounding sub-cent prices up so the writer is never underpaid.
export function amountToCents(value: string): number | null {
  if (!/^\d+(\.\d+)?$/.test(value)) return null;
  const [whole, frac = ""] = value.split(".");
  const cents = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
  return /[1-9]/.test(frac.slice(2)) ? cents + 1 : cents;
}

export function parsePayee(body: string): RslPayee | null {
  try {
    const j = JSON.parse(body) as Partial<RslPayee>;
    const receiver = typeof j.receiver === "string" ? j.receiver.trim() : "";
    if (j.recipient_type === "EMAIL" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(receiver)) return { recipient_type: "EMAIL", receiver };
    if (j.recipient_type === "PAYPAL_ID" && /^[A-Z0-9]{8,20}$/.test(receiver)) return { recipient_type: "PAYPAL_ID", receiver };
    return null;
  } catch {
    return null;
  }
}

export function evaluateRsl(doc: RslDoc, pageUrl: string): Verdict {
  const c = governingContent(doc, pageUrl);
  if (!c) return { status: "unlicensed", reason: "The license file has no <content> scope that covers this URL." };
  const contentUrl = c.url;
  if (c.server) {
    return { status: "olp_required", contentUrl, reason: `Licensed through an OLP license server (${c.server}). Toll Bridge doesn't implement OLP, so it won't use this page.` };
  }
  if (c.licenses.some(usageProhibited)) {
    return { status: "prohibited", contentUrl, reason: `The license prohibits ${OUR_USAGE} (AI input) use.` };
  }
  const usable = c.licenses.filter(usagePermitted);
  if (usable.length === 0) {
    return { status: "prohibited", contentUrl, reason: `The license permits other uses, but not ${OUR_USAGE}.` };
  }
  const payments = usable.flatMap((l) => l.payments);
  const use = payments.find((p) => p.type === "use");
  if (use) {
    const cents = use.amount ? amountToCents(use.amount.value) : null;
    const currency = use.amount?.currency;
    if (cents == null || !currency) return { status: "terms_no_payee", contentUrl, paymentType: "use", reason: "Asks for a per-use payment but gives no readable <amount currency>." };
    if (currency !== "USD") return { status: "terms_no_payee", contentUrl, paymentType: "use", currency, royaltyCents: cents, reason: `Asks for ${use.amount!.value} ${currency} per use. Toll Bridge only pays royalties in USD.` };
    const acc = use.accepts.find((a) => a.type === PAYOUT_ACCEPTS_TYPE);
    const payee = acc ? parsePayee(acc.body) : null;
    if (!payee) {
      return { status: "terms_no_payee", contentUrl, paymentType: "use", currency, royaltyCents: cents, reason: acc ? `The ${PAYOUT_ACCEPTS_TYPE} payee is malformed.` : `Asks for a per-use payment but lists no ${PAYOUT_ACCEPTS_TYPE} payee.` };
    }
    return { status: "paid_use", contentUrl, paymentType: "use", currency, royaltyCents: cents, payee, reason: `Pays ${use.amount!.value} ${currency} per verified use to ${payee.receiver}.` };
  }
  const kind = payments[0]?.type ?? "free";
  return { status: "terms_no_payee", contentUrl, paymentType: kind, royaltyCents: 0, reason: kind === "free" || kind === "attribution" ? `Licensed for ${OUR_USAGE} with ${kind} terms. No royalty owed.` : `Licensed with "${kind}" payment terms, which a per-use royalty doesn't cover. No royalty paid.` };
}
