export interface JsonRequest {
  task: "wring" | "judge";
  system: string;
  user: string;
  maxTokens: number;
  schema?: Record<string, unknown>;
  // Raw material for deterministic fakes. Real models only see system/user.
  meta?: Record<string, unknown>;
}

export interface JsonResponse {
  data: unknown;
  raw: string;
  model: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export interface ChatModel {
  readonly name: string;
  json(req: JsonRequest): Promise<JsonResponse>;
}

export class ModelError extends Error {}

export function parseJsonLoose(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new ModelError("model did not return JSON");
  }
}
