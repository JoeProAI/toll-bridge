import { SANDBOX_API } from "../config";
import { PayPalApiError, type CaptureInput, type CardSource, type CreateOrderInput, type PayPalClient } from "./client";
import type { Authorization, Capture, Order, PayPalErrorBody } from "./types";

type Fetch = typeof fetch;

export class LiveSandboxPayPal implements PayPalClient {
  readonly mode = "live-sandbox" as const;
  private token: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly fetchImpl: Fetch = fetch,
    readonly base: string = SANDBOX_API,
  ) {
    if (!base.startsWith("https://api-m.sandbox.paypal.com")) {
      throw new Error("LiveSandboxPayPal refuses non-sandbox PayPal endpoints");
    }
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    const basic = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");
    const res = await this.fetchImpl(`${this.base}/v1/oauth2/token`, {
      method: "POST",
      headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
      cache: "no-store",
    });
    const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number } & PayPalErrorBody;
    if (!res.ok || !body.access_token) throw new PayPalApiError(res.status, body, "POST /v1/oauth2/token");
    this.token = { value: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 300) * 1000 };
    return body.access_token;
  }

  private async call<T>(method: "GET" | "POST", path: string, body?: unknown, requestId?: string): Promise<T | null> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${await this.accessToken()}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    };
    if (requestId) headers["PayPal-Request-Id"] = requestId;
    const res = await this.fetchImpl(`${this.base}${path}`, {
      method,
      headers,
      body: body === undefined ? (method === "POST" ? "{}" : undefined) : JSON.stringify(body),
      cache: "no-store",
    });
    if (res.status === 204) return null;
    const text = await res.text();
    const json = text ? JSON.parse(text) : {};
    if (!res.ok) throw new PayPalApiError(res.status, json as PayPalErrorBody, `${method} ${path.replace(/\/[A-Z0-9]{10,}/g, "/{id}")}`);
    return json as T;
  }

  async createOrder(input: CreateOrderInput): Promise<Order> {
    const body = {
      intent: "AUTHORIZE",
      purchase_units: [
        {
          reference_id: input.referenceId,
          description: input.description,
          custom_id: input.customId,
          amount: input.amount,
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: "Toll Bridge",
            shipping_preference: "NO_SHIPPING",
            user_action: "CONTINUE",
            return_url: input.returnUrl,
            cancel_url: input.cancelUrl,
          },
        },
      },
    };
    return (await this.call<Order>("POST", "/v2/checkout/orders", body, input.requestId))!;
  }

  async getOrder(orderId: string): Promise<Order> {
    return (await this.call<Order>("GET", `/v2/checkout/orders/${encodeURIComponent(orderId)}`))!;
  }

  async authorizeOrder(orderId: string, opts: { requestId: string; card?: CardSource }): Promise<Order> {
    const body = opts.card ? { payment_source: { card: opts.card } } : {};
    return (await this.call<Order>("POST", `/v2/checkout/orders/${encodeURIComponent(orderId)}/authorize`, body, opts.requestId))!;
  }

  async getAuthorization(authorizationId: string): Promise<Authorization> {
    return (await this.call<Authorization>("GET", `/v2/payments/authorizations/${encodeURIComponent(authorizationId)}`))!;
  }

  async captureAuthorization(authorizationId: string, input: CaptureInput): Promise<Capture> {
    const body = {
      amount: input.amount,
      final_capture: input.finalCapture,
      invoice_id: input.invoiceId,
      note_to_payer: input.noteToPayer,
    };
    return (await this.call<Capture>("POST", `/v2/payments/authorizations/${encodeURIComponent(authorizationId)}/capture`, body, input.requestId))!;
  }

  async getCapture(captureId: string): Promise<Capture> {
    return (await this.call<Capture>("GET", `/v2/payments/captures/${encodeURIComponent(captureId)}`))!;
  }

  async voidAuthorization(authorizationId: string, opts: { requestId: string }): Promise<Authorization | null> {
    return this.call<Authorization>("POST", `/v2/payments/authorizations/${encodeURIComponent(authorizationId)}/void`, undefined, opts.requestId);
  }
}
