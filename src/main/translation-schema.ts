import { z } from "zod";
import type { TranslationResult } from "../shared/types";

const colorSchema = z.string().regex(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i).optional();

const blockSchema = z.object({
  sourceText: z.string().min(1),
  translatedText: z.string().min(1),
  bbox: z.object({
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().positive(),
    height: z.number().positive()
  }),
  fontHint: z
    .object({
      size: z.number().positive().optional(),
      weight: z.enum(["normal", "medium", "bold"]).optional(),
      color: colorSchema
    })
    .optional(),
  backgroundHint: z
    .object({
      color: colorSchema,
      opacity: z.number().min(0).max(1).optional()
    })
    .optional(),
  confidence: z.number().min(0).max(1).default(0.5)
});

const translationSchema = z.object({
  sourceLanguage: z.string().min(1),
  targetLanguage: z.string().min(1),
  blocks: z.array(blockSchema).default([])
});

export function parseTranslationResult(raw: unknown): TranslationResult {
  return translationSchema.parse(raw);
}

export function extractJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON object found in model response.");
  }

  return JSON.parse(candidate.slice(start, end + 1));
}
