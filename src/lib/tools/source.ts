import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { MAX_INPUT_CHARS } from "../config";

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

// Resolves "input" into source text: plain text passes through, a URL is
// fetched (public hosts only) and stripped to text.
export async function resolveSource(input: string): Promise<{ text: string; url?: string }> {
  const trimmed = input.trim();
  if (!isUrl(trimmed)) return { text: trimmed.slice(0, MAX_INPUT_CHARS) };
  const url = await assertPublicUrl(trimmed);
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: "follow", headers: { "User-Agent": "TollBridge/1.0 (+wring)" } });
    if (!res.ok) throw new SourceError(`the page answered ${res.status}`);
    const type = res.headers.get("content-type") ?? "";
    if (!/text\/|html|json|xml/.test(type)) throw new SourceError(`can't read ${type || "that file type"}`);
    const raw = (await res.text()).slice(0, 1_500_000);
    const text = /html/.test(type) ? htmlToText(raw) : raw;
    return { text: text.slice(0, MAX_INPUT_CHARS), url: url.toString() };
  } catch (e) {
    if (e instanceof SourceError) throw e;
    throw new SourceError(`couldn't fetch the page: ${(e as Error).message}`);
  } finally {
    clearTimeout(t);
  }
}
