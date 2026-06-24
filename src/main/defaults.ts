import type { AppSettings, TranslationResult } from "../shared/types";

export const defaultSettings: AppSettings = {
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4.1-mini",
  targetLanguage: "中文",
  shortcut: "Ctrl+Alt+T",
  requestTimeoutMs: 60000,
  saveHistory: false,
  maxHistoryItems: 50,
  autoCopy: false
};

export const mockTranslation: TranslationResult = {
  sourceLanguage: "en",
  targetLanguage: "zh-CN",
  blocks: [
    {
      sourceText: "Translate text on screen",
      translatedText: "翻译屏幕上的文字",
      bbox: { x: 64, y: 64, width: 390, height: 42 },
      fontHint: { size: 18, weight: "bold", color: "#111827" },
      backgroundHint: { color: "#ffffff", opacity: 0.92 },
      confidence: 0.94
    },
    {
      sourceText: "OpenAI-compatible model",
      translatedText: "兼容 OpenAI 格式的大模型",
      bbox: { x: 64, y: 132, width: 340, height: 34 },
      fontHint: { size: 16, weight: "normal", color: "#1f2937" },
      backgroundHint: { color: "#ffffff", opacity: 0.9 },
      confidence: 0.9
    }
  ]
};
