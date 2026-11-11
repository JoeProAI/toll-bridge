import { afterEach, describe, expect, it, vi } from "vitest";
import { tabSecret } from "@/lib/config";

afterEach(() => vi.unstubAllEnvs());

describe("tabSecret", () => {
  it("uses TAB_SECRET when set", () => {
    vi.stubEnv("TAB_SECRET", "0123456789abcdef0123");
    expect(tabSecret()).toBe("0123456789abcdef0123");
  });

  it("fails closed in live-sandbox mode without TAB_SECRET", () => {
    vi.stubEnv("TAB_SECRET", "");
    vi.stubEnv("PAYPAL_MODE", "");
    vi.stubEnv("PAYPAL_CLIENT_ID", "id");
    vi.stubEnv("PAYPAL_CLIENT_SECRET", "secret");
    expect(() => tabSecret()).toThrow(/TAB_SECRET is not set/);
  });

  it("fails closed on Vercel even in fixtures mode", () => {
    vi.stubEnv("TAB_SECRET", "");
    vi.stubEnv("PAYPAL_MODE", "fixtures");
    vi.stubEnv("VERCEL", "1");
    expect(() => tabSecret()).toThrow(/TAB_SECRET is not set/);
  });

  it("never derives the key from the PayPal secret", () => {
    vi.stubEnv("TAB_SECRET", "");
    vi.stubEnv("PAYPAL_MODE", "fixtures");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("PAYPAL_CLIENT_SECRET", "pp-unique-zq81");
    expect(tabSecret()).not.toContain("pp-unique-zq81");
  });

  it("rejects a short TAB_SECRET", () => {
    vi.stubEnv("TAB_SECRET", "short");
    expect(() => tabSecret()).toThrow(/too short/);
  });
});
