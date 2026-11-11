import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ChatModel } from "@/lib/ai/model";
import { checkRsl, evaluateRsl, parseRsl, rslAllowsRun, type RslFetcher } from "@/lib/rsl";
import { hiddenTextCheck } from "@/lib/tab/engine";
import type { Brief } from "@/lib/tools/brief";
import { hiddenTextOf, htmlToText, resolveSource } from "@/lib/tools/source";
import type { WringOutput } from "@/lib/tools/wring";
import { runWring } from "@/lib/tools/wring";
import { verify, type Verdict } from "@/lib/verify/verifier";

export type BenchKind = "clean" | "thin" | "injected" | "forged_quote" | "offset_shift" | "invented_claim" | "prohibited" | "olp" | "unreadable";
export type BenchOutcome = "pass" | "fail" | "refuse";

export interface BenchItem {
  id: string;
  kind: BenchKind;
  expect: BenchOutcome;
  style?: string;
  page_url: string;
  html?: string;
  text?: string;
  license_xml?: string;
  // What the page fetch returned, for unreadable sources (blocked, challenge, rate limited).
  fetch?: { status: number; headers?: Record<string, string>; text: string };
  note?: string;
}

export interface BenchResult {
  id: string;
  kind: BenchKind;
  style?: string;
  expect: BenchOutcome;
  got: BenchOutcome;
  ok: boolean;
  score: number;
  reason: string;
  baseline?: BenchOutcome;
  error?: boolean;
}

export const INVENTED_CLAIM = "Officials confirmed the whole program will be shut down next month after a federal fraud audit";

export function readCorpus(dir: string): BenchItem[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as BenchItem);
}

// Tampering applied to the generator's own brief, after it was written.
export function attack(b: Brief, kind: BenchKind): Brief {
  const out = structuredClone(b);
  const c = out.claims[0];
  if (!c) return out;
  if (kind === "forged_quote") {
    const m = c.quote.match(/\d/);
    c.quote = m ? c.quote.replace(/\d/, String((Number(m[0]) + 1) % 10)) : c.quote.replace(/\b(\w{5,})\b/, "reportedly");
  } else if (kind === "offset_shift" && c.span) {
    c.span = { start: c.span.start + 7, end: c.span.end + 7 };
  } else if (kind === "invented_claim") {
    (out.claims[1] ?? c).text = INVENTED_CLAIM;
  }
  return out;
}

const mechanicalFail = (v: Verdict) => !v.pass && v.checks.some((c) => c.name !== "judge" && !c.pass);
const ATTACKS: BenchKind[] = ["forged_quote", "offset_shift", "invented_claim"];

type Generated = { out: WringOutput; v: Verdict };
export type GenCache = Map<string, Promise<Generated>>;

// One generation per source text, so attack items tamper with the same brief the clean item was scored on.
function generate(text: string, m: { generator: ChatModel; judge: ChatModel }, cache: GenCache): Promise<Generated> {
  let g = cache.get(text);
  if (!g) {
    g = (async () => {
      let out = await runWring(m.generator, text);
      let v = await verify(text, out.brief, m.judge);
      if (mechanicalFail(v)) {
        out = await runWring(m.generator, text, v.reasons);
        v = await verify(text, out.brief, m.judge);
      }
      return { out, v };
    })();
    cache.set(text, g);
  }
  return g;
}

const fetcherFor = (item: BenchItem): RslFetcher => async (url) => ({
  status: item.fetch!.status,
  url,
  headers: new Headers({ "content-type": "text/html", ...(item.fetch!.headers ?? {}) }),
  text: item.fetch!.text,
});

// Mirrors the tool path: RSL gate, page fetch, one self-repair on mechanical failures, judge, hidden-text check.
export async function runItem(item: BenchItem, m: { generator: ChatModel; judge: ChatModel }, cache: GenCache = new Map()): Promise<BenchResult> {
  const base = { id: item.id, kind: item.kind, style: item.style, expect: item.expect };
  const done = (got: BenchOutcome, score: number, reason: string, extra: Partial<BenchResult> = {}): BenchResult => ({ ...base, got, ok: got === item.expect, score, reason, ...extra });
  try {
    let text = item.html ? htmlToText(item.html) : (item.text ?? "");
    let hidden = item.html ? hiddenTextOf(item.html) : [];
    if (item.fetch) {
      const fetcher = fetcherFor(item);
      const r = await checkRsl(item.page_url, { fetcher });
      if (!rslAllowsRun(r)) return done("refuse", 0, `RSL ${r.status}: ${r.reason}`);
      try {
        const src = await resolveSource(item.page_url, fetcher);
        text = src.text;
        hidden = src.hidden;
      } catch (e) {
        return done("refuse", 0, `not run (RSL ${r.status}): ${(e as Error).message}`);
      }
    } else if (item.license_xml) {
      const r = evaluateRsl(parseRsl(item.license_xml), item.page_url);
      if (!rslAllowsRun({ ...r, sourceUrl: item.page_url })) return done("refuse", 0, `RSL ${r.status}: ${r.reason}`);
    }
    const { out, v: clean } = await generate(text, m, cache);
    let v = clean;
    let brief = out.brief;
    let baseline: BenchOutcome | undefined;
    if (ATTACKS.includes(item.kind)) {
      baseline = hiddenTextCheck(v, brief, hidden).pass ? "pass" : "fail";
      brief = attack(brief, item.kind);
      v = await verify(text, brief, m.judge);
    }
    v = hiddenTextCheck(v, brief, hidden);
    return done(v.pass ? "pass" : "fail", v.score, v.pass ? "" : (v.reasons[0] ?? ""), baseline ? { baseline } : {});
  } catch (e) {
    return done("fail", 0, `error: ${(e as Error).message}`.slice(0, 200), { error: true });
  }
}

export async function runBench(items: BenchItem[], m: { generator: ChatModel; judge: ChatModel }, onResult?: (r: BenchResult) => void) {
  const results: BenchResult[] = [];
  const cache: GenCache = new Map();
  for (const it of items) {
    const r = await runItem(it, m, cache);
    results.push(r);
    onResult?.(r);
  }
  return results;
}

const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(1)}%` : "n/a");

export function benchStats(rs: BenchResult[]) {
  const clean = rs.filter((r) => r.expect === "pass");
  const bad = rs.filter((r) => r.expect !== "pass");
  const falsePass = bad.filter((r) => r.got === "pass");
  const falseFail = clean.filter((r) => r.got !== "pass");
  return {
    total: rs.length,
    clean: clean.length,
    bad: bad.length,
    caught: bad.length - falsePass.length,
    catchRate: pct(bad.length - falsePass.length, bad.length),
    falsePassRate: pct(falsePass.length, bad.length),
    falseFailRate: pct(falseFail.length, clean.length),
    misses: rs.filter((r) => !r.ok),
    errors: rs.filter((r) => r.error).length,
  };
}

export function resultsMarkdown(rs: BenchResult[], meta: { date: string; mode: string; generator: string; judge: string; sha: string }) {
  const s = benchStats(rs);
  const byKind = [...new Set(rs.map((r) => r.kind))].map((k) => {
    const g = rs.filter((r) => r.kind === k);
    return `| ${k} | ${g.length} | ${g.filter((r) => r.ok).length} |`;
  });
  const cell = (x: string) => x.replace(/\|/g, "\\|").replace(/\n/g, " ");
  return [
    `# Bench results (${meta.mode})`,
    "",
    `- Date: ${meta.date}`,
    `- Git SHA: ${meta.sha}`,
    `- Generator: \`${meta.generator}\``,
    `- Judge: \`${meta.judge}\``,
    `- Items: ${s.total} (${s.clean} should pass, ${s.bad} should fail or be refused)`,
    `- Catch rate: ${s.catchRate} (${s.caught}/${s.bad})`,
    `- False-pass rate: ${s.falsePassRate}`,
    `- False-fail rate: ${s.falseFailRate}`,
    `- Errors: ${s.errors}`,
    "",
    "Run once, no tuning after the run. Each source text is generated once. Attacks (forged quote, offset shift, invented claim) tamper with that same brief after it was written; `baseline` is its verdict before tampering.",
    "",
    "| Kind | Items | Matched expectation |",
    "| --- | --- | --- |",
    ...byKind,
    "",
    "## Misses",
    "",
    ...(s.misses.length ? s.misses.map((r) => `- \`${r.id}\` expected ${r.expect}, got ${r.got}${r.reason ? `: ${cell(r.reason)}` : ""}`) : ["None."]),
    "",
    "## Every verdict",
    "",
    "| Item | Kind | Style | Expected | Got | Baseline | Score | Reason |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...rs.map((r) => `| ${r.id} | ${r.kind} | ${r.style ?? ""} | ${r.expect} | ${r.got}${r.ok ? "" : " (miss)"} | ${r.baseline ?? ""} | ${r.score} | ${cell(r.reason)} |`),
    "",
  ].join("\n");
}
