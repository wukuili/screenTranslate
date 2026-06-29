export type ViewMode = "settings" | "capture" | "result";
export type TranslationProvider = "openai" | "baidu" | "deeplx";
export type OcrProvider = "windows" | "paddle";
export type InterfaceLanguage = "zh-CN" | "en";

export interface AppSettings {
  interfaceLanguage: InterfaceLanguage;
  translationProvider: TranslationProvider;
  ocrProvider: OcrProvider;
  paddleOcrApiUrl: string;
  baseUrl: string;
  model: string;
  baiduAppId: string;
  deeplxApiUrl: string;
  targetLanguage: string;
  shortcut: string;
  requestTimeoutMs: number;
  saveHistory: boolean;
  maxHistoryItems: number;
  autoCopy: boolean;
}

export interface CaptureSelection {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CaptureResult {
  imageDataUrl: string;
  selection: CaptureSelection;
  displayId?: number;
}

export interface TranslationBlock {
  sourceText: string;
  translatedText: string;
  bbox: CaptureSelection;
  fontHint?: {
    size?: number;
    weight?: "normal" | "medium" | "bold";
    color?: string;
  };
  backgroundHint?: {
    color?: string;
    opacity?: number;
  };
  confidence: number;
}

export interface TranslationResult {
  sourceLanguage: string;
  targetLanguage: string;
  blocks: TranslationBlock[];
}

export interface ApiTestResult {
  ok: boolean;
  message: string;
}

export interface SettingsSnapshot {
  settings: AppSettings;
  hasApiKey: boolean;
  hasBaiduSecretKey: boolean;
  hasDeeplxToken: boolean;
  storagePath: string;
}

export interface ResultPayload {
  capture: CaptureResult;
  translation: TranslationResult;
  usedFallback: boolean;
  captureFallbackReason?: string;
  translationFallbackReason?: string;
}

export type TranslatingStage = "ocr" | "translating";

export type ResultState =
  | { status: "translating"; capture: CaptureResult; stage: TranslatingStage }
  | { status: "done"; capture: CaptureResult; payload: ResultPayload };

export interface ScreenTranslateApi {
  getSettings: () => Promise<SettingsSnapshot>;
  saveSettings: (
    settings: AppSettings,
    apiKey?: string,
    baiduSecretKey?: string,
    deeplxToken?: string
  ) => Promise<AppSettings>;
  testConnection: (
    settings: AppSettings,
    apiKey?: string,
    baiduSecretKey?: string,
    deeplxToken?: string
  ) => Promise<ApiTestResult>;
  getCaptureWindowBounds: () => Promise<CaptureSelection>;
  completeCapture: (capture: CaptureResult) => Promise<void>;
  cancelCapture: () => Promise<void>;
  getResultPayload: () => Promise<ResultPayload | null>;
  getResultState: () => Promise<ResultState | null>;
  onResultState: (callback: (state: ResultState) => void) => () => void;
  clearHistory: () => Promise<void>;
  copyText: (text: string) => Promise<void>;
  closeCurrentWindow: () => Promise<void>;
  closeResultWindow: () => Promise<void>;
  retryLastCapture: () => Promise<void>;
}
