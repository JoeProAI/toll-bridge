import { describe, expect, it } from "vitest";
import { checkRsl, evaluateRsl, parseRsl, type FetchedDoc } from "@/lib/rsl";
import { generateRsl, licenseLinkTag, validateLicense } from "@/lib/rsl/generate";

const base = { amount: "0.05", payee: { recipient_type: "EMAIL" as const, receiver: "writer@example.com" }, permits: ["ai-input" as const, "search" as const] };

describe("RSL license generator", () => {
  it("round-trips through our parser to paid_use", () => {
    const xml = generateRsl({ ...base, owner: 'Ana <"&"> Writer' });
    const v = evaluateRsl(parseRsl(xml), "https://w.example/post");
    expect(v).toMatchObject({ status: "paid_use", royaltyCents: 5, currency: "USD", payee: base.payee });
    expect(xml).toContain("<prohibits type=\"usage\">ai-index ai-train</prohibits>");
    expect(xml).toContain("Ana &lt;&quot;&amp;&quot;&gt; Writer");
  });

  it("round-trips a PayPal ID payee", () => {
    const v = evaluateRsl(parseRsl(generateRsl({ ...base, payee: { recipient_type: "PAYPAL_ID", receiver: "7ZJ4K2QX9ABCD" } })), "https://w.example/");
    expect(v).toMatchObject({ status: "paid_use", payee: { recipient_type: "PAYPAL_ID", receiver: "7ZJ4K2QX9ABCD" } });
  });

  it("without ai-input the page is prohibited for Toll Bridge", () => {
    expect(evaluateRsl(parseRsl(generateRsl({ ...base, permits: ["search"] })), "https://w.example/").status).toBe("prohibited");
  });

  it("discovery finds it through the generated link tag", async () => {
    const xml = generateRsl(base);
    const html = `<html><head>${licenseLinkTag("https://w.example/license.xml")}</head><body><p>hi</p></body></html>`;
    const fetcher = async (url: string): Promise<FetchedDoc> => {
      const map: Record<string, [string, string]> = { "https://w.example/post": ["text/html", html], "https://w.example/license.xml": ["application/rsl+xml", xml] };
      const r = map[url];
      return { status: r ? 200 : 404, url, headers: { get: (n) => (n.toLowerCase() === "content-type" ? (r?.[0] ?? null) : null) }, text: r?.[1] ?? "" };
    };
    const r = await checkRsl("https://w.example/post", { fetcher });
    expect(r).toMatchObject({ status: "paid_use", via: "html-link", licenseUrl: "https://w.example/license.xml", royaltyCents: 5 });
  });

  it("rejects bad prices, payees and empty uses", () => {
    expect(validateLicense({ ...base, amount: "0" })).toMatch(/Price/);
    expect(validateLicense({ ...base, amount: "0.051" })).toMatch(/Price/);
    expect(validateLicense({ ...base, payee: { recipient_type: "EMAIL", receiver: "nope" } })).toMatch(/email/);
    expect(validateLicense({ ...base, payee: { recipient_type: "PAYPAL_ID", receiver: "x@y.z" } })).toMatch(/PayPal ID/);
    expect(validateLicense({ ...base, permits: [] })).toMatch(/at least one/);
    expect(() => generateRsl({ ...base, amount: "-1" })).toThrow();
  });
});
