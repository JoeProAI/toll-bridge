import type { Authorization, Capture, Money, Order, PayPalErrorBody } from "./types";

export interface CreateOrderInput {
  amount: Money;
  referenceId: string;
  description: string;
  customId?: string;
  returnUrl?: string;
  cancelUrl?: string;
  requestId: string;
}

export interface CaptureInput {
  amount: Money;
  finalCapture: boolean;
  invoiceId: string;
  noteToPayer?: string;
  requestId: string;
}

export interface CardSource {
  number: string;
  expiry: string;
  security_code: string;
  name: string;
}

export interface PayPalClient {
  readonly mode: "live-sandbox" | "fixtures";
  createOrder(input: CreateOrderInput): Promise<Order>;
  getOrder(orderId: string): Promise<Order>;
  authorizeOrder(orderId: string, opts: { requestId: string; card?: CardSource }): Promise<Order>;
  getAuthorization(authorizationId: string): Promise<Authorization>;
  captureAuthorization(authorizationId: string, input: CaptureInput): Promise<Capture>;
  getCapture(captureId: string): Promise<Capture>;
  voidAuthorization(authorizationId: string, opts: { requestId: string }): Promise<Authorization | null>;
}

export class PayPalApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: PayPalErrorBody,
    readonly endpoint: string,
  ) {
    super(`${endpoint} -> ${status} ${body.name ?? ""}: ${body.details?.map((d) => d.issue).join(",") || body.message || ""}`);
  }

  get issue(): string | undefined {
    return this.body.details?.[0]?.issue;
  }

  get debugId(): string | undefined {
    return this.body.debug_id;
  }
}

export function approveLink(order: Order): string | undefined {
  return order.links?.find((l) => l.rel === "approve" || l.rel === "payer-action")?.href;
}

export function firstAuthorization(order: Order): Authorization | undefined {
  return order.purchase_units?.[0]?.payments?.authorizations?.[0];
}
