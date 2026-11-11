export type PayPalMode = "live-sandbox" | "fixtures";
export type ModelMode = "workers-ai" | "fake";

export const SANDBOX_API = "https://api-m.sandbox.paypal.com";

export const PRICES_CENTS = { wring: 50 } as const;
export type ToolName = keyof typeof PRICES_CENTS;

export const BUDGET_CHOICES_CENTS = [200, 500, 1000] as const;
export const MAX_BUDGET_CENTS = 2000;
export const MAX_CALLS_PER_TAB = 16;
export const QUOTE_TTL_MS = 10 * 60 * 1000;
export const MAX_INPUT_CHARS = 9000;
export const MIN_INPUT_CHARS = 200;

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

export function paypalCredentials() {
  const clientId = env("PAYPAL_CLIENT_ID");
  const clientSecret = env("PAYPAL_CLIENT_SECRET");
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export function paypalMode(): PayPalMode {
  const explicit = env("PAYPAL_MODE");
  const ppEnv = env("PAYPAL_ENV") ?? "sandbox";
  if (ppEnv !== "sandbox") {
    throw new Error("Toll Bridge only talks to the PayPal sandbox. Set PAYPAL_ENV=sandbox.");
  }
  if (explicit === "fixtures") return "fixtures";
  if (explicit === "live-sandbox") {
    if (!paypalCredentials()) throw new Error("PAYPAL_MODE=live-sandbox needs PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET");
    return "live-sandbox";
  }
  if (explicit) throw new Error(`Unknown PAYPAL_MODE ${explicit}. Use live-sandbox or fixtures.`);
  return paypalCredentials() ? "live-sandbox" : "fixtures";
}

export function modelMode(): ModelMode {
  const explicit = env("MODEL_MODE");
  if (explicit === "fake") return "fake";
  if (explicit === "workers-ai") return "workers-ai";
  return env("CLOUDFLARE_ACCOUNT_ID") && env("CLOUDFLARE_AI_API_TOKEN") ? "workers-ai" : "fake";
}

export function workersAiConfig() {
  return {
    accountId: env("CLOUDFLARE_ACCOUNT_ID") ?? "",
    token: env("CLOUDFLARE_AI_API_TOKEN") ?? "",
    generatorModel: env("WRING_MODEL") ?? "@cf/meta/llama-3.1-8b-instruct-fast",
    // Judge is a different model family from the generator (Mistral vs Meta Llama).
    judgeModel: env("JUDGE_MODEL") ?? "@cf/mistralai/mistral-small-3.1-24b-instruct",
  };
}

const DEV_SECRET = "toll-bridge-dev-only-secret-do-not-use-in-prod";

// Signs tab, quote and receipt tokens. Live sandbox and any Vercel deploy
// must set TAB_SECRET explicitly; only local fixtures fall back to a dev key.
export function tabSecret(): string {
  const s = env("TAB_SECRET");
  if (s) {
    if (s.length < 16) throw new Error("TAB_SECRET is too short. Use at least 16 characters (openssl rand -hex 32).");
    return s;
  }
  if (paypalMode() === "live-sandbox" || env("VERCEL")) {
    throw new Error("TAB_SECRET is not set. It's required in live-sandbox mode and on Vercel.");
  }
  return DEV_SECRET;
}

export type SettlementMode = "tab" | "per-call";

// "tab" (default): passing calls accrue and close makes one final capture.
// "per-call": capture each passing call right away.
export function settlementMode(): SettlementMode {
  const v = env("SETTLEMENT_MODE");
  if (!v || v === "tab") return "tab";
  if (v === "per-call") return "per-call";
  throw new Error(`Unknown SETTLEMENT_MODE ${v}. Use tab or per-call.`);
}

export const DEFAULT_PAYOUT_THRESHOLD_CENTS = 500;

export function payoutThresholdCents(): number {
  const v = env("PAYOUT_THRESHOLD_USD");
  if (!v) return DEFAULT_PAYOUT_THRESHOLD_CENTS;
  if (!/^\d+(\.\d{1,2})?$/.test(v)) throw new Error("PAYOUT_THRESHOLD_USD must look like 5.00");
  const [w, f = ""] = v.split(".");
  return Number(w) * 100 + Number((f + "00").slice(0, 2));
}

// Upstash Redis REST, either the Vercel Marketplace names or Upstash's own.
export function kvConfig(): { url: string; token: string } | null {
  const url = env("KV_REST_API_URL") ?? env("UPSTASH_REDIS_REST_URL");
  const token = env("KV_REST_API_TOKEN") ?? env("UPSTASH_REDIS_REST_TOKEN");
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

export function publicBaseUrl(): string {
  const explicit = env("PUBLIC_BASE_URL");
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = env("VERCEL_PROJECT_PRODUCTION_URL") ?? env("VERCEL_URL");
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

// Ed25519 receipt key: a 32-byte seed, base64 (openssl rand -base64 32).
// Without it, local and fixture runs use a published dev key and say so.
export const DEV_RECEIPT_SEED = "dG9sbC1icmlkZ2UtZGV2LXJlY2VpcHQta2V5LW5vdCE=";

export function receiptSeed(): { seed: Buffer; dev: boolean } {
  const v = env("RECEIPT_SIGNING_KEY");
  if (v) {
    const seed = Buffer.from(v, "base64");
    if (seed.length !== 32) throw new Error("RECEIPT_SIGNING_KEY must be a 32-byte Ed25519 seed in base64 (openssl rand -base64 32).");
    return { seed, dev: false };
  }
  if (paypalMode() === "live-sandbox" || env("VERCEL")) {
    throw new Error("RECEIPT_SIGNING_KEY is not set. It's required in live-sandbox mode and on Vercel.");
  }
  return { seed: Buffer.from(DEV_RECEIPT_SEED, "base64"), dev: true };
}
