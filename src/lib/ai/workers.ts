import { ModelError, parseJsonLoose, type ChatModel, type JsonRequest, type JsonResponse } from "./model";

type Fetch = typeof fetch;

// Cloudflare Workers AI over REST. Calls are capped per instance so a busy
// demo can't run past the free daily allocation.
const MAX_CALLS_PER_INSTANCE_PER_HOUR = Number(process.env.MODEL_HOURLY_CAP ?? 120);
const window = { start: Date.now(), count: 0 };

export class WorkersAiModel implements ChatModel {
  constructor(
    private readonly accountId: string,
    private readonly token: string,
    readonly name: string,
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  async json(req: JsonRequest): Promise<JsonResponse> {
    if (Date.now() - window.start > 3600_000) {
      window.start = Date.now();
      window.count = 0;
    }
    if (++window.count > MAX_CALLS_PER_INSTANCE_PER_HOUR) throw new ModelError("model call cap reached, try again later");
    const body: Record<string, unknown> = {
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.user },
      ],
      max_tokens: Math.min(req.maxTokens, 1200),
      temperature: req.task === "judge" ? 0 : 0.2,
    };
    if (req.schema) body.response_format = { type: "json_schema", json_schema: req.schema };
    const url = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/${this.name}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45_000);
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
        cache: "no-store",
      });
    } catch (e) {
      throw new ModelError(`Workers AI unreachable: ${(e as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
    const payload = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      errors?: { message?: string }[];
      result?: { response?: unknown; choices?: { message?: { content?: string } }[]; usage?: JsonResponse["usage"] };
    };
    if (!res.ok || payload.success === false) {
      throw new ModelError(`Workers AI ${res.status}: ${payload.errors?.map((e) => e.message).join("; ") ?? "error"}`);
    }
    const r = payload.result ?? {};
    const content = r.response ?? r.choices?.[0]?.message?.content;
    if (content === undefined || content === null) throw new ModelError("Workers AI returned no content");
    if (typeof content === "object") return { data: content, raw: JSON.stringify(content), model: this.name, usage: r.usage };
    const raw = String(content);
    return { data: parseJsonLoose(raw), raw, model: this.name, usage: r.usage };
  }
}
