// npm run bench        deterministic fake model, runs in CI
// npm run bench:live   real Workers AI models, writes bench/RESULTS.md (run once, no tuning after)
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { FakeModel } from "../src/lib/ai/fake";
import { WorkersAiModel } from "../src/lib/ai/workers";
import { benchStats, readCorpus, resultsMarkdown, runBench } from "../src/lib/bench";
import { workersAiConfig } from "../src/lib/config";

const live = process.argv.includes("--live");
const c = workersAiConfig();
if (live && (!c.accountId || !c.token)) throw new Error("bench:live needs CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_AI_API_TOKEN");
const models = live
  ? { generator: new WorkersAiModel(c.accountId, c.token, c.generatorModel), judge: new WorkersAiModel(c.accountId, c.token, c.judgeModel) }
  : { generator: new FakeModel(), judge: new FakeModel() };

const items = readCorpus("bench/corpus");
console.log(`bench: ${items.length} items, ${live ? `live (writer ${c.generatorModel}, judge ${c.judgeModel})` : "deterministic fake model, not a real AI"}`);
const results = await runBench(items, models, (r) => console.log(`${r.ok ? "  ok  " : " MISS "} ${r.id.padEnd(34)} expected ${r.expect.padEnd(6)} got ${r.got.padEnd(6)} ${r.reason.slice(0, 90)}`));
const s = benchStats(results);
console.log(`\ncatch rate ${s.catchRate} (${s.caught}/${s.bad}), false-pass ${s.falsePassRate}, false-fail ${s.falseFailRate}, misses ${s.misses.length}, errors ${s.errors}`);

if (live) {
  const sha = execSync("git rev-parse HEAD").toString().trim();
  writeFileSync("bench/RESULTS.md", resultsMarkdown(results, { date: new Date().toISOString(), mode: "live Workers AI", generator: c.generatorModel, judge: c.judgeModel, sha }));
  console.log("wrote bench/RESULTS.md");
} else if (s.misses.length) {
  process.exit(1);
}
