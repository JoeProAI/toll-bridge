import { z } from "zod";

export const ClaimSchema = z
  .object({
    text: z.string().min(8).max(400),
    quote: z.string().min(1).max(600),
    span: z.object({ start: z.number().int().min(0), end: z.number().int().min(0) }).nullable(),
  })
  .strict();

export const BriefSchema = z
  .object({
    title: z.string().min(3).max(120),
    summary: z.string().min(1).max(900),
    claims: z.array(ClaimSchema).max(12),
    open_questions: z.array(z.string().max(300)).max(6),
  })
  .strict();

export type Brief = z.infer<typeof BriefSchema>;
export type Claim = z.infer<typeof ClaimSchema>;

// JSON schema handed to Workers AI json mode (spans are added server-side).
export const GENERATOR_JSON_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    claims: {
      type: "array",
      items: {
        type: "object",
        properties: { text: { type: "string" }, quote: { type: "string" } },
        required: ["text", "quote"],
      },
    },
    open_questions: { type: "array", items: { type: "string" } },
  },
  required: ["title", "summary", "claims", "open_questions"],
};
