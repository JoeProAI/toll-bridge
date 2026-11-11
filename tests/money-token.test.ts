import { describe, expect, it } from "vitest";
import { toCents, toValue } from "@/lib/money";
import { seal, unseal, TokenError } from "@/lib/tab/token";

describe("money", () => {
  it("round-trips PayPal decimal strings without float drift", () => {
    expect(toCents("5.00")).toBe(500);
    expect(toCents("0.5")).toBe(50);
    expect(toCents("19.99")).toBe(1999);
    expect(toValue(1999)).toBe("19.99");
    expect(toValue(5)).toBe("0.05");
    expect(() => toCents("1.234")).toThrow();
    expect(() => toValue(-1)).toThrow();
  });
});

describe("signed tokens", () => {
  it("rejects tampering, wrong kind and wrong secret", () => {
    const t = seal("tab", { held: 500 }, "s1");
    expect(unseal<{ held: number }>("tab", t, "s1").held).toBe(500);
    expect(() => unseal("quote", t.replace(/^tab/, "quote"), "s1")).toThrow(TokenError);
    expect(() => unseal("tab", t, "s2")).toThrow(TokenError);
    const [k, body, mac] = t.split(".");
    const flipped = body.slice(0, -2) + (body.endsWith("A") ? "BB" : "AA");
    expect(() => unseal("tab", `${k}.${flipped}.${mac}`, "s1")).toThrow(TokenError);
  });
});
