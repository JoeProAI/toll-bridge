export const RSL_NS = "https://rslstandard.org/rsl";
export const RSL_MEDIA_TYPE = "application/rsl+xml";
// Our proposed <accepts> media type for PayPal Payouts. Not registered with RSL.
export const PAYOUT_ACCEPTS_TYPE = "application/vnd.tollbridge.paypal-payout+json";
// What a wring call does with the page: grounding a generated answer.
export const OUR_USAGE = "ai-input";

export type RslStatus = "prohibited" | "paid_use" | "terms_no_payee" | "unlicensed" | "olp_required" | "unreadable";
export type RslVia = "link-header" | "html-link" | "robots";

export interface RslPayee {
  recipient_type: "EMAIL" | "PAYPAL_ID";
  receiver: string;
}

export interface RslResult {
  status: RslStatus;
  sourceUrl: string;
  reason: string;
  licenseUrl?: string;
  via?: RslVia;
  contentUrl?: string;
  // sha256 of the license document, so a receipt pins the exact terms.
  policyHash?: string;
  royaltyCents?: number;
  currency?: string;
  payee?: RslPayee;
  paymentType?: string;
}

/** Whether we may run the tool on this source at all. */
export function rslAllowsRun(r: RslResult): boolean {
  return r.status !== "prohibited" && r.status !== "olp_required";
}

export interface FetchedDoc {
  status: number;
  url: string;
  headers: { get(name: string): string | null };
  text: string;
}

export type RslFetcher = (url: string, accept: string) => Promise<FetchedDoc>;
