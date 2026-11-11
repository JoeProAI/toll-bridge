import { FakeModel } from "@/lib/ai/fake";
import type { ChatModel } from "@/lib/ai/model";
import { WorkersAiModel } from "@/lib/ai/workers";
import { modelMode, payoutThresholdCents, paypalCredentials, paypalMode, publicBaseUrl, settlementMode, tabSecret, workersAiConfig, type PayPalMode } from "@/lib/config";
import { kvFromEnv } from "@/lib/royalty/kv";
import type { PayPalClient } from "@/lib/paypal/client";
import { emptyFixtureState, FixturePayPal, type FixtureState } from "@/lib/paypal/fixtures";
import { LiveSandboxPayPal } from "@/lib/paypal/live";
import type { Deps } from "@/lib/tab/engine";

let live: LiveSandboxPayPal | null = null;

function paypalFor(mode: PayPalMode, fx?: FixtureState): PayPalClient {
  if (mode === "fixtures") return new FixturePayPal(structuredClone(fx ?? emptyFixtureState()));
  const creds = paypalCredentials();
  if (!creds) throw new Error("This tab was opened against the PayPal sandbox, but sandbox credentials are not configured.");
  live ??= new LiveSandboxPayPal(creds.clientId, creds.clientSecret);
  return live;
}

function models(): { generator: ChatModel; judge: ChatModel } {
  if (modelMode() === "fake") return { generator: new FakeModel(), judge: new FakeModel() };
  const c = workersAiConfig();
  return {
    generator: new WorkersAiModel(c.accountId, c.token, c.generatorModel),
    judge: new WorkersAiModel(c.accountId, c.token, c.judgeModel),
  };
}

// Deps for a request. Fixture tabs carry their own fake-PayPal state inside
// the signed token, so they work on serverless with no database.
export function depsFor(opts: { mode?: PayPalMode; fx?: FixtureState; baseUrl?: string } = {}): Deps {
  const mode = opts.mode ?? paypalMode();
  return {
    paypal: paypalFor(mode, opts.fx),
    ...models(),
    secret: tabSecret(),
    baseUrl: opts.baseUrl ?? publicBaseUrl(),
    // Fixture tabs keep their royalties in the tab token; KV is for real sandbox money.
    kv: mode === "live-sandbox" ? kvFromEnv() : null,
    thresholdCents: payoutThresholdCents(),
    settlement: settlementMode(),
  };
}
