import type { FixtureState } from "../paypal/fixtures";
import type { PayPalMode, ToolName } from "../config";
import type { Check } from "../verify/verifier";

export interface CallRecord {
  id: string;
  qid: string;
  tool: ToolName;
  priceCents: number;
  verdict: "pass" | "fail";
  score: number;
  checks: [Check["name"], boolean][];
  reasons: string[];
  title: string;
  inputHash: string;
  source?: string;
  captureId?: string;
  captureStatus?: string;
  chargeError?: string;
  model?: string;
  attempts?: number;
  at: string;
  ms: number;
}

export interface TabState {
  v: 1;
  id: string;
  mode: PayPalMode;
  orderId: string;
  authorizationId: string;
  currency: "USD";
  heldCents: number;
  status: "open" | "closed";
  openedAt: string;
  expiresAt?: string;
  closedAt?: string;
  closeAction?: "void" | "none";
  voidedCents?: number;
  payer?: string;
  calls: CallRecord[];
  fx?: FixtureState;
}

export interface PendingTab {
  v: 1;
  id: string;
  mode: PayPalMode;
  orderId: string;
  heldCents: number;
  createdAt: string;
  fx?: FixtureState;
}

export interface Quote {
  qid: string;
  tab: string;
  tool: ToolName;
  priceCents: number;
  inputHash: string;
  exp: number;
}

export interface Reconciled {
  orderStatus: string;
  authorizationStatus: string;
  heldCents: number;
  capturedCents: number;
  remainingCents: number;
  captures: { id: string; status: string; cents: number; invoiceId?: string; at?: string }[];
  expiresAt?: string;
  source: "paypal-sandbox" | "fixtures";
}
