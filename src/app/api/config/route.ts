import { NextResponse } from "next/server";
import { BUDGET_CHOICES_CENTS, MAX_CALLS_PER_TAB, modelMode, paypalMode, PRICES_CENTS, workersAiConfig } from "@/lib/config";
import { toValue } from "@/lib/money";
import { DEMO_INPUTS } from "@/lib/demo/inputs";
import { modelFamily, verifierPolicy } from "@/lib/verify/policy";

export const dynamic = "force-dynamic";

export function GET() {
  const mode = paypalMode();
  const m = modelMode();
  const models = m === "workers-ai" ? { generator: workersAiConfig().generatorModel, judge: workersAiConfig().judgeModel } : { generator: "fake/deterministic", judge: "fake/deterministic" };
  return NextResponse.json({
    paypal_mode: mode,
    paypal_client_id: mode === "live-sandbox" ? process.env.PAYPAL_CLIENT_ID : null,
    model_mode: m,
    models,
    model_families: { generator: modelFamily(models.generator), judge: modelFamily(models.judge) },
    policy_hash: verifierPolicy(models).hash,
    prices: Object.fromEntries(Object.entries(PRICES_CENTS).map(([k, v]) => [k, toValue(v)])),
    budgets: BUDGET_CHOICES_CENTS.map(toValue),
    max_calls_per_tab: MAX_CALLS_PER_TAB,
    demo_inputs: DEMO_INPUTS.map(({ id, label, expect, why, text }) => ({ id, label, expect, why, text })),
  });
}
