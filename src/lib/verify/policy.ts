import { createHash } from "node:crypto";
import { canonicalJson } from "@/lib/receipt";
import { WRING_SYSTEM } from "@/lib/tools/wring";
import { JUDGE_JSON_SCHEMA, JUDGE_SYSTEM, RULES } from "./verifier";

// "@cf/mistralai/mistral-small-3.1-24b-instruct" -> "mistralai"
export const modelFamily = (id: string) => id.replace(/^@cf\//, "").split("/")[0];

// Everything that decides whether a call gets paid. Change any of it and the hash changes.
export function verifierPolicy(models: { generator: string; judge: string }) {
  const policy = { rules: RULES, judge_system: JUDGE_SYSTEM, judge_schema: JUDGE_JSON_SCHEMA, wring_system: WRING_SYSTEM, models };
  return { policy, hash: createHash("sha256").update(canonicalJson(policy)).digest("hex") };
}
