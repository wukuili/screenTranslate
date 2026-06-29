import { createHash, randomUUID } from "node:crypto";
import type { AppSettings } from "../shared/types";
import { chunkArray } from "./concurrency";

interface BaiduTranslateResponse {
  from?: string;
  to?: string;
  trans_result?: Array<{
    src?: string;
    dst?: string;
  }>;
  error_code?: string;
  error_msg?: string;
}

const BAIDU_TRANSLATE_ENDPOINT = "https://fanyi-api.baidu.com/api/trans/vip/translate";
const BAIDU_TRANSLATION_BATCH_SIZE = 20;
const BAIDU_REQUEST_INTERVAL_MS = 1000;
const BAIDU_ACCESS_LIMIT_ERROR = "54003";
const BAIDU_ACCESS_LIMIT_RETRY_DELAYS_MS = [1500, 3000, 6000];

export async function translateTextsWithBaidu(
  settings: AppSettings,
  secretKey: string,
  texts: string[]
): Promise<string[]> {
  if (texts.length === 0) {
    return [];
  }

  const indexedTexts = texts.map((text, index) => ({ text, index }));
  const batches = chunkArray(indexedTexts, BAIDU_TRANSLATION_BATCH_SIZE);
  const translated = new Array<string>(texts.length);

  for (const [batchIndex, batch] of batches.entries()) {
    if (batchIndex > 0) {
      await sleep(BAIDU_REQUEST_INTERVAL_MS);
    }

    const response = await requestBaiduTranslateWithRetry(
      settings,
      secretKey,
      batch.map((item) => item.text).join("\n")
    );
    const results = response.trans_result ?? [];
    const singleJoinedResult =
      results.length === 1 && batch.length > 1 ? results[0].dst?.split(/\r?\n/) ?? [] : [];

    batch.forEach((item, batchIndex) => {
      const result = (results[batchIndex]?.dst ?? singleJoinedResult[batchIndex])?.trim();
      translated[item.index] = result || item.text;
    });
  }

  return texts.map((original, index) => {
    return translated[index] || original;
  });
}

export async function testBaiduTranslateEndpoint(settings: AppSettings, secretKey: string): Promise<void> {
  await requestBaiduTranslateWithRetry(settings, secretKey, "hello");
}

async function requestBaiduTranslateWithRetry(
  settings: AppSettings,
  secretKey: string,
  text: string
): Promise<BaiduTranslateResponse> {
  for (let attempt = 0; attempt <= BAIDU_ACCESS_LIMIT_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await requestBaiduTranslate(settings, secretKey, text);
    } catch (error) {
      if (!isBaiduAccessLimitError(error) || attempt >= BAIDU_ACCESS_LIMIT_RETRY_DELAYS_MS.length) {
        throw error;
      }

      await sleep(BAIDU_ACCESS_LIMIT_RETRY_DELAYS_MS[attempt]);
    }
  }

  throw new Error("Baidu translate failed after retrying access limit errors.");
}

async function requestBaiduTranslate(
  settings: AppSettings,
  secretKey: string,
  text: string
): Promise<BaiduTranslateResponse> {
  if (!settings.baiduAppId.trim()) {
    throw new Error("Baidu App ID is required.");
  }

  if (!secretKey.trim()) {
    throw new Error("Baidu Secret Key is required.");
  }

  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, settings.requestTimeoutMs);

  try {
    const salt = randomUUID();
    const targetLanguage = toBaiduLanguageCode(settings.targetLanguage);
    const params = new URLSearchParams({
      q: text,
      from: "auto",
      to: targetLanguage,
      appid: settings.baiduAppId.trim(),
      salt,
      sign: sign(settings.baiduAppId.trim(), text, salt, secretKey.trim())
    });

    const response = await fetch(BAIDU_TRANSLATE_ENDPOINT, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: params
    });

    if (!response.ok) {
      throw new Error(`Baidu translate request failed: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as BaiduTranslateResponse;
    if (data.error_code) {
      throw new BaiduTranslateError(data.error_code, data.error_msg);
    }

    return data;
  } catch (error) {
    if (timedOut) {
      throw new Error(
        `Baidu translate request timed out after ${Math.round(settings.requestTimeoutMs / 1000)}s.`
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

class BaiduTranslateError extends Error {
  constructor(
    readonly code: string,
    message?: string
  ) {
    super(`Baidu translate failed: ${code} ${message ?? ""}`.trim());
    this.name = "BaiduTranslateError";
  }
}

function isBaiduAccessLimitError(error: unknown): boolean {
  return error instanceof BaiduTranslateError && error.code === BAIDU_ACCESS_LIMIT_ERROR;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sign(appId: string, text: string, salt: string, secretKey: string): string {
  return createHash("md5").update(`${appId}${text}${salt}${secretKey}`).digest("hex");
}

function toBaiduLanguageCode(targetLanguage: string): string {
  const normalized = targetLanguage.trim().toLowerCase();
  const compact = normalized.replace(/[\s_-]/g, "");

  const mapping: Record<string, string> = {
    zh: "zh",
    zhcn: "zh",
    chinese: "zh",
    "中文": "zh",
    "简体中文": "zh",
    en: "en",
    english: "en",
    "英语": "en",
    jp: "jp",
    ja: "jp",
    japanese: "jp",
    "日语": "jp",
    kor: "kor",
    ko: "kor",
    korean: "kor",
    "韩语": "kor",
    fra: "fra",
    fr: "fra",
    french: "fra",
    "法语": "fra",
    spa: "spa",
    es: "spa",
    spanish: "spa",
    "西班牙语": "spa",
    ru: "ru",
    russian: "ru",
    "俄语": "ru",
    de: "de",
    german: "de",
    "德语": "de"
  };

  return mapping[compact] ?? "zh";
}
