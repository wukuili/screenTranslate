import type { AppSettings, CaptureResult, TranslationResult } from "../shared/types";
import { extractJsonObject, parseTranslationResult } from "./translation-schema";

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

export async function translateScreenshot(
  settings: AppSettings,
  apiKey: string,
  capture: CaptureResult
): Promise<TranslationResult> {
  if (!apiKey.trim()) {
    throw new Error("API Key is required.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), settings.requestTimeoutMs);

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
                  "Each block needs sourceText, translatedText, bbox {x,y,width,height}, optional fontHint, optional backgroundHint, and confidence 0..1."
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
      throw new Error(`Model request failed: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as ChatCompletionResponse;
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("Model response did not include message content.");
    }

    return parseTranslationResult(extractJsonObject(content));
  } finally {
    clearTimeout(timeout);
  }
}

export async function testOpenAiCompatibleEndpoint(
  settings: AppSettings,
  apiKey: string
): Promise<void> {
  if (!apiKey.trim()) {
    throw new Error("API Key is required.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(settings.requestTimeoutMs, 15000));

  try {
    const response = await fetch(`${settings.baseUrl.replace(/\/$/, "")}/models`, {
      signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}` }
    });

    if (!response.ok) {
      throw new Error(`Connection failed: ${response.status} ${response.statusText}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}
