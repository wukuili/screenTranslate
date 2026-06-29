import type { AppSettings } from "../shared/types";
import { chunkArray, mapConcurrent } from "./concurrency";

interface DeeplxResponse {
  code?: number;
  data?: unknown;
  message?: string;
}

const DEEPLX_TRANSLATION_BATCH_SIZE = 6;
const DEEPLX_TRANSLATION_CONCURRENCY = 3;

export async function translateTextsWithDeeplx(
  settings: AppSettings,
  token: string,
  texts: string[]
): Promise<string[]> {
  if (texts.length === 0) {
    return [];
  }

  const indexedTexts = texts.map((text, index) => ({ text, index }));
  const batches = chunkArray(indexedTexts, DEEPLX_TRANSLATION_BATCH_SIZE);
  const translated = new Array<string>(texts.length);

  await mapConcurrent(batches, DEEPLX_TRANSLATION_CONCURRENCY, async (batch) => {
    await Promise.all(
      batch.map(async (item) => {
        translated[item.index] = await requestDeeplxTranslation(settings, token, item.text);
      })
    );
  });

  return texts.map((original, index) => translated[index] || original);
}

export async function testDeeplxEndpoint(settings: AppSettings, token: string): Promise<void> {
  await requestDeeplxTranslation(settings, token, "hello");
}

async function requestDeeplxTranslation(settings: AppSettings, token: string, text: string): Promise<string> {
  const endpoint = normalizeEndpoint(settings.deeplxApiUrl);
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, settings.requestTimeoutMs);

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };

    if (token.trim()) {
      headers.Authorization = `Bearer ${token.trim()}`;
    }

    const response = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers,
      body: JSON.stringify({
        text,
        source_lang: "auto",
        target_lang: toDeeplxLanguageCode(settings.targetLanguage)
      })
    });

    const body = (await response.json().catch(() => null)) as DeeplxResponse | null;

    if (!response.ok) {
      throw new Error(`DeepLX request failed: ${response.status} ${response.statusText}${formatDeeplxMessage(body)}`);
    }

    const translated = extractTranslatedText(body);
    if (!translated) {
      throw new Error("DeepLX response did not include translated text.");
    }

    return translated;
  } catch (error) {
    if (timedOut) {
      throw new Error(`DeepLX request timed out after ${Math.round(settings.requestTimeoutMs / 1000)}s.`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeEndpoint(apiUrl: string): string {
  const endpoint = apiUrl.trim();
  if (!endpoint) {
    throw new Error("DeepLX API URL is required.");
  }

  return endpoint.endsWith("/translate") ? endpoint : `${endpoint.replace(/\/$/, "")}/translate`;
}

function extractTranslatedText(response: DeeplxResponse | null): string {
  if (typeof response?.data === "string") {
    return response.data.trim();
  }

  if (response?.data && typeof response.data === "object") {
    const data = response.data as { text?: unknown; translation?: unknown; translatedText?: unknown };
    const candidate = data.text ?? data.translation ?? data.translatedText;
    return typeof candidate === "string" ? candidate.trim() : "";
  }

  return "";
}

function formatDeeplxMessage(response: DeeplxResponse | null): string {
  return response?.message ? ` - ${response.message.slice(0, 500)}` : "";
}

export function toDeeplxLanguageCode(targetLanguage: string): string {
  const normalized = targetLanguage.trim().toLowerCase();
  const compact = normalized.replace(/[\s_-]/g, "");

  const mapping: Record<string, string> = {
    zh: "ZH",
    zhcn: "ZH",
    hans: "ZH",
    chinese: "ZH",
    "中文": "ZH",
    "简体中文": "ZH",
    en: "EN",
    english: "EN",
    "英语": "EN",
    ja: "JA",
    jp: "JA",
    japanese: "JA",
    "日语": "JA",
    ko: "KO",
    kor: "KO",
    korean: "KO",
    "韩语": "KO",
    fr: "FR",
    fra: "FR",
    french: "FR",
    "法语": "FR",
    es: "ES",
    spa: "ES",
    spanish: "ES",
    "西班牙语": "ES",
    ru: "RU",
    russian: "RU",
    "俄语": "RU",
    de: "DE",
    german: "DE",
    "德语": "DE"
  };

  return mapping[compact] ?? targetLanguage.trim().toUpperCase();
}
