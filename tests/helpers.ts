import { FakeModel } from "@/lib/ai/fake";
import type { ChatModel } from "@/lib/ai/model";
import { FixturePayPal } from "@/lib/paypal/fixtures";
import { claimTab, openTab, type Deps } from "@/lib/tab/engine";
import { DEMO_INPUTS } from "@/lib/demo/inputs";

export const PASS_TEXT = DEMO_INPUTS.find((d) => d.id === "outage")!.text;
export const SEAWALL_TEXT = DEMO_INPUTS.find((d) => d.id === "seawall")!.text;
export const GUMMIES_TEXT = DEMO_INPUTS.find((d) => d.id === "gummies")!.text;

export function makeDeps(over: Partial<Deps> & { generator?: ChatModel; judge?: ChatModel; clock?: { t: number } } = {}): Deps & { paypal: FixturePayPal } {
  const clock = over.clock ?? { t: Date.parse("2026-11-10T15:00:00Z") };
  const now = () => new Date(clock.t);
  return {
    paypal: new FixturePayPal(undefined, now),
    generator: over.generator ?? new FakeModel(),
    judge: over.judge ?? new FakeModel(),
    secret: "test-secret",
    baseUrl: "http://localhost:3000",
    now,
    ...over,
  } as Deps & { paypal: FixturePayPal };
}

export async function openedTab(d: Deps & { paypal: FixturePayPal }, budgetCents = 200) {
  const opened = await openTab(d, budgetCents);
  d.paypal.approve(opened.orderId);
  return claimTab(d, opened.pending);
}
