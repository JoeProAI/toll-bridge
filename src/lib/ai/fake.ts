import type { ChatModel, JsonRequest, JsonResponse } from "./model";

// Deterministic stand-in used by tests and by `MODEL_MODE=fake`.
// The generator quotes real sentences; the judge scores by substance.

const sentences = (text: string) =>
  text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 40 && s.length <= 260 && !/https?:|cookie|subscribe|click/i.test(s));

export function fakeBrief(input: string) {
  const picked = sentences(input).slice(0, 5);
  return {
    title: (picked[0] ?? input.slice(0, 60)).split(/[,.;:]/)[0].slice(0, 70),
    summary: picked.slice(0, 2).join(" ").slice(0, 400) || input.slice(0, 120),
    claims: picked.map((s) => ({ text: s.replace(/[.!?]$/, ""), quote: s })),
    open_questions: ["What happens next, and who owns it?"],
  };
}

export function fakeJudge(meta: Record<string, unknown> | undefined) {
  const brief = (meta?.brief ?? {}) as { claims?: unknown[] };
  const n = Array.isArray(brief.claims) ? brief.claims.length : 0;
  const good = n >= 3;
  return {
    faithfulness: good ? 9 : 4,
    coverage: good ? 8 : 3,
    usefulness: good ? 8 : 2,
    issues: good ? [] : ["The source has too little substance for a useful brief."],
  };
}

export class FakeModel implements ChatModel {
  readonly name = "fake/deterministic";
  calls: JsonRequest[] = [];

  constructor(private readonly override?: (req: JsonRequest) => unknown) {}

  async json(req: JsonRequest): Promise<JsonResponse> {
    this.calls.push(req);
    const data = this.override
      ? this.override(req)
      : req.task === "wring"
        ? fakeBrief(String(req.meta?.input ?? ""))
        : fakeJudge(req.meta);
    return { data, raw: JSON.stringify(data), model: this.name };
  }
}
