import { afterEach, describe, expect, it, vi } from "vitest";
import { workersAiConfig } from "@/lib/config";
import { modelFamily, verifierPolicy } from "@/lib/verify/policy";

describe("verifier policy", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("judges with a different model family than the generator by default", () => {
    vi.stubEnv("WRING_MODEL", "");
    vi.stubEnv("JUDGE_MODEL", "");
    delete process.env.WRING_MODEL;
    delete process.env.JUDGE_MODEL;
    const c = workersAiConfig();
    expect(c.judgeModel).toBe("@cf/mistralai/mistral-small-3.1-24b-instruct");
    expect(modelFamily(c.generatorModel)).toBe("meta");
    expect(modelFamily(c.judgeModel)).not.toBe(modelFamily(c.generatorModel));
  });

  it("hash is stable and moves when a model changes", () => {
    const a = verifierPolicy({ generator: "@cf/meta/x", judge: "@cf/mistralai/y" }).hash;
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(verifierPolicy({ generator: "@cf/meta/x", judge: "@cf/mistralai/y" }).hash).toBe(a);
    expect(verifierPolicy({ generator: "@cf/meta/x", judge: "@cf/meta/x" }).hash).not.toBe(a);
  });
});
