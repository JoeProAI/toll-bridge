import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  amountToCents,
  checkRsl,
  licenseFromHtml,
  licenseFromLinkHeader,
  licenseFromRobots,
  parseRsl,
  pathMatches,
  rslAllowsRun,
  type FetchedDoc,
  type RslFetcher,
} from "@/lib/rsl";

const W = "https://joeproai.github.io/toll-bridge-writers";
const fx = (f: string) => readFileSync(join(__dirname, "fixtures/rsl", f), "utf8");

type Resp = { status?: number; headers?: Record<string, string>; text: string };
function fetcherFrom(routes: Record<string, Resp>): RslFetcher & { seen: string[] } {
  const seen: string[] = [];
  const f = (async (url: string): Promise<FetchedDoc> => {
    seen.push(url);
    const r = routes[url] ?? { status: 404, text: "not found" };
    const h = Object.fromEntries(Object.entries(r.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
    return { status: r.status ?? 200, url, headers: { get: (n) => h[n.toLowerCase()] ?? null }, text: r.text };
  }) as unknown as RslFetcher & { seen: string[] };
  f.seen = seen;
  return f;
}
const html = (text: string, headers: Record<string, string> = {}): Resp => ({ text, headers: { "content-type": "text/html", ...headers } });
const xml = (text: string): Resp => ({ text, headers: { "content-type": "application/rsl+xml" } });

function writerSite() {
  const routes: Record<string, Resp> = {};
  for (const p of ["a", "b", "c", "d"]) {
    routes[`${W}/${p}.html`] = html(fx(`${p}.html`));
    routes[`${W}/${p}.xml`] = xml(fx(`${p}.xml`));
  }
  return fetcherFrom(routes);
}

describe("RSL discovery", () => {
  it("reads the Link header", () => {
    const h = '<https://x.test/meta>; rel="describedby", <https://x.test/license.xml>; rel="license"; type="application/rsl+xml"';
    expect(licenseFromLinkHeader(h, "https://x.test/a")).toBe("https://x.test/license.xml");
    expect(licenseFromLinkHeader('<https://x.test/l.xml>; rel="license"', "https://x.test/")).toBeNull();
  });

  it("reads <link rel=license type=application/rsl+xml> and resolves relative hrefs", () => {
    expect(licenseFromHtml(fx("a.html"), `${W}/a.html`)).toBe(`${W}/a.xml`);
    expect(licenseFromHtml('<head><link rel="license" href="https://creativecommons.org/by"></head>', "https://x.test/")).toBeNull();
  });

  it("reads robots.txt License lines: our group, then *, then global", () => {
    const robots = "License: https://x.test/global.xml\nUser-agent: *\nAllow: /\nLicense: https://x.test/star.xml\n\nUser-agent: TollBridge\nLicense: /ours.xml\n";
    expect(licenseFromRobots(robots, "https://x.test/robots.txt")).toBe("https://x.test/ours.xml");
    expect(licenseFromRobots("License: https://x.test/global.xml\nUser-agent: *\nLicense: https://x.test/star.xml", "https://x.test/robots.txt")).toBe("https://x.test/star.xml");
    expect(licenseFromRobots("User-agent: *\nDisallow: /tmp\n# License: nope\nLicense: https://x.test/g.xml", "https://x.test/robots.txt")).toBe("https://x.test/g.xml");
  });
});

describe("RSL evaluation statuses", () => {
  it("paid_use: writer A via HTML link, 0.05 USD to the payout payee", async () => {
    const r = await checkRsl(`${W}/a.html`, { fetcher: writerSite() });
    expect(r).toMatchObject({ status: "paid_use", via: "html-link", licenseUrl: `${W}/a.xml`, royaltyCents: 5, currency: "USD", paymentType: "use", payee: { recipient_type: "EMAIL", receiver: "writer-a@example.com" } });
    expect(r.policyHash).toMatch(/^[0-9a-f]{64}$/);
    expect(rslAllowsRun(r)).toBe(true);
  });

  it("paid_use for D too: the RSL terms are fine, the injection is the verifier's problem", async () => {
    const r = await checkRsl(`${W}/d.html`, { fetcher: writerSite() });
    expect(r.status).toBe("paid_use");
  });

  it("prohibited: writer C prohibits ai-input, so we refuse before running", async () => {
    const r = await checkRsl(`${W}/c.html`, { fetcher: writerSite() });
    expect(r.status).toBe("prohibited");
    expect(rslAllowsRun(r)).toBe(false);
  });

  it("prohibited: ai-all in prohibits covers ai-input, and prohibits beats permits", async () => {
    const both = '<rsl xmlns="https://rslstandard.org/rsl"><content url="/"><license><permits type="usage">ai-input</permits><prohibits type="usage">ai-all</prohibits></license></content></rsl>';
    const f = fetcherFrom({ "https://x.test/p": html("<p>hi</p>", { link: '<https://x.test/l.xml>; rel="license"; type="application/rsl+xml"' }), "https://x.test/l.xml": xml(both) });
    expect((await checkRsl("https://x.test/p", { fetcher: f })).status).toBe("prohibited");
  });

  it("prohibited: permits lists other uses but not ai-input", async () => {
    const f = fetcherFrom({ "https://x.test/p": html("<p>hi</p>"), "https://x.test/robots.txt": { text: "User-agent: *\nLicense: https://x.test/l.xml" }, "https://x.test/l.xml": xml(fx("searchonly.xml")) });
    const r = await checkRsl("https://x.test/p", { fetcher: f });
    expect(r).toMatchObject({ status: "prohibited", via: "robots" });
  });

  it("most specific <content url> wins, with RFC 9309 wildcards and prefixed namespace", async () => {
    const doc = parseRsl(fx("specific.xml"));
    expect(doc.contents).toHaveLength(3);
    const routes = (p: string) => fetcherFrom({ [`https://x.test${p}`]: html("<p>x</p>", { link: '<https://x.test/l.xml>; rel="license"; type="application/rsl+xml"' }), "https://x.test/l.xml": xml(fx("specific.xml")) });
    const free = await checkRsl("https://x.test/blog/1", { fetcher: routes("/blog/1") });
    expect(free).toMatchObject({ status: "terms_no_payee", paymentType: "free", royaltyCents: 0, contentUrl: "/" });
    const premium = await checkRsl("https://x.test/premium/story", { fetcher: routes("/premium/story") });
    expect(premium).toMatchObject({ status: "paid_use", contentUrl: "/premium/*", royaltyCents: 2, payee: { recipient_type: "PAYPAL_ID", receiver: "ABCD1234EFGH5" } });
    const secret = await checkRsl("https://x.test/premium/secret", { fetcher: routes("/premium/secret") });
    expect(secret).toMatchObject({ status: "prohibited", contentUrl: "/premium/secret$" });
  });

  it("olp_required: <content server=...> is refused, even with a use price", async () => {
    const f = fetcherFrom({ "https://x.test/p": html('<head><link rel="license" type="application/rsl+xml" href="/olp.xml"></head>'), "https://x.test/olp.xml": xml(fx("olp.xml")) });
    const r = await checkRsl("https://x.test/p", { fetcher: f });
    expect(r.status).toBe("olp_required");
    expect(rslAllowsRun(r)).toBe(false);
  });

  it("terms_no_payee: a use price without our payout <accepts>", async () => {
    const f = fetcherFrom({ "https://x.test/p": html('<head><link rel="license" type="application/rsl+xml" href="/l.xml"></head>'), "https://x.test/l.xml": xml(fx("nopayee.xml")) });
    expect(await checkRsl("https://x.test/p", { fetcher: f })).toMatchObject({ status: "terms_no_payee", royaltyCents: 5 });
  });

  it("terms_no_payee: a malformed payee body", async () => {
    const bad = fx("a.xml").replace('"receiver":"writer-a@example.com"', '"receiver":"not an email"');
    const f = fetcherFrom({ [`${W}/a.html`]: html(fx("a.html")), [`${W}/a.xml`]: xml(bad) });
    expect((await checkRsl(`${W}/a.html`, { fetcher: f })).status).toBe("terms_no_payee");
  });

  it("unlicensed: no Link header, no <link>, no robots License", async () => {
    const f = fetcherFrom({ "https://x.test/p": html("<p>plain</p>"), "https://x.test/robots.txt": { text: "User-agent: *\nAllow: /" } });
    expect((await checkRsl("https://x.test/p", { fetcher: f })).status).toBe("unlicensed");
  });

  it("unlicensed: a license file in the wrong namespace isn't valid RSL", async () => {
    const f = fetcherFrom({ "https://x.test/p": html('<head><link rel="license" type="application/rsl+xml" href="/l.xml"></head>'), "https://x.test/l.xml": xml(fx("wrongns.xml")) });
    const r = await checkRsl("https://x.test/p", { fetcher: f });
    expect(r.status).toBe("unlicensed");
    expect(r.reason).toMatch(/namespace/);
  });

  it("unreadable: a bot challenge on the page", async () => {
    const f = fetcherFrom({ "https://x.test/p": { status: 403, headers: { "cf-mitigated": "challenge" }, text: "<title>Just a moment...</title>" } });
    const r = await checkRsl("https://x.test/p", { fetcher: f });
    expect(r.status).toBe("unreadable");
    expect(rslAllowsRun(r)).toBe(true);
  });

  it("unreadable: the license file is blocked", async () => {
    const f = fetcherFrom({ "https://x.test/p": html('<head><link rel="license" type="application/rsl+xml" href="/l.xml"></head>'), "https://x.test/l.xml": { status: 429, text: "slow down" } });
    expect(await checkRsl("https://x.test/p", { fetcher: f })).toMatchObject({ status: "unreadable", licenseUrl: "https://x.test/l.xml" });
  });

  it("unreadable: the fetch itself fails", async () => {
    const f: RslFetcher = async () => {
      throw new Error("ECONNRESET");
    };
    expect((await checkRsl("https://x.test/p", { fetcher: f })).status).toBe("unreadable");
  });
});

describe("RSL helpers", () => {
  it("rounds sub-cent prices up so the writer isn't underpaid", () => {
    expect(amountToCents("0.05")).toBe(5);
    expect(amountToCents("0.015")).toBe(2);
    expect(amountToCents("1")).toBe(100);
    expect(amountToCents("-1")).toBeNull();
  });

  it("matches RFC 9309 path patterns", () => {
    expect(pathMatches("/", "/anything")).toBe(true);
    expect(pathMatches("/a/*.html", "/a/x/y.html")).toBe(true);
    expect(pathMatches("/a$", "/a/b")).toBe(false);
    expect(pathMatches("", "/x")).toBe(true);
  });
});

describe("RSL against pages recorded from the live demo writer site", () => {
  const live = () => {
    const routes: Record<string, Resp> = {};
    for (const p of ["a", "b", "c", "d"]) {
      routes[`${W}/${p}.html`] = html(fx(`live/${p}.html`));
      routes[`${W}/licenses/writer-${p}.xml`] = xml(fx(`live/writer-${p}.xml`));
    }
    return fetcherFrom(routes);
  };

  const payees: Record<string, string> = { a: "sb-3j1ps53857892@personal.example.com", b: "sb-o9xx453857673@personal.example.com", d: "sb-3j1ps53857892@personal.example.com" };
  it.each(["a", "b", "d"])("%s.html is paid_use at 0.05 USD; ai-train in prohibits doesn't block ai-input; the extra note key is tolerated", async (p) => {
    const r = await checkRsl(`${W}/${p}.html`, { fetcher: live() });
    expect(r).toMatchObject({ status: "paid_use", via: "html-link", royaltyCents: 5, currency: "USD", licenseUrl: `${W}/licenses/writer-${p}.xml` });
    expect(r.payee).toEqual({ recipient_type: "EMAIL", receiver: payees[p] });
    expect(rslAllowsRun(r)).toBe(true);
  });

  it("c.html prohibits ai-all, so it's refused", async () => {
    const r = await checkRsl(`${W}/c.html`, { fetcher: live() });
    expect(r.status).toBe("prohibited");
    expect(rslAllowsRun(r)).toBe(false);
  });
});
