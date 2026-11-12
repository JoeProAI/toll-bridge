// npm run bench        deterministic fake model, runs in CI
// npm run bench:live -- --out bench/run2 [--split dev|holdout]
//                      real Workers AI models, writes <out>/RESULTS.md and <out>/answers.json.
//                      bench/RESULTS.md is the first run and is never overwritten.
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { FakeModel } from "../src/lib/ai/fake";
import { WorkersAiModel } from "../src/lib/ai/workers";
import { benchStats, readCorpus, resultsMarkdown, runBench, type BenchResult, type BenchSplit } from "../src/lib/bench";
import { workersAiConfig } from "../src/lib/config";

const live = process.argv.includes("--live");
const c = workersAiConfig();
if (live && (!c.accountId || !c.token)) throw new Error("bench:live needs CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_AI_API_TOKEN");
const models = live
  ? { generator: new WorkersAiModel(c.accountId, c.token, c.generatorModel), judge: new WorkersAiModel(c.accountId, c.token, c.judgeModel) }
  : { generator: new FakeModel(), judge: new FakeModel() };

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const outDir = arg("--out");
const only = arg("--split");
if (only && only !== "dev" && only !== "holdout") throw new Error("--split must be dev or holdout");
if (live && (!outDir || outDir.replace(/\/$/, "") === "bench")) throw new Error("bench:live needs --out <dir> other than bench/ (bench/RESULTS.md is the first run and stays as it was)");
const split: BenchSplit | null = existsSync("bench/split.json") ? JSON.parse(readFileSync("bench/split.json", "utf8")) : null;
if (only && !split) throw new Error("--split needs bench/split.json (npm run bench:split)");
const items = readCorpus("bench/corpus").filter((i) => !only || split!.items[i.id] === only);
console.log(`bench: ${items.length} items${only ? ` (${only} split)` : ""}, ${live ? `live (writer ${c.generatorModel}, judge ${c.judgeModel})` : "deterministic fake model, not a real AI"}`);
const results = await runBench(items, models, (r) => console.log(`${r.ok ? "  ok  " : " MISS "} ${r.id.padEnd(34)} expected ${r.expect.padEnd(6)} got ${r.got.padEnd(6)} ${r.reason.slice(0, 90)}`));
const s = benchStats(results);
console.log(`\ncatch rate ${s.catchRate} (${s.caught}/${s.bad}), false-pass ${s.falsePassRate}, false-fail ${s.falseFailRate}, misses ${s.misses.length}, errors ${s.errors}`);

const bySplit = (rs: BenchResult[]) =>
  split
    ? ["dev", "holdout"].flatMap((k) => {
        const g = rs.filter((r) => split.items[r.id] === k);
        if (!g.length) return [];
        const t = benchStats(g);
        return [`- ${k}: ${g.length} items, catch ${t.catchRate} (${t.caught}/${t.bad}), handled safely ${t.corrected.handledRate}, false-fail ${t.falseFailRate}, errors ${t.errors}`];
      })
    : [];
for (const line of bySplit(results)) console.log(line);

if (live) {
  mkdirSync(outDir!, { recursive: true });
  const sha = execSync("git rev-parse HEAD").toString().trim();
  const md = resultsMarkdown(results, { date: new Date().toISOString(), mode: `live Workers AI${only ? `, ${only} split` : ""}`, generator: c.generatorModel, judge: c.judgeModel, sha });
  const splitMd = split ? ["", "## By split (bench/split.json, fixed before this run)", "", `Hold-out sources: ${split.holdout_sources.join(", ")}.`, "", ...bySplit(results), ""] : [];
  writeFileSync(`${outDir}/RESULTS.md`, md + splitMd.join("\n"));
  writeFileSync(`${outDir}/answers.json`, JSON.stringify(results.filter((r) => r.answer !== undefined).map(({ id, got, injected, hidden_use, answer }) => ({ id, got, injected, hidden_use, answer })), null, 2) + "\n");
  console.log(`wrote ${outDir}/RESULTS.md and ${outDir}/answers.json`);
} else if (s.misses.length) {
  process.exit(1);
}
