import type { AppSettings, TranslationResult } from "../shared/types";

export const defaultSettings: AppSettings = {
  translationProvider: "openai",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4.1-mini",
  baiduAppId: "",
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

export function createMockCaptureImageDataUrl(width = 720, height = 420): string {
  const safeWidth = Math.max(420, Math.round(width));
  const safeHeight = Math.max(260, Math.round(height));
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${safeWidth}" height="${safeHeight}">
      <rect width="100%" height="100%" fill="#f8fafc"/>
      <rect x="28" y="24" width="${safeWidth - 56}" height="${safeHeight - 48}" rx="18" fill="#ffffff" stroke="#dbe3ef"/>
      <text x="64" y="84" font-family="Arial" font-size="26" font-weight="700" fill="#111827">Translate text on screen</text>
      <text x="64" y="152" font-family="Arial" font-size="21" fill="#1f2937">OpenAI-compatible model</text>
      <text x="64" y="${safeHeight - 56}" font-family="Arial" font-size="15" fill="#64748b">Fallback capture used because native screenshot failed or API is not configured.</text>
    </svg>
  `;

  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}
