import type { FixtureState } from "../paypal/fixtures";
import type { PayPalMode, SettlementMode, ToolName } from "../config";
import type { PayoutPlan } from "../royalty/ledger";
import type { RslPayee, RslStatus, RslVia } from "../rsl/types";
import type { Check } from "../verify/verifier";

export interface CallRecord {
  id: string;
  qid: string;
  tool: ToolName;
  priceCents: number;
  verdict: "pass" | "fail" | "refused";
  score: number;
  checks: [Check["name"], boolean][];
  reasons: string[];
  title: string;
  inputHash: string;
  source?: string;
  captureId?: string;
  captureStatus?: string;
  chargeError?: string;
  captureFeeCents?: number;
  model?: string;
  judgeModel?: string;
  attempts?: number;
  // RSL terms read at quote time, and the royalty quoted for this source.
  rsl?: { status: RslStatus; reason: string; licenseUrl?: string; via?: RslVia; policyHash?: string };
  royalty?: { cents: number; payee: RslPayee; policyHash?: string; licenseUrl?: string };
  // What this call owes: tool fee plus earned royalty. 0 unless it passed.
  chargeCents?: number;
  pageSha256?: string;
  spans?: { start: number; end: number; quote: string }[];
  at: string;
  ms: number;
}

export interface FinalCapture {
  id: string;
  status: string;
  cents: number;
  feeCents?: number;
  netCents?: number;
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
  closeAction?: "void" | "none" | "final-capture" | "final-capture+void";
  voidedCents?: number;
  // Missing on tokens minted before settlement modes existed: per-call.
  settlement?: SettlementMode;
  finalCapture?: FinalCapture;
  payout?: PayoutPlan;
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
  settlement?: SettlementMode;
  createdAt: string;
  fx?: FixtureState;
}

export interface Quote {
  qid: string;
  tab: string;
  tool: ToolName;
  priceCents: number;
  inputHash: string;
  sourceUrl?: string;
  rsl?: CallRecord["rsl"];
  royalty?: CallRecord["royalty"];
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
