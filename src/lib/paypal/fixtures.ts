import { toCents, toValue } from "../money";
import { PayPalApiError, type CaptureInput, type CardSource, type CreateOrderInput, type CreatePayoutInput, type PayPalClient } from "./client";
import type { Authorization, Capture, Order, PayoutBatch } from "./types";

// Offline stand-in for the PayPal sandbox. Response shapes follow the
// recorded examples in ./recorded/spec-examples.json (taken from PayPal's
// published OpenAPI specs) and the documented business rules: partial
// captures up to the authorized amount, PayPal-Request-Id idempotency,
// no void after a full capture, 29-day authorization validity.

export interface FixtureState {
  seq: number;
  orders: Record<string, Order>;
  auths: Record<string, Authorization & { order_id: string; captured_cents: number }>;
  captures: Record<string, Capture & { authorization_id: string }>;
  requests: Record<string, string>;
  payouts?: Record<string, PayoutBatch & { reads: number }>;
}

export function emptyFixtureState(): FixtureState {
  return { seq: 0, orders: {}, auths: {}, captures: {}, requests: {} };
}

const AUTH_VALID_MS = 29 * 24 * 3600 * 1000;
const FIXTURE_CARD_DECLINE = "4000000000000002";

function err(status: number, endpoint: string, issue: string, description: string): PayPalApiError {
  return new PayPalApiError(
    status,
    {
      name: status === 404 ? "RESOURCE_NOT_FOUND" : "UNPROCESSABLE_ENTITY",
      message: "The requested action could not be performed, semantically incorrect, or failed business validation.",
      debug_id: "fixture",
      details: [{ issue, description }],
    },
    endpoint,
  );
}

// Mirrors what the sandbox charged us in the spike: 1.50 gross, 0.53 fee
// (2.99% + 0.49, rounded). Fixtures only; live runs show PayPal's number.
function fixtureFee(cents: number, currency: string) {
  const fee = Math.min(cents, Math.round(cents * 0.0299 + 49));
  const m = (c: number) => ({ currency_code: currency, value: toValue(c) });
  return { gross_amount: m(cents), paypal_fee: m(fee), net_amount: m(cents - fee) };
}

// The sandbox charged 0.25 per payout item in the spike.
export const FIXTURE_PAYOUT_ITEM_FEE = "0.25";

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export class FixturePayPal implements PayPalClient {
  readonly mode = "fixtures" as const;

  constructor(
    readonly state: FixtureState = emptyFixtureState(),
    private readonly now: () => Date = () => new Date(),
    private readonly approveBase = "/fixture/approve",
  ) {}

  private id(kind: "ORD" | "AUT" | "CAP"): string {
    this.state.seq += 1;
    return `FX${kind}${String(this.state.seq).padStart(12, "0")}`;
  }

  private ts(): string {
    return this.now().toISOString().replace(/\.\d{3}Z$/, "Z");
  }

  private replay(requestId: string | undefined, key: string): string | undefined {
    return requestId ? this.state.requests[`${key}:${requestId}`] : undefined;
  }

  private remember(requestId: string | undefined, key: string, id: string) {
    if (requestId) this.state.requests[`${key}:${requestId}`] = id;
  }

  approve(orderId: string): Order {
    const order = this.state.orders[orderId];
    if (!order) throw err(404, "fixture approve", "INVALID_RESOURCE_ID", "Order not found.");
    if (order.status === "CREATED") order.status = "APPROVED";
    order.payer = { email_address: "sb-buyer@personal.example.com", payer_id: "FXPAYER000001", name: { given_name: "Sandbox", surname: "Buyer" } };
    return clone(order);
  }

  async createOrder(input: CreateOrderInput): Promise<Order> {
    const prior = this.replay(input.requestId, "order");
    if (prior) return clone(this.state.orders[prior]);
    const id = this.id("ORD");
    const order: Order = {
      id,
      status: "CREATED",
      intent: "AUTHORIZE",
      purchase_units: [
        { reference_id: input.referenceId, description: input.description, custom_id: input.customId, amount: input.amount },
      ],
      create_time: this.ts(),
      links: [
        { href: `fixture://v2/checkout/orders/${id}`, rel: "self", method: "GET" },
        { href: `${this.approveBase}?token=${id}`, rel: "payer-action", method: "GET" },
      ],
    };
    this.state.orders[id] = order;
    this.remember(input.requestId, "order", id);
    return clone(order);
  }

  async getOrder(orderId: string): Promise<Order> {
    const order = this.state.orders[orderId];
    if (!order) throw err(404, "GET /v2/checkout/orders/{id}", "INVALID_RESOURCE_ID", "Specified resource ID does not exist.");
    const pu = order.purchase_units![0];
    const auths = Object.values(this.state.auths).filter((a) => a.order_id === orderId);
    const caps = Object.values(this.state.captures).filter((c) => auths.some((a) => a.id === c.authorization_id));
    const view = clone(order);
    if (auths.length) {
      view.purchase_units![0].payments = {
        authorizations: auths.map(({ order_id: _o, captured_cents: _c, ...a }) => clone(a)),
        captures: caps.map(({ authorization_id: _a, ...c }) => clone(c)),
      };
    }
    void pu;
    return view;
  }

  async authorizeOrder(orderId: string, opts: { requestId: string; card?: CardSource }): Promise<Order> {
    const endpoint = "POST /v2/checkout/orders/{id}/authorize";
    const prior = this.replay(opts.requestId, "authorize");
    if (prior) return this.getOrder(prior);
    const order = this.state.orders[orderId];
    if (!order) throw err(404, endpoint, "INVALID_RESOURCE_ID", "Specified resource ID does not exist.");
    if (order.status === "COMPLETED") throw err(422, endpoint, "ORDER_ALREADY_AUTHORIZED", "Order already authorized.");
    if (order.status !== "APPROVED" && !opts.card) {
      throw err(422, endpoint, "ORDER_NOT_APPROVED", "Payer has not yet approved the Order for payment.");
    }
    if (opts.card?.number === FIXTURE_CARD_DECLINE) {
      throw err(422, endpoint, "INSTRUMENT_DECLINED", "The instrument presented was declined.");
    }
    const authId = this.id("AUT");
    const created = this.now();
    this.state.auths[authId] = {
      id: authId,
      status: "CREATED",
      amount: clone(order.purchase_units![0].amount!),
      custom_id: order.purchase_units![0].custom_id,
      expiration_time: new Date(created.getTime() + AUTH_VALID_MS).toISOString().replace(/\.\d{3}Z$/, "Z"),
      create_time: this.ts(),
      update_time: this.ts(),
      order_id: orderId,
      captured_cents: 0,
      links: [{ href: `fixture://v2/payments/authorizations/${authId}`, rel: "self", method: "GET" }],
    };
    order.status = "COMPLETED";
    this.remember(opts.requestId, "authorize", orderId);
    return this.getOrder(orderId);
  }

  async getAuthorization(authorizationId: string): Promise<Authorization> {
    const a = this.state.auths[authorizationId];
    if (!a) throw err(404, "GET /v2/payments/authorizations/{id}", "INVALID_RESOURCE_ID", "Specified resource ID does not exist.");
    const { order_id: _o, captured_cents: _c, ...rest } = a;
    return clone(rest);
  }

  async captureAuthorization(authorizationId: string, input: CaptureInput): Promise<Capture> {
    const endpoint = "POST /v2/payments/authorizations/{id}/capture";
    const prior = this.replay(input.requestId, "capture");
    if (prior) return this.getCapture(prior);
    const a = this.state.auths[authorizationId];
    if (!a) throw err(404, endpoint, "INVALID_RESOURCE_ID", "Specified resource ID does not exist.");
    if (a.status === "VOIDED") throw err(422, endpoint, "AUTHORIZATION_VOIDED", "A voided authorization cannot be captured.");
    if (a.status === "CAPTURED") throw err(422, endpoint, "PREVIOUSLY_CAPTURED", "Authorization has been previously captured.");
    if (a.expiration_time && new Date(a.expiration_time).getTime() < this.now().getTime()) {
      throw err(422, endpoint, "AUTHORIZATION_EXPIRED", "An expired authorization cannot be captured.");
    }
    if (input.amount.currency_code !== a.amount!.currency_code) {
      throw err(422, endpoint, "AUTH_CURRENCY_MISMATCH", "Currency of capture must be the same as currency of authorization.");
    }
    const cents = toCents(input.amount.value);
    if (cents <= 0) throw err(422, endpoint, "INVALID_PARAMETER_VALUE", "The amount must be a positive number.");
    if (a.captured_cents + cents > toCents(a.amount!.value)) {
      throw err(422, endpoint, "MAX_CAPTURE_AMOUNT_EXCEEDED", "Capture amount specified exceeded allowable limit. You can only capture up to the original authorization amount.");
    }
    const id = this.id("CAP");
    a.captured_cents += cents;
    const full = a.captured_cents === toCents(a.amount!.value);
    a.status = input.finalCapture || full ? "CAPTURED" : "PARTIALLY_CAPTURED";
    a.update_time = this.ts();
    this.state.captures[id] = {
      id,
      status: "COMPLETED",
      amount: { currency_code: input.amount.currency_code, value: toValue(cents) },
      final_capture: input.finalCapture,
      invoice_id: input.invoiceId,
      note_to_payer: input.noteToPayer,
      create_time: this.ts(),
      update_time: this.ts(),
      authorization_id: authorizationId,
      seller_receivable_breakdown: fixtureFee(cents, input.amount.currency_code),
      links: [
        { href: `fixture://v2/payments/captures/${id}`, rel: "self", method: "GET" },
        { href: `fixture://v2/payments/authorizations/${authorizationId}`, rel: "up", method: "GET" },
      ],
    };
    this.remember(input.requestId, "capture", id);
    return this.getCapture(id);
  }

  async getCapture(captureId: string): Promise<Capture> {
    const c = this.state.captures[captureId];
    if (!c) throw err(404, "GET /v2/payments/captures/{id}", "INVALID_RESOURCE_ID", "Specified resource ID does not exist.");
    const { authorization_id: _a, ...rest } = c;
    return clone(rest);
  }

  async voidAuthorization(authorizationId: string, opts: { requestId: string }): Promise<Authorization | null> {
    const endpoint = "POST /v2/payments/authorizations/{id}/void";
    const prior = this.replay(opts.requestId, "void");
    if (prior) return this.getAuthorization(prior);
    const a = this.state.auths[authorizationId];
    if (!a) throw err(404, endpoint, "INVALID_RESOURCE_ID", "Specified resource ID does not exist.");
    if (a.status === "CAPTURED") throw err(422, endpoint, "PREVIOUSLY_CAPTURED", "Authorization has been previously captured and cannot be voided.");
    if (a.status === "VOIDED") throw err(422, endpoint, "PREVIOUSLY_VOIDED", "Authorization has been previously voided.");
    a.status = "VOIDED";
    a.update_time = this.ts();
    this.remember(opts.requestId, "void", authorizationId);
    return this.getAuthorization(authorizationId);
  }

  async createPayout(input: CreatePayoutInput): Promise<PayoutBatch> {
    this.state.payouts ??= {};
    const dup = Object.values(this.state.payouts).find((b) => b.batch_header.sender_batch_header.sender_batch_id === input.senderBatchId);
    if (dup) {
      throw new PayPalApiError(
        400,
        {
          name: "USER_BUSINESS_ERROR",
          message: "User business error.",
          debug_id: "fixture",
          details: [
            {
              field: "SENDER_BATCH_ID",
              issue: "Batch with given sender_batch_id already exists",
              link: [{ href: `fixture://v1/payments/payouts/${dup.batch_header.payout_batch_id}`, rel: "self", method: "GET" }],
            },
          ],
        },
        "POST /v1/payments/payouts",
      );
    }
    this.state.seq += 1;
    const id = `FXPOB${String(this.state.seq).padStart(8, "0")}`;
    const batch: PayoutBatch & { reads: number } = {
      batch_header: { payout_batch_id: id, batch_status: "PENDING", sender_batch_header: { sender_batch_id: input.senderBatchId, email_subject: input.emailSubject }, time_created: this.ts() },
      items: input.items.map((it, i) => ({
        payout_item_id: `FXPOI${String(this.state.seq).padStart(6, "0")}${i}`,
        payout_batch_id: id,
        transaction_status: "PENDING",
        payout_item_fee: { currency: it.amount.currency, value: FIXTURE_PAYOUT_ITEM_FEE },
        payout_item: clone(it),
      })),
      reads: 0,
    };
    this.state.payouts[id] = batch;
    const { items: _items, reads: _r, ...head } = clone(batch);
    return head;
  }

  // First read shows PROCESSING, later reads settle. Sandbox-looking emails
  // succeed; anything else stays UNCLAIMED like a real payout to an email
  // with no PayPal account.
  async getPayoutBatch(batchId: string): Promise<PayoutBatch> {
    const b = this.state.payouts?.[batchId];
    if (!b) throw err(404, "GET /v1/payments/payouts/{id}", "INVALID_RESOURCE_ID", "Batch not found.");
    b.reads += 1;
    const settled = b.reads > 1;
    b.batch_header.batch_status = settled ? "SUCCESS" : "PROCESSING";
    for (const it of b.items ?? []) {
      if (!settled) continue;
      const sandbox = /@(personal|business)\.example\.com$/i.test(it.payout_item.receiver) || it.payout_item.recipient_type === "PAYPAL_ID";
      it.transaction_status = sandbox ? "SUCCESS" : "UNCLAIMED";
      it.transaction_id ??= `FXTXN${it.payout_item_id.slice(5)}`;
      it.time_processed ??= this.ts();
    }
    const { reads: _r, ...rest } = clone(b);
    return rest;
  }
}
