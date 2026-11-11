import { createHash } from "node:crypto";
import { httpFetch } from "../tools/source";
import { evaluateRsl } from "./evaluate";
import { parseRsl, RslParseError } from "./parse";
import { RSL_MEDIA_TYPE, type FetchedDoc, type RslFetcher, type RslResult, type RslVia } from "./types";

const UA = "TollBridge";

export const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

class Unreadable extends Error {}

// Default fetcher: public hosts only, 8 s timeout, 512 KB cap.
export const httpFetcher: RslFetcher = httpFetch;

// Bot walls and challenges mean we couldn't read the terms, not that there are none.
export function looksBlocked(d: FetchedDoc): string | null {
  if (d.headers.get("cf-mitigated")) return "a Cloudflare challenge";
  if ([401, 403, 429, 503].includes(d.status)) return `HTTP ${d.status}`;
  if (/<title>\s*(just a moment|attention required|access denied)/i.test(d.text)) return "a bot challenge page";
  return null;
}

// Link: <https://x/license.xml>; rel="license"; type="application/rsl+xml"
export function licenseFromLinkHeader(header: string | null, base: string): string | null {
  if (!header) return null;
  for (const part of header.split(/,(?=\s*<)/)) {
    const m = part.match(/<([^>]+)>(.*)/);
    if (!m) continue;
    const params = m[2];
    const rel = params.match(/rel\s*=\s*"?([^";]+)"?/i)?.[1]?.split(/\s+/) ?? [];
    const type = params.match(/type\s*=\s*"?([^";]+)"?/i)?.[1]?.trim().toLowerCase();
    if (rel.includes("license") && type === RSL_MEDIA_TYPE) return new URL(m[1].trim(), base).toString();
  }
  return null;
}

// <link rel="license" type="application/rsl+xml" href="..."> in the document <head>.
export function licenseFromHtml(html: string, base: string): string | null {
  const head = html.match(/<head[\s>][\s\S]*?<\/head>/i)?.[0] ?? html;
  for (const tag of head.match(/<link\b[^>]*>/gi) ?? []) {
    const a = (name: string) => tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
    const get = (name: string) => {
      const m = a(name);
      return m ? (m[2] ?? m[3] ?? m[4] ?? "").trim() : "";
    };
    if (get("rel").toLowerCase().split(/\s+/).includes("license") && get("type").toLowerCase() === RSL_MEDIA_TYPE && get("href")) {
      return new URL(get("href"), base).toString();
    }
  }
  return null;
}

// robots.txt License: lines. A group for our user agent beats `*`, which beats global lines.
export function licenseFromRobots(robots: string, base: string): string | null {
  const global: string[] = [];
  const star: string[] = [];
  const ours: string[] = [];
  let agents: string[] = [];
  let inRules = false;
  for (const rawLine of robots.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, "").trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === "user-agent") {
      if (inRules) agents = [];
      inRules = false;
      agents.push(val.toLowerCase());
      continue;
    }
    if (key === "license") {
      if (!val) continue;
      if (agents.length === 0) global.push(val);
      else if (agents.includes(UA.toLowerCase())) ours.push(val);
      else if (agents.includes("*")) star.push(val);
      inRules = true;
      continue;
    }
    if (agents.length) inRules = true;
  }
  const pick = ours[0] ?? star[0] ?? global[0];
  return pick ? new URL(pick, base).toString() : null;
}

async function get(fetcher: RslFetcher, url: string, accept: string): Promise<FetchedDoc> {
  try {
    return await fetcher(url, accept);
  } catch (e) {
    throw new Unreadable(`couldn't fetch ${url}: ${(e as Error).message}`);
  }
}

export interface RslCheck extends RslResult {
  page?: FetchedDoc;
  licenseXml?: string;
}

// Discovery order: HTTP Link header, then HTML <link>, then robots.txt. Page-level
// associations are more specific than the site-wide robots.txt one, so they win.
export async function checkRsl(sourceUrl: string, opts: { fetcher?: RslFetcher; page?: FetchedDoc } = {}): Promise<RslCheck> {
  const fetcher = opts.fetcher ?? httpFetcher;
  try {
    const page = opts.page ?? (await get(fetcher, sourceUrl, "text/html,application/xhtml+xml,*/*;q=0.8"));
    const blocked = looksBlocked(page);
    if (blocked) return { status: "unreadable", sourceUrl, reason: `The page answered with ${blocked}, so its license terms couldn't be read.` };
    if (page.status >= 400) return { status: "unreadable", sourceUrl, reason: `The page answered HTTP ${page.status}.` };

    let licenseUrl: string | null = licenseFromLinkHeader(page.headers.get("link"), page.url);
    let via: RslVia | undefined = licenseUrl ? "link-header" : undefined;
    if (!licenseUrl && /html/i.test(page.headers.get("content-type") ?? "html")) {
      licenseUrl = licenseFromHtml(page.text, page.url);
      if (licenseUrl) via = "html-link";
    }
    if (!licenseUrl) {
      const robotsUrl = new URL("/robots.txt", page.url).toString();
      const robots = await get(fetcher, robotsUrl, "text/plain").catch(() => null);
      if (robots && robots.status < 400) {
        licenseUrl = licenseFromRobots(robots.text, robotsUrl);
        if (licenseUrl) via = "robots";
      }
    }
    if (!licenseUrl) return { status: "unlicensed", sourceUrl, page, reason: "No RSL license found (no Link header, no <link rel=\"license\">, no robots.txt License line)." };

    const lic = await get(fetcher, licenseUrl, `${RSL_MEDIA_TYPE},application/xml;q=0.9,*/*;q=0.1`);
    const licBlocked = looksBlocked(lic);
    if (licBlocked || lic.status >= 400) {
      return { status: "unreadable", sourceUrl, licenseUrl, via, page, reason: `The license file answered with ${licBlocked ?? `HTTP ${lic.status}`}.` };
    }
    const policyHash = sha256(lic.text);
    try {
      const v = evaluateRsl(parseRsl(lic.text), page.url);
      return { ...v, sourceUrl, licenseUrl, via, policyHash, page, licenseXml: lic.text };
    } catch (e) {
      if (!(e instanceof RslParseError)) throw e;
      // Spec 4.x: a client that can't get a valid RSL document treats the asset as unlicensed.
      return { status: "unlicensed", sourceUrl, licenseUrl, via, policyHash, page, reason: `The license file isn't valid RSL: ${e.message}.` };
    }
  } catch (e) {
    if (e instanceof Unreadable) return { status: "unreadable", sourceUrl, reason: e.message };
    throw e;
  }
}

/** The result without the fetched bodies, for APIs and receipts. */
export function publicRsl(r: RslCheck): RslResult {
  const { page: _page, licenseXml: _xml, ...rest } = r;
  return rest;
}
