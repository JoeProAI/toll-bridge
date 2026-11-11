import { NextResponse } from "next/server";
import { BUDGET_CHOICES_CENTS, MAX_CALLS_PER_TAB, modelMode, paypalMode, PRICES_CENTS, workersAiConfig } from "@/lib/config";
import { toValue } from "@/lib/money";
import { DEMO_INPUTS } from "@/lib/demo/inputs";

export const dynamic = "force-dynamic";

export function GET() {
  const mode = paypalMode();
  const m = modelMode();
  return NextResponse.json({
    paypal_mode: mode,
    paypal_client_id: mode === "live-sandbox" ? process.env.PAYPAL_CLIENT_ID : null,
    model_mode: m,
    models: m === "workers-ai" ? { generator: workersAiConfig().generatorModel, judge: workersAiConfig().judgeModel } : { generator: "fake", judge: "fake" },
    prices: Object.fromEntries(Object.entries(PRICES_CENTS).map(([k, v]) => [k, toValue(v)])),
    budgets: BUDGET_CHOICES_CENTS.map(toValue),
    max_calls_per_tab: MAX_CALLS_PER_TAB,
    demo_inputs: DEMO_INPUTS.map(({ id, label, expect, why, text }) => ({ id, label, expect, why, text })),
  });
}
