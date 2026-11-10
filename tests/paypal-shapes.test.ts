import { describe, expect, it, vi } from "vitest";
import examples from "@/lib/paypal/recorded/spec-examples.json";
import { approveLink, firstAuthorization } from "@/lib/paypal/client";
import { LiveSandboxPayPal } from "@/lib/paypal/live";
import type { Order } from "@/lib/paypal/types";

const ex = examples as Record<string, unknown>;

describe("PayPal shapes (recorded from PayPal's published OpenAPI examples)", () => {
  it("reads the authorization out of an authorize-order response", () => {
    const auth = firstAuthorization(ex["POST /v2/checkout/orders/{id}/authorize 201 00_orders_authorize"] as Order);
    expect(auth).toMatchObject({ id: "3C679366HH908993F", status: "CREATED", amount: { value: "100.00" } });
  });

  it("finds the payer approval link on an order", () => {
    expect(approveLink(ex["GET /v2/checkout/orders/{id} 200 00_orders_get"] as Order)).toMatch(/checkoutnow\?token=/);
  });

  it("refuses to point at anything but the sandbox", () => {
    expect(() => new LiveSandboxPayPal("id", "secret", fetch, "https://api-m.paypal.com")).toThrow(/sandbox/);
  });

  it("sends the documented capture request: amount, final_capture=false, PayPal-Request-Id", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fake = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      if (String(url).endsWith("/v1/oauth2/token")) return new Response(JSON.stringify({ access_token: "A21", expires_in: 3600 }), { status: 200 });
      return new Response(JSON.stringify(ex["POST /v2/payments/authorizations/{authorization_id}/capture 201 authorizations_capture_with_prefer_header"]), { status: 201 });
    });
    const pp = new LiveSandboxPayPal("id", "secret", fake as unknown as typeof fetch);
    const cap = await pp.captureAuthorization("0VF52814937998046", {
      amount: { currency_code: "USD", value: "0.50" },
      finalCapture: false,
      invoiceId: "tab_x-q_y",
      requestId: "cap-tab_x-q_y",
    });
    expect(cap.id).toBe("2GG279541U471931P");
    const req = calls[1];
    expect(req.url).toBe("https://api-m.sandbox.paypal.com/v2/payments/authorizations/0VF52814937998046/capture");
    const headers = req.init.headers as Record<string, string>;
    expect(headers["PayPal-Request-Id"]).toBe("cap-tab_x-q_y");
    expect(headers.Prefer).toBe("return=representation");
    expect(JSON.parse(String(req.init.body))).toEqual({ amount: { currency_code: "USD", value: "0.50" }, final_capture: false, invoice_id: "tab_x-q_y" });
  });

  it("surfaces PayPal error issues", async () => {
    const fake = vi.fn(async (url: string | URL | Request) => {
      if (String(url).endsWith("/v1/oauth2/token")) return new Response(JSON.stringify({ access_token: "A21", expires_in: 3600 }), { status: 200 });
      return new Response(JSON.stringify(ex["POST /v2/payments/authorizations/{authorization_id}/void 422 authorizations_void_422_already_captured"]), { status: 422 });
    });
    const pp = new LiveSandboxPayPal("id", "secret", fake as unknown as typeof fetch);
    await expect(pp.voidAuthorization("X", { requestId: "v" })).rejects.toMatchObject({ status: 422, issue: "PREVIOUSLY_CAPTURED" });
  });
});
