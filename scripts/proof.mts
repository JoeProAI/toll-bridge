// npm run proof: typecheck, lint, tests (fixtures, no network), then the
// live sandbox run if PayPal sandbox credentials are present.
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const cache = "node_modules/.cache/toll-bridge";
mkdirSync(cache, { recursive: true });

function step(name: string, cmd: string, args: string[], env: Record<string, string> = {}) {
  console.log(`\n== ${name}: ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { stdio: "inherit", env: { ...process.env, ...env } });
  if (r.status !== 0) {
    console.error(`\nproof FAILED at ${name}`);
    process.exit(r.status ?? 1);
  }
}

step("typecheck", "npx", ["tsc", "--noEmit"]);
step("lint", "npx", ["eslint", "--max-warnings=0"]);
// Tests force fixtures + fake models and block the network.
step("tests", "npx", ["vitest", "run", "--reporter=default", "--reporter=json", `--outputFile.json=${cache}/vitest.json`], {
  PAYPAL_MODE: "fixtures",
  MODEL_MODE: "fake",
});

const v = JSON.parse(readFileSync(`${cache}/vitest.json`, "utf8"));
const tests = { total: v.numTotalTests, passed: v.numPassedTests, failed: v.numFailedTests, files: v.testResults.length, mode: "fixtures" };
writeFileSync(`${cache}/tests.json`, JSON.stringify(tests));
console.log(`\ntests: ${tests.passed}/${tests.total} passed in ${tests.files} files (fixtures mode, no network)`);

if (process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET && process.env.PROOF_SKIP_LIVE !== "1") {
  step("live sandbox", "npx", ["tsx", "scripts/live-proof.mts"], { PAYPAL_MODE: "live-sandbox" });
} else {
  console.log("\nlive sandbox run skipped: no PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET. Committed proof/ files are untouched.");
}
console.log("\nproof passed");
