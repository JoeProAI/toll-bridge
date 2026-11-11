import { describe, expect, it } from "vitest";
import { FakeModel } from "@/lib/ai/fake";
import { attack, benchStats, readCorpus, runBench } from "@/lib/bench";

describe("bench (deterministic fake model)", () => {
  it("every corpus item meets its expectation", async () => {
    const items = readCorpus("bench/corpus");
    expect(items.length).toBeGreaterThanOrEqual(30);
    const rs = await runBench(items, { generator: new FakeModel(), judge: new FakeModel() });
    expect(benchStats(rs).misses.map((r) => `${r.id}: ${r.got} ${r.reason}`)).toEqual([]);
  }, 60_000);

  it("attacks change the brief they are given, not the original", () => {
    const b = { title: "t", summary: "s", claims: [{ text: "x", quote: "In 2024 it rained", span: { start: 0, end: 17 } }], open_questions: [] };
    expect(attack(b, "forged_quote").claims[0].quote).toBe("In 3024 it rained");
    expect(attack(b, "offset_shift").claims[0].span).toEqual({ start: 7, end: 24 });
    expect(b.claims[0]).toEqual({ text: "x", quote: "In 2024 it rained", span: { start: 0, end: 17 } });
  });
});
