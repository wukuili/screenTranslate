import { createHash, randomUUID } from "node:crypto";
import type { AppSettings } from "../shared/types";

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

export async function translateTextsWithBaidu(
  settings: AppSettings,
  secretKey: string,
  texts: string[]
): Promise<string[]> {
  if (texts.length === 0) {
    return [];
  }

  const response = await requestBaiduTranslate(settings, secretKey, texts.join("\n"));
  const results = response.trans_result ?? [];
  const singleJoinedResult =
    results.length === 1 && texts.length > 1 ? results[0].dst?.split(/\r?\n/) ?? [] : [];

  return texts.map((original, index) => {
    const translated = (results[index]?.dst ?? singleJoinedResult[index])?.trim();
    return translated || original;
  });
}

export async function testBaiduTranslateEndpoint(settings: AppSettings, secretKey: string): Promise<void> {
  await requestBaiduTranslate(settings, secretKey, "hello");
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
      throw new Error(`Baidu translate failed: ${data.error_code} ${data.error_msg ?? ""}`.trim());
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
