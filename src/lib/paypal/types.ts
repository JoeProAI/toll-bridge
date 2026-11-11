export interface Money {
  currency_code: string;
  value: string;
}

export interface Link {
  href: string;
  rel: string;
  method?: string;
}

export type AuthorizationStatus = "CREATED" | "CAPTURED" | "DENIED" | "PARTIALLY_CAPTURED" | "VOIDED" | "PENDING";
export type CaptureStatus = "COMPLETED" | "DECLINED" | "PARTIALLY_REFUNDED" | "PENDING" | "REFUNDED" | "FAILED";
export type OrderStatus = "CREATED" | "SAVED" | "APPROVED" | "VOIDED" | "COMPLETED" | "PAYER_ACTION_REQUIRED";

export interface Authorization {
  id: string;
  status: AuthorizationStatus;
  amount?: Money;
  invoice_id?: string;
  custom_id?: string;
  expiration_time?: string;
  create_time?: string;
  update_time?: string;
  links?: Link[];
}

export interface Capture {
  id: string;
  status: CaptureStatus;
  amount?: Money;
  final_capture?: boolean;
  invoice_id?: string;
  custom_id?: string;
  note_to_payer?: string;
  create_time?: string;
  update_time?: string;
  status_details?: { reason?: string };
  seller_receivable_breakdown?: { gross_amount?: Money; paypal_fee?: Money; net_amount?: Money };
  links?: Link[];
}

export interface PurchaseUnit {
  reference_id?: string;
  description?: string;
  custom_id?: string;
  amount?: Money;
  payments?: {
    authorizations?: Authorization[];
    captures?: Capture[];
  };
}

export interface Order {
  id: string;
  status: OrderStatus;
  intent?: "CAPTURE" | "AUTHORIZE";
  purchase_units?: PurchaseUnit[];
  payer?: { email_address?: string; payer_id?: string; name?: { given_name?: string; surname?: string } };
  create_time?: string;
  update_time?: string;
  links?: Link[];
}

export interface PayPalErrorBody {
  name?: string;
  message?: string;
  debug_id?: string;
  details?: { issue?: string; description?: string; field?: string; link?: Link[] }[];
}

// Payouts API v1 (/v1/payments/payouts). Amounts use { value, currency }.
export interface PayoutMoney {
  value: string;
  currency: string;
}

export interface PayoutItemInput {
  recipient_type: "EMAIL" | "PAYPAL_ID";
  receiver: string;
  amount: PayoutMoney;
  sender_item_id: string;
  note?: string;
}

export type PayoutBatchStatus = "PENDING" | "PROCESSING" | "SUCCESS" | "DENIED" | "CANCELED";
export type PayoutItemStatus = "SUCCESS" | "FAILED" | "PENDING" | "UNCLAIMED" | "RETURNED" | "ONHOLD" | "BLOCKED" | "REFUNDED" | "REVERSED";

export interface PayoutItem {
  payout_item_id: string;
  transaction_id?: string;
  transaction_status?: PayoutItemStatus;
  payout_item_fee?: PayoutMoney;
  payout_batch_id: string;
  payout_item: PayoutItemInput;
  time_processed?: string;
  errors?: { name?: string; message?: string };
}

export interface PayoutBatch {
  batch_header: {
    payout_batch_id: string;
    batch_status: PayoutBatchStatus;
    sender_batch_header: { sender_batch_id: string; email_subject?: string };
    amount?: PayoutMoney;
    fees?: PayoutMoney;
    time_created?: string;
  };
  items?: PayoutItem[];
}
