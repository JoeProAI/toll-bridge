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
    judgeModel: env("JUDGE_MODEL") ?? "@cf/meta/llama-3.1-8b-instruct-fast",
  };
}

const DEV_SECRET = "toll-bridge-dev-only-secret-do-not-use-in-prod";

export function tabSecret(): string {
  const s = env("TAB_SECRET");
  if (s) return s;
  const creds = paypalCredentials();
  if (creds) return `derived:${creds.clientSecret}`;
  return DEV_SECRET;
}

export function publicBaseUrl(): string {
  const explicit = env("PUBLIC_BASE_URL");
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = env("VERCEL_PROJECT_PRODUCTION_URL") ?? env("VERCEL_URL");
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}
