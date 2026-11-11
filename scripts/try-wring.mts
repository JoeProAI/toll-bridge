import { WorkersAiModel } from "../src/lib/ai/workers";
import { runWring } from "../src/lib/tools/wring";
import { verify } from "../src/lib/verify/verifier";
import { workersAiConfig } from "../src/lib/config";
import { DEMO_INPUTS } from "../src/lib/demo/inputs";
const cfg = workersAiConfig();
const gen = process.env.GEN ?? cfg.generatorModel, judge = process.env.JUDGE ?? cfg.judgeModel;
const m = new WorkersAiModel(process.env.CLOUDFLARE_ACCOUNT_ID!, process.env.CLOUDFLARE_AI_API_TOKEN!, gen);
const j = new WorkersAiModel(process.env.CLOUDFLARE_ACCOUNT_ID!, process.env.CLOUDFLARE_AI_API_TOKEN!, judge);
for (const d of DEMO_INPUTS) {
  const t0 = Date.now();
  try {
    let w = await runWring(m, d.text);
    let v = await verify(d.text, w.brief, j);
    if (!v.pass && v.checks.some((c) => c.name !== "judge" && !c.pass)) {
      console.log("   retry after:", v.reasons.join("; "));
      w = await runWring(m, d.text, v.reasons);
      v = await verify(d.text, w.brief, j);
    }
    console.log(d.id, d.expect, "=>", v.pass ? "PASS" : "FAIL", v.score, Date.now() - t0, "ms");
    for (const c of v.checks) console.log("   ", c.pass ? "ok " : "BAD", c.name, c.detail);
    if (process.env.SHOW) console.log(JSON.stringify(w.brief, null, 1).slice(0, 1500));
  } catch (e) { console.log(d.id, "ERR", (e as Error).message); }
}
