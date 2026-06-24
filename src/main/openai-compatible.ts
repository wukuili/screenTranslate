import type { AppSettings, CaptureResult, TranslationResult } from "../shared/types";
import { extractJsonObject, parseTranslationResult } from "./translation-schema";

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
}

type MessageContent = NonNullable<NonNullable<ChatCompletionResponse["choices"]>[number]["message"]>["content"];

export async function translateScreenshot(
  settings: AppSettings,
  apiKey: string,
  capture: CaptureResult
): Promise<TranslationResult> {
  if (!apiKey.trim()) {
    throw new Error("API Key is required.");
  }

  if (!capture.imageDataUrl.trim()) {
    throw new Error("Screenshot image is required.");
  }

  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, settings.requestTimeoutMs);

  try {
    const response = await fetch(`${settings.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: settings.model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You extract and translate text from screenshots. Return strict JSON only. Coordinates must be relative to the input image."
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  `Translate visible text to ${settings.targetLanguage}. ` +
                  "Return JSON with sourceLanguage, targetLanguage, and blocks. " +
                  "Each block needs sourceText, translatedText, bbox as a JSON object {\"x\":number,\"y\":number,\"width\":number,\"height\":number} (not an array), optional fontHint, optional backgroundHint, and confidence 0..1."
              },
              {
                type: "image_url",
                image_url: { url: capture.imageDataUrl }
              }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`Model request failed: ${response.status} ${response.statusText}${await readErrorBody(response)}`);
    }

    const data = (await response.json()) as ChatCompletionResponse;
    const content = normalizeMessageContent(data.choices?.[0]?.message?.content);

    if (!content) {
      throw new Error("Model response did not include message content.");
    }

    return parseTranslationResult(extractJsonObject(content));
  } catch (error) {
    if (timedOut) {
      throw new Error(
        `Model request timed out after ${Math.round(settings.requestTimeoutMs / 1000)}s. ` +
          "Increase the timeout in settings, or verify the Base URL and that the model supports image input."
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

interface ChatMessage {
  role: "system" | "user";
  content: string;
}

interface TranslationsResponse {
  translations?: unknown;
}

export interface TranslatedSegment {
  lineIndices: number[];
  translatedText: string;
}

interface SegmentsResponse {
  segments?: unknown;
}

// Shared JSON chat-completion request with timeout handling. The OCR step already produced
// the source text, so these calls are text-only — far faster and cheaper than asking a
// vision model to read the screenshot and guess layout.
async function requestChatJson(settings: AppSettings, apiKey: string, messages: ChatMessage[]): Promise<unknown> {
  if (!apiKey.trim()) {
    throw new Error("API Key is required.");
  }

  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, settings.requestTimeoutMs);

  try {
    const response = await fetch(`${settings.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: settings.model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages
      })
    });

    if (!response.ok) {
      throw new Error(`Model request failed: ${response.status} ${response.statusText}${await readErrorBody(response)}`);
    }

    const data = (await response.json()) as ChatCompletionResponse;
    const content = normalizeMessageContent(data.choices?.[0]?.message?.content);

    if (!content) {
      throw new Error("Model response did not include message content.");
    }

    return extractJsonObject(content);
  } catch (error) {
    if (timedOut) {
      throw new Error(
        `Model request timed out after ${Math.round(settings.requestTimeoutMs / 1000)}s. ` +
          "Increase the timeout in settings, or verify the Base URL and model."
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// Merges OCR lines that belong to the same sentence/paragraph and translates each merged
// group in a single call. This fixes the case where one sentence is wrapped across several
// OCR lines, which produced poor per-line translations.
export async function translateGroupedLines(
  settings: AppSettings,
  apiKey: string,
  lines: string[]
): Promise<TranslatedSegment[]> {
  if (lines.length === 0) {
    return [];
  }

  const parsed = (await requestChatJson(settings, apiKey, [
    {
      role: "system",
      content:
        "You merge OCR text lines that belong to the same sentence or paragraph, then translate " +
        "each merged group. Return strict JSON only."
    },
    {
      role: "user",
      content:
        "These lines were extracted from an image by OCR, in reading order. A single sentence may be " +
        "split across consecutive lines. Merge consecutive lines that form one sentence or paragraph, " +
        `then translate each merged group into ${settings.targetLanguage}. ` +
        'Return JSON shaped as {"segments":[{"lineIndices":number[],"translatedText":string}]}. ' +
        "Rules: cover every line index exactly once and keep them in order; lineIndices are the 0-based " +
        `indices of the merged source lines; translatedText is the ${settings.targetLanguage} translation ` +
        "of the merged text.\n\n" +
        JSON.stringify({ lines: lines.map((text, index) => ({ index, text })) })
    }
  ])) as SegmentsResponse;

  const rawSegments = Array.isArray(parsed.segments) ? parsed.segments : [];
  const segments: TranslatedSegment[] = [];

  for (const raw of rawSegments) {
    if (!raw || typeof raw !== "object") {
      continue;
    }

    const candidate = raw as { lineIndices?: unknown; translatedText?: unknown };
    const indices = Array.isArray(candidate.lineIndices)
      ? candidate.lineIndices.filter(
          (value): value is number => Number.isInteger(value) && value >= 0 && value < lines.length
        )
      : [];
    const translatedText = typeof candidate.translatedText === "string" ? candidate.translatedText.trim() : "";

    if (indices.length === 0 || !translatedText) {
      continue;
    }

    segments.push({ lineIndices: indices, translatedText });
  }

  return segments;
}

// Per-line translation fallback used when grouping yields nothing usable.
export async function translateTexts(
  settings: AppSettings,
  apiKey: string,
  texts: string[]
): Promise<string[]> {
  if (texts.length === 0) {
    return [];
  }

  const parsed = (await requestChatJson(settings, apiKey, [
    {
      role: "system",
      content:
        "You are a translation engine. Translate each input line and return strict JSON only. " +
        "Preserve order and item count exactly. Do not merge or split lines."
    },
    {
      role: "user",
      content:
        `Translate each line below into ${settings.targetLanguage}. ` +
        'Return JSON shaped as {"translations": string[]} where translations[i] is the translation ' +
        "of line i, with the same number of items in the same order.\n\n" +
        JSON.stringify({ lines: texts })
    }
  ])) as TranslationsResponse;

  const translations = Array.isArray(parsed.translations) ? parsed.translations : [];

  return texts.map((original, index) => {
    const value = translations[index];
    return typeof value === "string" && value.trim() ? value : original;
  });
}

export async function testOpenAiCompatibleEndpoint(
  settings: AppSettings,
  apiKey: string
): Promise<void> {
  if (!apiKey.trim()) {
    throw new Error("API Key is required.");
  }

  const controller = new AbortController();
  const timeoutMs = Math.min(settings.requestTimeoutMs, 15000);
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(`${settings.baseUrl.replace(/\/$/, "")}/models`, {
      signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}` }
    });

    if (!response.ok) {
      throw new Error(`Connection failed: ${response.status} ${response.statusText}${await readErrorBody(response)}`);
    }
  } catch (error) {
    if (timedOut) {
      throw new Error(`Connection timed out after ${Math.round(timeoutMs / 1000)}s. Check the Base URL and your network.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeMessageContent(content: MessageContent): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => part.text ?? "")
      .filter(Boolean)
      .join("\n");
  }

  return "";
}

async function readErrorBody(response: Response): Promise<string> {
  const body = await response.text().catch(() => "");
  return body ? ` - ${body.slice(0, 500)}` : "";
}
