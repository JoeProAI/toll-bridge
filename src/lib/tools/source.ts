import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { MAX_INPUT_CHARS } from "../config";
import type { FetchedDoc, RslFetcher } from "../rsl/types";

export class SourceError extends Error {}

function privateAddress(ip: string): boolean {
  if (isIP(ip) === 6) {
    const l = ip.toLowerCase();
    return l === "::1" || l.startsWith("fc") || l.startsWith("fd") || l.startsWith("fe80") || l.startsWith("::ffff:127.") || l === "::";
  }
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|br)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

// Throws unless the URL is http(s) and resolves to a public address.
export async function assertPublicUrl(raw: string): Promise<URL> {
  const url = new URL(raw);
  if (!["http:", "https:"].includes(url.protocol)) throw new SourceError("only http and https links");
  const { address } = await lookup(url.hostname).catch(() => {
    throw new SourceError(`can't resolve ${url.hostname}`);
  });
  if (privateAddress(address)) throw new SourceError("that link points at a private network");
  return url;
}

export function isUrl(s: string): boolean {
  return /^https?:\/\/\S+$/i.test(s.trim());
}

// Public hosts only, 8 s timeout, 512 KB cap. Shared by source and RSL fetches.
export const httpFetch: RslFetcher = async (raw, accept) => {
  const url = await assertPublicUrl(raw);
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: "follow", headers: { "User-Agent": "TollBridge/1.0 (+wring)", Accept: accept } });
    return { status: res.status, url: res.url || url.toString(), headers: res.headers, text: (await res.text()).slice(0, 512_000) };
  } finally {
    clearTimeout(t);
  }
};

const HIDDEN_STYLE = /(display\s*:\s*none|visibility\s*:\s*hidden|(left|top|text-indent)\s*:\s*-\d{3,}px|font-size\s*:\s*0(px)?\s*(;|$)|opacity\s*:\s*0(\.0+)?\s*(;|$))/i;

// Text a reader can't see: off-screen, display:none, aria-hidden, [hidden].
// It stays in the source (the model sees what an agent would scrape), but a
// claim that quotes it fails verification.
export function hiddenTextOf(html: string): string[] {
  const out: string[] = [];
  const re = /<(p|div|span|section|li|aside|small|em|strong)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  for (const m of html.matchAll(re)) {
    const attrs = m[2];
    const style = attrs.match(/\bstyle\s*=\s*("([^"]*)"|'([^']*)')/i);
    const css = style ? (style[2] ?? style[3] ?? "") : "";
    if (HIDDEN_STYLE.test(css) || /\baria-hidden\s*=\s*["']?true/i.test(attrs) || /(^|\s)hidden(\s|=|$)/i.test(attrs)) {
      const t = htmlToText(m[3]);
      if (t.length >= 12) out.push(t);
    }
  }
  return out;
}

export interface ResolvedSource {
  text: string;
  url?: string;
  page?: FetchedDoc;
  hidden: string[];
}

// Resolves "input" into source text: plain text passes through, a URL is
// fetched (public hosts only) and stripped to text.
export async function resolveSource(input: string, fetcher: RslFetcher = httpFetch): Promise<ResolvedSource> {
  const trimmed = input.trim();
  if (!isUrl(trimmed)) return { text: trimmed.slice(0, MAX_INPUT_CHARS), hidden: [] };
  let page: FetchedDoc;
  try {
    page = await fetcher(trimmed, "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5");
  } catch (e) {
    if (e instanceof SourceError) throw e;
    throw new SourceError(`couldn't fetch the page: ${(e as Error).message}`);
  }
  if (page.status >= 400) throw new SourceError(`the page answered ${page.status}`);
  const type = page.headers.get("content-type") ?? "";
  if (!/text\/|html|json|xml/.test(type)) throw new SourceError(`can't read ${type || "that file type"}`);
  const html = /html/.test(type);
  const text = html ? htmlToText(page.text) : page.text;
  return { text: text.slice(0, MAX_INPUT_CHARS), url: page.url || trimmed, page, hidden: html ? hiddenTextOf(page.text) : [] };
}
