import type { Authorization, Capture, Money, Order, PayoutBatch, PayoutItemInput, PayPalErrorBody } from "./types";

export interface CreateOrderInput {
  amount: Money;
  referenceId: string;
  description: string;
  customId?: string;
  returnUrl?: string;
  cancelUrl?: string;
  requestId: string;
  // "card": no PayPal wallet experience, so a card can authorize it directly.
  payer?: "paypal" | "card";
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

export interface CreatePayoutInput {
  senderBatchId: string;
  emailSubject: string;
  items: PayoutItemInput[];
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
  createPayout(input: CreatePayoutInput): Promise<PayoutBatch>;
  getPayoutBatch(batchId: string): Promise<PayoutBatch>;
}

// PayPal answers a reused sender_batch_id with 400 USER_BUSINESS_ERROR and a
// link to the batch that already exists. We use that to make retries safe.
export function existingPayoutBatchId(e: unknown): string | null {
  if (!(e instanceof PayPalApiError) || e.status !== 400) return null;
  const d = e.body.details?.find((x) => /sender_batch_id/i.test(x.field ?? "") && /already exists/i.test(x.issue ?? ""));
  const href = d?.link?.find((l) => l.rel === "self")?.href;
  return href?.match(/\/v1\/payments\/payouts\/([A-Z0-9]+)/)?.[1] ?? null;
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
