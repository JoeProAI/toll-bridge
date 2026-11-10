export interface CallView {
  call_id: string;
  quote_id: string;
  tool: string;
  price: string;
  verdict: "pass" | "fail";
  score?: number;
  checks: Record<string, boolean>;
  reasons: string[];
  title?: string;
  source_url?: string;
  charged: string;
  capture_id: string | null;
  capture_status: string | null;
  charge_error: string | null;
  attempts: number;
  model?: string;
  at: string;
  ms?: number;
}

export interface TabSummary {
  tab_id: string;
  mode: "fixtures" | "live-sandbox";
  status: "open" | "closed";
  order_id: string;
  authorization_id: string;
  authorization_status: string;
  held: string;
  captured: string;
  remaining: string;
  voided: string;
  calls: number;
  passed: number;
  failed: number;
  not_charged: string;
  expires_at?: string;
}

export interface TabView {
  tab: TabSummary;
  paypal: {
    order_id: string;
    order_status: string;
    authorization_id: string;
    authorization_status: string;
    captures: { id: string; status: string; amount: string; invoice_id?: string; at?: string }[];
  };
  calls: CallView[];
  prices: Record<string, string>;
  voided?: boolean;
}

export interface DemoInput {
  id: string;
  label: string;
  expect: "pass" | "fail";
  why: string;
  text: string;
}

export interface AppConfig {
  paypal_mode: "fixtures" | "live-sandbox";
  paypal_client_id: string | null;
  model_mode: "fake" | "workers-ai";
  models: { generator: string; judge: string };
  prices: Record<string, string>;
  budgets: string[];
  max_calls_per_tab: number;
  demo_inputs: DemoInput[];
}

export interface Claim {
  text: string;
  quote: string;
  span: { start: number; end: number } | null;
}
export interface Brief {
  title: string;
  summary: string;
  claims: Claim[];
  open_questions: string[];
}

export interface WringResult {
  call: CallView;
  replayed: boolean;
  verdict: { pass: boolean; score: number; checks: { name: string; pass: boolean; detail?: string }[]; reasons: string[] };
  result: Brief | null;
  rejected_output: Brief | null;
}

export interface QuoteResponse {
  quote: { quote_id: string; price: { value: string }; remaining: { value: string }; expires_at: string; terms: string };
  quote_token: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly body: unknown,
  ) {
    super(message);
  }
}

async function raw(path: string, init: RequestInit = {}) {
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers: { "content-type": "application/json", ...(init.headers ?? {}) }, credentials: "same-origin" });
  } catch {
    throw new ApiError(0, "offline", "Couldn't reach Toll Bridge. Check your connection and try again.", null);
  }
  const json = await res.json().catch(() => ({}));
  return { res, json };
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { res, json } = await raw(path, init);
  if (!res.ok) throw new ApiError(res.status, json?.error?.code ?? `http_${res.status}`, json?.error?.message ?? `Request failed (${res.status}).`, json);
  return json as T;
}

export const post = <T,>(path: string, body: unknown = {}, headers: Record<string, string> = {}) =>
  api<T>(path, { method: "POST", body: JSON.stringify(body), headers });

// The paid tool answers 402 with a quote first. That's the happy path here.
export async function requestQuote(input: string): Promise<QuoteResponse> {
  const { res, json } = await raw("/api/tools/wring", { method: "POST", body: JSON.stringify({ input }) });
  if (res.status === 402 && json.quote_token) return json as QuoteResponse;
  throw new ApiError(res.status, json?.error?.code ?? `http_${res.status}`, json?.error?.message ?? "No quote came back.", json);
}

export const shortId = (id: string | null | undefined, n = 6) => (id ? (id.length > n + 2 ? `…${id.slice(-n)}` : id) : "");
