// Writes bench/split.json once, before any run that tunes anything. Never edit it after.
//   npm run bench:split
import { existsSync, writeFileSync } from "node:fs";
import { makeSplit, readCorpus } from "../src/lib/bench";

const out = "bench/split.json";
if (existsSync(out) && !process.argv.includes("--force")) throw new Error(`${out} already exists. The hold-out is fixed once committed.`);
const split = makeSplit(readCorpus("bench/corpus"), "toll-bridge-holdout-v1");
writeFileSync(out, JSON.stringify(split, null, 2) + "\n");
const n = (k: string) => Object.values(split.items).filter((v) => v === k).length;
console.log(`wrote ${out}: holdout sources ${split.holdout_sources.join(", ")}; ${n("holdout")} holdout items, ${n("dev")} dev items`);
