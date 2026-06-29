import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import type {
  AppSettings,
  CaptureResult,
  CaptureSelection,
  ResultPayload,
  ResultState,
  ScreenTranslateApi,
  SettingsSnapshot,
  TranslatingStage
} from "../shared/types";
import { getOverlayContentHeight, getTranslationChipPlacements } from "./overlay-layout";
import "./styles.css";

const screenTranslate = window.screenTranslate ?? createBrowserMockApi();

const translations = {
  "zh-CN": {
    loadingSettings: "正在加载设置...",
    appName: "屏幕翻译",
    appDescription: "按下全局快捷键，选择屏幕上的文字区域，并在原位置显示翻译结果。",
    saveSettings: "保存设置",
    ready: "就绪",
    saving: "正在保存...",
    settingsSaved: "设置已保存。",
    testingConnection: "正在测试连接...",
    clearingHistory: "正在清除历史...",
    historyCleared: "历史已清除。",
    translationEngine: "翻译引擎",
    engine: "引擎",
    largeModel: "大模型",
    baiduTranslate: "百度翻译",
    deeplxTranslate: "DeepLX",
    ocrEngine: "OCR 引擎",
    windowsOcr: "Windows 默认 OCR",
    paddleOcr: "PaddleOCR",
    paddleOcrApiUrl: "PaddleOCR API 地址",
    largeModelSettings: "大模型",
    baseUrl: "Base URL",
    apiKey: "API Key",
    apiKeySavedPlaceholder: "已保存。留空则保留当前密钥",
    apiKeyPlaceholder: "输入 API Key",
    model: "模型",
    testConnection: "测试连接",
    baiduSettings: "百度翻译",
    baiduAppId: "App ID",
    baiduAppIdPlaceholder: "百度翻译 App ID",
    baiduSecretKey: "Secret Key",
    baiduSecretSavedPlaceholder: "已保存。留空则保留当前密钥",
    baiduSecretPlaceholder: "输入 Secret Key",
    testBaidu: "测试百度",
    deeplxSettings: "DeepLX",
    deeplxApiUrl: "DeepLX API 地址",
    deeplxApiUrlPlaceholder: "http://127.0.0.1:1188/translate",
    deeplxToken: "DeepLX Token",
    deeplxTokenSavedPlaceholder: "已保存。留空则保留当前 Token",
    deeplxTokenPlaceholder: "可选 Token",
    testDeeplx: "测试 DeepLX",
    translation: "翻译",
    interfaceLanguage: "界面语言",
    chinese: "中文",
    english: "English",
    targetLanguage: "目标语言",
    shortcut: "快捷键",
    timeout: "超时时间",
    autoCopy: "自动复制翻译文本",
    privacy: "隐私",
    privacyDescription: "截图会使用所选本地 OCR 引擎处理。识别出的文字会发送给所选翻译服务。历史记录默认关闭，启用后仅保存在本机。",
    saveHistory: "保存历史记录",
    maxHistoryItems: "最大历史条数",
    clearHistory: "清除历史",
    status: "状态",
    apiKeySaved: "API Key 已安全保存并隐藏。",
    baiduSecretSaved: "百度 Secret Key 已安全保存并隐藏。",
    deeplxTokenSaved: "DeepLX Token 已安全保存并隐藏。",
    settingsFile: "设置文件",
    defaultShortcut: "默认快捷键：Ctrl + Alt + T。若快捷键截图已暂停，可使用托盘菜单。",
    captureTip: "拖拽选择区域。按 Esc 取消。",
    preparingTranslation: "正在准备翻译...",
    fallbackUsed: "已使用备用结果",
    translated: "已翻译",
    overlay: "覆盖",
    original: "原图",
    text: "文本",
    copy: "复制",
    retry: "重试",
    close: "关闭",
    capturedRegion: "截图区域",
    recognizingText: "正在识别文字...",
    translating: "正在翻译...",
    cancel: "取消",
    preloadFailed: "预加载失败",
    preloadFailedDescription: "桌面桥接未加载，无法保存设置。请重启应用，或在重新构建后运行 npm run dev。"
  },
  en: {
    loadingSettings: "Loading settings...",
    appName: "Screen Translate",
    appDescription: "Press the global shortcut, select text on screen, and redraw the translation in place.",
    saveSettings: "Save settings",
    ready: "Ready",
    saving: "Saving...",
    settingsSaved: "Settings saved.",
    testingConnection: "Testing connection...",
    clearingHistory: "Clearing history...",
    historyCleared: "History cleared.",
    translationEngine: "Translation Engine",
    engine: "Engine",
    largeModel: "Large model",
    baiduTranslate: "Baidu Translate",
    deeplxTranslate: "DeepLX",
    ocrEngine: "OCR engine",
    windowsOcr: "Windows default OCR",
    paddleOcr: "PaddleOCR",
    paddleOcrApiUrl: "PaddleOCR API URL",
    largeModelSettings: "Large Model",
    baseUrl: "Base URL",
    apiKey: "API Key",
    apiKeySavedPlaceholder: "Saved. Leave blank to keep current key",
    apiKeyPlaceholder: "Enter API key",
    model: "Model",
    testConnection: "Test connection",
    baiduSettings: "Baidu Translate",
    baiduAppId: "App ID",
    baiduAppIdPlaceholder: "Baidu Translate App ID",
    baiduSecretKey: "Secret Key",
    baiduSecretSavedPlaceholder: "Saved. Leave blank to keep current key",
    baiduSecretPlaceholder: "Enter Secret Key",
    testBaidu: "Test Baidu",
    deeplxSettings: "DeepLX",
    deeplxApiUrl: "DeepLX API URL",
    deeplxApiUrlPlaceholder: "http://127.0.0.1:1188/translate",
    deeplxToken: "DeepLX Token",
    deeplxTokenSavedPlaceholder: "Saved. Leave blank to keep current token",
    deeplxTokenPlaceholder: "Optional token",
    testDeeplx: "Test DeepLX",
    translation: "Translation",
    interfaceLanguage: "Interface language",
    chinese: "中文",
    english: "English",
    targetLanguage: "Target language",
    shortcut: "Shortcut",
    timeout: "Timeout",
    autoCopy: "Auto-copy translated text",
    privacy: "Privacy",
    privacyDescription:
      "Screenshots are processed with the selected local OCR engine. Recognized text is sent to the selected translation service. History is off by default and stored locally only when enabled.",
    saveHistory: "Save history",
    maxHistoryItems: "Maximum history items",
    clearHistory: "Clear history",
    status: "Status",
    apiKeySaved: "API key is saved securely and hidden.",
    baiduSecretSaved: "Baidu Secret Key is saved securely and hidden.",
    deeplxTokenSaved: "DeepLX token is saved securely and hidden.",
    settingsFile: "Settings file",
    defaultShortcut: "Default shortcut: Ctrl + Alt + T. Use the tray menu if shortcut capture is paused.",
    captureTip: "Drag to select a region. Press Esc to cancel.",
    preparingTranslation: "Preparing translation...",
    fallbackUsed: "Fallback used",
    translated: "Translated",
    overlay: "Overlay",
    original: "Original",
    text: "Text",
    copy: "Copy",
    retry: "Retry",
    close: "Close",
    capturedRegion: "Captured region",
    recognizingText: "Recognizing text...",
    translating: "Translating...",
    cancel: "Cancel",
    preloadFailed: "Preload failed",
    preloadFailedDescription:
      "The desktop bridge did not load, so settings cannot be saved. Restart the app with npm run dev after rebuilding."
  }
} as const;

type TranslationKey = keyof typeof translations.en;

function useInterfaceLanguage() {
  const [language, setLanguage] = useState<AppSettings["interfaceLanguage"]>("zh-CN");

  useEffect(() => {
    screenTranslate.getSettings().then((snapshot) => {
      setLanguage(snapshot.settings.interfaceLanguage);
    });
  }, []);

  return language;
}

function translate(language: AppSettings["interfaceLanguage"], key: TranslationKey): string {
  return translations[language][key];
}

function getView() {
  return new URLSearchParams(window.location.search).get("view") ?? "settings";
}

function App() {
  if (!window.screenTranslate) {
    return <PreloadError />;
  }

  const view = getView();

  if (view === "capture") {
    return <CaptureView />;
  }

  if (view === "result") {
    return <ResultView />;
  }

  return <SettingsView />;
}

function PreloadError() {
  return (
    <main className="settings-shell">
      <section className="settings-section">
        <h1>{translations["zh-CN"].preloadFailed}</h1>
        <p className="muted">{translations["zh-CN"].preloadFailedDescription}</p>
      </section>
    </main>
  );
}

function SettingsView() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [settingsSnapshot, setSettingsSnapshot] = useState<SettingsSnapshot | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [baiduSecretKey, setBaiduSecretKey] = useState("");
  const [deeplxToken, setDeeplxToken] = useState("");
  const [status, setStatus] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    screenTranslate.getSettings().then((snapshot) => {
      setSettingsSnapshot(snapshot);
      setSettings(snapshot.settings);
    });
  }, []);

  if (!settings) {
    return <div className="loading">{translations["zh-CN"].loadingSettings}</div>;
  }

  const t = (key: TranslationKey) => translate(settings.interfaceLanguage, key);

  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings({ ...settings, [key]: value });
  };

  const save = async () => {
    setIsBusy(true);
    setStatus(t("saving"));
    try {
      const saved = await screenTranslate.saveSettings(
        settings,
        apiKey.trim() ? apiKey : undefined,
        baiduSecretKey.trim() ? baiduSecretKey : undefined,
        deeplxToken.trim() ? deeplxToken : undefined
      );
      setSettings(saved);
      setSettingsSnapshot((current) =>
        current
          ? {
              ...current,
              settings: saved,
              hasApiKey: current.hasApiKey || Boolean(apiKey.trim()),
              hasBaiduSecretKey: current.hasBaiduSecretKey || Boolean(baiduSecretKey.trim()),
              hasDeeplxToken: current.hasDeeplxToken || Boolean(deeplxToken.trim())
            }
          : current
      );
      setApiKey("");
      setBaiduSecretKey("");
      setDeeplxToken("");
      setStatus(t("settingsSaved"));
    } finally {
      setIsBusy(false);
    }
  };

  const testConnection = async (translationProvider = settings.translationProvider) => {
    setIsBusy(true);
    setStatus(t("testingConnection"));
    try {
      const result = await screenTranslate.testConnection(
        { ...settings, translationProvider },
        apiKey || undefined,
        baiduSecretKey || undefined,
        deeplxToken || undefined
      );
      setStatus(result.message);
    } finally {
      setIsBusy(false);
    }
  };

  const clearHistory = async () => {
    setIsBusy(true);
    setStatus(t("clearingHistory"));
    try {
      await screenTranslate.clearHistory();
      setStatus(t("historyCleared"));
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <main className="settings-shell">
      <section className="settings-hero">
        <div>
          <h1>{t("appName")}</h1>
          <p>{t("appDescription")}</p>
        </div>
        <button className="primary-button" disabled={isBusy} onClick={save}>
          {t("saveSettings")}
        </button>
      </section>

      <section className="settings-grid">
        <div className="settings-section">
          <h2>{t("translationEngine")}</h2>
          <Field label={t("engine")}>
            <select
              value={settings.translationProvider}
              onChange={(event) => update("translationProvider", event.target.value as AppSettings["translationProvider"])}
            >
              <option value="openai">{t("largeModel")}</option>
              <option value="baidu">{t("baiduTranslate")}</option>
              <option value="deeplx">{t("deeplxTranslate")}</option>
            </select>
          </Field>
          <Field label={t("ocrEngine")}>
            <select
              value={settings.ocrProvider}
              onChange={(event) => update("ocrProvider", event.target.value as AppSettings["ocrProvider"])}
            >
              <option value="windows">{t("windowsOcr")}</option>
              <option value="paddle">{t("paddleOcr")}</option>
            </select>
          </Field>
          <Field label={t("paddleOcrApiUrl")}>
            <input
              value={settings.paddleOcrApiUrl}
              onChange={(event) => update("paddleOcrApiUrl", event.target.value)}
              placeholder="http://127.0.0.1:8866"
            />
          </Field>
        </div>

        <div className="settings-section">
          <h2>{t("largeModelSettings")}</h2>
          <Field label={t("baseUrl")}>
            <input
              value={settings.baseUrl}
              onChange={(event) => update("baseUrl", event.target.value)}
              placeholder="https://api.openai.com/v1"
            />
          </Field>
          <Field label={t("apiKey")}>
            <input
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              type="password"
              placeholder={settingsSnapshot?.hasApiKey ? t("apiKeySavedPlaceholder") : t("apiKeyPlaceholder")}
            />
          </Field>
          <Field label={t("model")}>
            <input value={settings.model} onChange={(event) => update("model", event.target.value)} />
          </Field>
          <button className="secondary-button" disabled={isBusy} onClick={() => testConnection("openai")}>
            {t("testConnection")}
          </button>
        </div>

        <div className="settings-section">
          <h2>{t("baiduSettings")}</h2>
          <Field label={t("baiduAppId")}>
            <input
              value={settings.baiduAppId}
              onChange={(event) => update("baiduAppId", event.target.value)}
              placeholder={t("baiduAppIdPlaceholder")}
            />
          </Field>
          <Field label={t("baiduSecretKey")}>
            <input
              value={baiduSecretKey}
              onChange={(event) => setBaiduSecretKey(event.target.value)}
              type="password"
              placeholder={
                settingsSnapshot?.hasBaiduSecretKey ? t("baiduSecretSavedPlaceholder") : t("baiduSecretPlaceholder")
              }
            />
          </Field>
          <button className="secondary-button" disabled={isBusy} onClick={() => testConnection("baidu")}>
            {t("testBaidu")}
          </button>
        </div>

        <div className="settings-section">
          <h2>{t("deeplxSettings")}</h2>
          <Field label={t("deeplxApiUrl")}>
            <input
              value={settings.deeplxApiUrl}
              onChange={(event) => update("deeplxApiUrl", event.target.value)}
              placeholder={t("deeplxApiUrlPlaceholder")}
            />
          </Field>
          <Field label={t("deeplxToken")}>
            <input
              value={deeplxToken}
              onChange={(event) => setDeeplxToken(event.target.value)}
              type="password"
              placeholder={settingsSnapshot?.hasDeeplxToken ? t("deeplxTokenSavedPlaceholder") : t("deeplxTokenPlaceholder")}
            />
          </Field>
          <button className="secondary-button" disabled={isBusy} onClick={() => testConnection("deeplx")}>
            {t("testDeeplx")}
          </button>
        </div>

        <div className="settings-section">
          <h2>{t("translation")}</h2>
          <Field label={t("interfaceLanguage")}>
            <select
              value={settings.interfaceLanguage}
              onChange={(event) => update("interfaceLanguage", event.target.value as AppSettings["interfaceLanguage"])}
            >
              <option value="zh-CN">{t("chinese")}</option>
              <option value="en">{t("english")}</option>
            </select>
          </Field>
          <Field label={t("targetLanguage")}>
            <input
              value={settings.targetLanguage}
              onChange={(event) => update("targetLanguage", event.target.value)}
            />
          </Field>
          <Field label={t("shortcut")}>
            <input value={settings.shortcut} onChange={(event) => update("shortcut", event.target.value)} />
          </Field>
          <Field label={t("timeout")}>
            <input
              type="number"
              min={5000}
              value={settings.requestTimeoutMs}
              onChange={(event) => update("requestTimeoutMs", Number(event.target.value))}
            />
          </Field>
          <label className="switch-row">
            <input
              type="checkbox"
              checked={settings.autoCopy}
              onChange={(event) => update("autoCopy", event.target.checked)}
            />
            {t("autoCopy")}
          </label>
        </div>

        <div className="settings-section">
          <h2>{t("privacy")}</h2>
          <p className="muted">{t("privacyDescription")}</p>
          <label className="switch-row">
            <input
              type="checkbox"
              checked={settings.saveHistory}
              onChange={(event) => update("saveHistory", event.target.checked)}
            />
            {t("saveHistory")}
          </label>
          <Field label={t("maxHistoryItems")}>
            <input
              type="number"
              min={1}
              value={settings.maxHistoryItems}
              disabled={!settings.saveHistory}
              onChange={(event) => update("maxHistoryItems", Number(event.target.value))}
            />
          </Field>
          <button className="secondary-button" disabled={isBusy || !settings.saveHistory} onClick={clearHistory}>
            {t("clearHistory")}
          </button>
        </div>

        <div className="settings-section status-section">
          <h2>{t("status")}</h2>
          <p>{status || t("ready")}</p>
          {settingsSnapshot?.hasApiKey ? <p className="muted">{t("apiKeySaved")}</p> : null}
          {settingsSnapshot?.hasBaiduSecretKey ? (
            <p className="muted">{t("baiduSecretSaved")}</p>
          ) : null}
          {settingsSnapshot?.hasDeeplxToken ? <p className="muted">{t("deeplxTokenSaved")}</p> : null}
          {settingsSnapshot ? <p className="muted">{t("settingsFile")}: {settingsSnapshot.storagePath}</p> : null}
          <p className="muted">{t("defaultShortcut")}</p>
        </div>
      </section>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function CaptureView() {
  const language = useInterfaceLanguage();
  const t = (key: TranslationKey) => translate(language, key);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [current, setCurrent] = useState<{ x: number; y: number } | null>(null);
  const [captureBounds, setCaptureBounds] = useState<CaptureSelection | null>(null);

  useEffect(() => {
    screenTranslate.getCaptureWindowBounds().then(setCaptureBounds);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        screenTranslate.cancelCapture();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const selection = useMemo(() => {
    if (!start || !current) {
      return null;
    }

    return normalizeSelection(start.x, start.y, current.x, current.y);
  }, [current, start]);

  const complete = async () => {
    if (!selection || selection.width < 20 || selection.height < 20) {
      return;
    }

    const bounds = captureBounds ?? {
      x: window.screenX,
      y: window.screenY,
      width: window.innerWidth,
      height: window.innerHeight
    };
    const absolute = {
      x: Math.round(bounds.x + selection.x),
      y: Math.round(bounds.y + selection.y),
      width: selection.width,
      height: selection.height
    };

    await screenTranslate.completeCapture({
      imageDataUrl: "",
      selection: absolute
    });
  };

  return (
    <div
      className="capture-surface"
      onMouseDown={(event) => {
        setStart({ x: event.clientX, y: event.clientY });
        setCurrent({ x: event.clientX, y: event.clientY });
      }}
      onMouseMove={(event) => {
        if (start) {
          setCurrent({ x: event.clientX, y: event.clientY });
        }
      }}
      onMouseUp={complete}
    >
      <div className="capture-tip">{t("captureTip")}</div>
      {selection ? (
        <div
          className="selection-box"
          style={{
            left: selection.x,
            top: selection.y,
            width: selection.width,
            height: selection.height
          }}
        />
      ) : null}
    </div>
  );
}

function ResultView() {
  const language = useInterfaceLanguage();
  const t = (key: TranslationKey) => translate(language, key);
  const [state, setState] = useState<ResultState | null>(null);
  const [mode, setMode] = useState<"overlay" | "original" | "text">("overlay");

  useEffect(() => {
    screenTranslate.getResultState().then(setState);
    const unsubscribe = screenTranslate.onResultState(setState);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        screenTranslate.closeResultWindow();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      unsubscribe();
    };
  }, []);

  if (!state) {
    return <div className="result-empty">{t("preparingTranslation")}</div>;
  }

  if (state.status === "translating") {
    return <TranslatingView capture={state.capture} stage={state.stage} language={language} />;
  }

  const payload = state.payload;
  const allText = payload.translation.blocks.map((block) => block.translatedText).join("\n");
  const fallbackReasons = [payload.captureFallbackReason, payload.translationFallbackReason].filter(Boolean);

  return (
    <main className="result-shell">
      <div className="result-toolbar">
        <span className="result-title">{payload.usedFallback ? t("fallbackUsed") : t("translated")}</span>
        <button onClick={() => setMode("overlay")}>{t("overlay")}</button>
        <button onClick={() => setMode("original")}>{t("original")}</button>
        <button onClick={() => setMode("text")}>{t("text")}</button>
        <button onClick={() => screenTranslate.copyText(allText)}>{t("copy")}</button>
        <button onClick={() => screenTranslate.retryLastCapture()}>{t("retry")}</button>
        <button onClick={() => screenTranslate.closeResultWindow()}>{t("close")}</button>
      </div>

      <section className="result-canvas">
        {fallbackReasons.length ? (
          <div className="fallback-warning">
            {fallbackReasons.map((reason) => (
              <p key={reason}>{reason}</p>
            ))}
          </div>
        ) : null}
        {mode === "original" ? (
          <img
            className="original-capture"
            src={payload.capture.imageDataUrl}
            alt={t("capturedRegion")}
            style={{
              width: payload.capture.selection.width,
              height: payload.capture.selection.height
            }}
          />
        ) : null}
        {mode === "overlay" ? <TranslatedOverlay payload={payload} /> : null}
        {mode === "text" ? <TextPanel payload={payload} /> : null}
      </section>
    </main>
  );
}

function TranslatingView({
  capture,
  stage,
  language
}: {
  capture: CaptureResult;
  stage: TranslatingStage;
  language: AppSettings["interfaceLanguage"];
}) {
  const [elapsed, setElapsed] = useState(0);
  const t = (key: TranslationKey) => translate(language, key);

  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(() => {
      setElapsed((Date.now() - started) / 1000);
    }, 100);
    return () => window.clearInterval(timer);
  }, []);

  const title = stage === "ocr" ? t("recognizingText") : t("translating");

  return (
    <main className="result-shell">
      <div className="result-toolbar-spacer" aria-hidden="true" />
      <section className="result-canvas translating-canvas">
        {capture.imageDataUrl ? (
          <img
            className="original-capture translating-image"
            src={capture.imageDataUrl}
            alt={t("capturedRegion")}
            style={{
              width: capture.selection.width,
              height: capture.selection.height
            }}
          />
        ) : null}
        <div className="translating-overlay">
          <div className="translating-card">
            <span className="spinner" aria-hidden="true" />
            <div className="translating-text">
              <span className="translating-title">{title}</span>
              <span className="translating-elapsed">{elapsed.toFixed(1)}s</span>
            </div>
            <button className="translating-cancel" onClick={() => screenTranslate.closeResultWindow()}>
              {t("cancel")}
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}

function TranslatedOverlay({ payload }: { payload: ResultPayload }) {
  const [sampledColors, setSampledColors] = useState<SampledBlockColors[]>([]);
  const placements = getTranslationChipPlacements(
    payload.translation.blocks,
    payload.capture.selection.width,
    payload.capture.selection.height
  );
  const contentHeight = getOverlayContentHeight(placements, payload.capture.selection.height);

  useEffect(() => {
    let cancelled = false;
    setSampledColors([]);

    sampleBlockColors(payload)
      .then((colors) => {
        if (!cancelled) {
          setSampledColors(colors);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSampledColors([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [payload]);

  return (
    <div className="translated-layer" style={{ width: payload.capture.selection.width, height: contentHeight }}>
      <div
        className="captured-region"
        style={{
          width: payload.capture.selection.width,
          height: payload.capture.selection.height
        }}
      >
        <img src={payload.capture.imageDataUrl} alt="" />
      </div>
      {payload.translation.blocks.map((block, index) => {
        const colors = sampledColors[index];
        const background = colors?.background ?? block.backgroundHint?.color ?? "#ffffff";
        const textColor = colors?.foreground ?? block.fontHint?.color ?? "#111827";
        const placement = placements[index];
        const lineClamp = Number.isFinite(placement.maxLines) ? placement.maxLines : undefined;

        return (
          <div
            className={[
              "translation-chip",
              placement.variant === "inline" ? "inline-replacement" : "expanded-replacement",
              block.confidence < 0.6 ? "low-confidence" : ""
            ]
              .filter(Boolean)
              .join(" ")}
            key={`${block.sourceText}-${index}`}
            style={{
              left: placement.x,
              top: placement.y,
              width: placement.width,
              height: placement.variant === "inline" ? placement.minHeight : undefined,
              minHeight: placement.minHeight,
              background,
              color: textColor,
              fontSize: placement.fontSize,
              lineHeight: `${placement.lineHeight}px`,
              fontWeight: block.fontHint?.weight === "bold" ? 700 : 500
            }}
          >
            <span style={{ WebkitLineClamp: lineClamp }}>{block.translatedText}</span>
          </div>
        );
      })}
    </div>
  );
}

interface SampledBlockColors {
  background: string;
  foreground: string;
}

interface RgbColor {
  red: number;
  green: number;
  blue: number;
}

async function sampleBlockColors(payload: ResultPayload): Promise<SampledBlockColors[]> {
  const image = await loadImage(payload.capture.imageDataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || payload.capture.selection.width;
  canvas.height = image.naturalHeight || payload.capture.selection.height;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return [];
  }

  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const scaleX = canvas.width / payload.capture.selection.width;
  const scaleY = canvas.height / payload.capture.selection.height;

  return payload.translation.blocks.map((block) => {
    const x = Math.max(0, Math.floor(block.bbox.x * scaleX));
    const y = Math.max(0, Math.floor(block.bbox.y * scaleY));
    const width = Math.max(1, Math.min(canvas.width - x, Math.ceil(block.bbox.width * scaleX)));
    const height = Math.max(1, Math.min(canvas.height - y, Math.ceil(block.bbox.height * scaleY)));
    const pixels = context.getImageData(x, y, width, height).data;
    return inferBlockColors(pixels, width, height);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load captured image for color sampling."));
    image.src = src;
  });
}

function inferBlockColors(pixels: Uint8ClampedArray, width: number, height: number): SampledBlockColors {
  const samples: RgbColor[] = [];
  const edgeSamples: RgbColor[] = [];
  const edgeSize = Math.max(1, Math.min(4, Math.floor(Math.min(width, height) * 0.18)));

  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const index = (row * width + column) * 4;
      if (pixels[index + 3] < 24) {
        continue;
      }

      const sample = { red: pixels[index], green: pixels[index + 1], blue: pixels[index + 2] };
      samples.push(sample);

      if (row < edgeSize || column < edgeSize || row >= height - edgeSize || column >= width - edgeSize) {
        edgeSamples.push(sample);
      }
    }
  }

  if (samples.length === 0) {
    return { background: "#ffffff", foreground: "#111827" };
  }

  const background = dominantColor(edgeSamples.length > 0 ? edgeSamples : samples);
  const foregroundCandidates = samples.filter((sample) => isLikelyForegroundColor(sample, background));
  const foreground =
    foregroundCandidates.length > 0 ? bestForegroundColor(foregroundCandidates, background) : contrastingTextColor(background);

  return {
    background: toHex(background),
    foreground: toHex(foreground)
  };
}

function dominantColor(samples: RgbColor[]): RgbColor {
  const buckets = new Map<string, { color: RgbColor; count: number }>();

  for (const sample of samples) {
    const color = {
      red: quantize(sample.red),
      green: quantize(sample.green),
      blue: quantize(sample.blue)
    };
    const key = `${color.red},${color.green},${color.blue}`;
    const bucket = buckets.get(key);

    if (bucket) {
      bucket.count += 1;
    } else {
      buckets.set(key, { color, count: 1 });
    }
  }

  return [...buckets.values()].sort((a, b) => b.count - a.count)[0]?.color ?? samples[0];
}

function bestForegroundColor(samples: RgbColor[], background: RgbColor): RgbColor {
  const buckets = new Map<string, { color: RgbColor; count: number; score: number }>();

  for (const sample of samples) {
    const color = {
      red: quantize(sample.red),
      green: quantize(sample.green),
      blue: quantize(sample.blue)
    };
    const key = `${color.red},${color.green},${color.blue}`;
    const score = colorDistance(color, background) + luminance(color) * 0.45 + saturation(color) * 40;
    const bucket = buckets.get(key);

    if (bucket) {
      bucket.count += 1;
      bucket.score += score;
    } else {
      buckets.set(key, { color, count: 1, score });
    }
  }

  return (
    [...buckets.values()].sort((a, b) => b.score * b.count - a.score * a.count)[0]?.color ??
    contrastingTextColor(background)
  );
}

function isLikelyForegroundColor(sample: RgbColor, background: RgbColor): boolean {
  const distance = colorDistance(sample, background);
  const sampleLuminance = luminance(sample);
  const backgroundLuminance = luminance(background);
  const brightEnough = sampleLuminance > 82 || sampleLuminance > backgroundLuminance + 46;
  const colorfulEnough = saturation(sample) > 0.18 && sampleLuminance > 58;

  return distance > 64 && (brightEnough || colorfulEnough);
}

function contrastingTextColor(background: RgbColor): RgbColor {
  return luminance(background) < 120
    ? { red: 224, green: 224, blue: 192 }
    : { red: 17, green: 24, blue: 39 };
}

function quantize(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value / 16) * 16));
}

function luminance(color: RgbColor): number {
  return color.red * 0.299 + color.green * 0.587 + color.blue * 0.114;
}

function saturation(color: RgbColor): number {
  const max = Math.max(color.red, color.green, color.blue);
  const min = Math.min(color.red, color.green, color.blue);
  return max === 0 ? 0 : (max - min) / max;
}

function colorDistance(a: RgbColor, b: RgbColor): number {
  return Math.hypot(a.red - b.red, a.green - b.green, a.blue - b.blue);
}

function toHex(color: RgbColor): string {
  return `#${toHexPair(color.red)}${toHexPair(color.green)}${toHexPair(color.blue)}`;
}

function toHexPair(value: number): string {
  return Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0");
}

function TextPanel({ payload }: { payload: ResultPayload }) {
  return (
    <div className="text-panel">
      {payload.translation.blocks.map((block, index) => (
        <article key={`${block.sourceText}-${index}`}>
          <p className="source-text">{block.sourceText}</p>
          <p className="translated-text">{block.translatedText}</p>
        </article>
      ))}
    </div>
  );
}

function normalizeSelection(x1: number, y1: number, x2: number, y2: number): CaptureSelection {
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1)
  };
}

function createMockScreenshot(width: number, height: number): string {
  const safeWidth = Math.max(420, Math.round(width));
  const safeHeight = Math.max(260, Math.round(height));
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${safeWidth}" height="${safeHeight}">
      <rect width="100%" height="100%" fill="#f8fafc"/>
      <rect x="28" y="24" width="${safeWidth - 56}" height="${safeHeight - 48}" rx="18" fill="#ffffff" stroke="#dbe3ef"/>
      <text x="64" y="84" font-family="Arial" font-size="26" font-weight="700" fill="#111827">Translate text on screen</text>
      <text x="64" y="152" font-family="Arial" font-size="21" fill="#1f2937">OpenAI-compatible model</text>
      <text x="64" y="${safeHeight - 56}" font-family="Arial" font-size="15" fill="#64748b">Mock capture used until native screenshot crop is connected.</text>
    </svg>
  `;

  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}

function createBrowserMockApi(): ScreenTranslateApi {
  const settings: AppSettings = {
    interfaceLanguage: "zh-CN",
    translationProvider: "openai",
    ocrProvider: "windows",
    paddleOcrApiUrl: "http://127.0.0.1:8866",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4.1-mini",
    baiduAppId: "",
    deeplxApiUrl: "http://127.0.0.1:1188/translate",
    targetLanguage: "中文",
    shortcut: "Ctrl+Alt+T",
    requestTimeoutMs: 60000,
    saveHistory: false,
    maxHistoryItems: 50,
    autoCopy: false
  };

  let latestCapture: CaptureResult = {
    imageDataUrl: createMockScreenshot(720, 420),
    selection: { x: 0, y: 0, width: 720, height: 420 }
  };

  const latestResult = (): ResultPayload => ({
    capture: latestCapture,
    usedFallback: true,
    translation: {
      sourceLanguage: "en",
      targetLanguage: "zh-CN",
      blocks: [
        {
          sourceText: "Translate text on screen",
          translatedText: "翻译屏幕上的文字",
          bbox: { x: 64, y: 64, width: 390, height: 42 },
          confidence: 0.94,
          fontHint: { size: 18, weight: "bold", color: "#111827" },
          backgroundHint: { color: "#ffffff", opacity: 0.92 }
        },
        {
          sourceText: "OpenAI-compatible model",
          translatedText: "兼容 OpenAI 格式的大模型",
          bbox: { x: 64, y: 132, width: 340, height: 34 },
          confidence: 0.9,
          fontHint: { size: 16, color: "#1f2937" },
          backgroundHint: { color: "#ffffff", opacity: 0.9 }
        }
      ]
    }
  });

  return {
    getSettings: async () => ({
      settings,
      hasApiKey: false,
      hasBaiduSecretKey: false,
      hasDeeplxToken: false,
      storagePath: "Browser preview mock"
    }),
    saveSettings: async (next) => Object.assign(settings, next),
    testConnection: async () => ({ ok: true, message: "Browser mock connection succeeded." }),
    getCaptureWindowBounds: async () => ({
      x: window.screenX,
      y: window.screenY,
      width: window.innerWidth,
      height: window.innerHeight
    }),
    completeCapture: async (capture) => {
      latestCapture = capture;
      window.location.search = "?view=result";
    },
    cancelCapture: async () => {
      window.location.search = "?view=settings";
    },
    getResultPayload: async () => latestResult(),
    getResultState: async () => ({ status: "translating", capture: latestCapture, stage: "ocr" }),
    onResultState: (callback) => {
      const toTranslating = window.setTimeout(
        () => callback({ status: "translating", capture: latestCapture, stage: "translating" }),
        700
      );
      const toDone = window.setTimeout(
        () => callback({ status: "done", capture: latestCapture, payload: latestResult() }),
        1800
      );
      return () => {
        window.clearTimeout(toTranslating);
        window.clearTimeout(toDone);
      };
    },
    clearHistory: async () => undefined,
    copyText: async (text) => navigator.clipboard?.writeText(text),
    closeCurrentWindow: async () => {
      window.location.search = "?view=settings";
    },
    closeResultWindow: async () => {
      window.location.search = "?view=settings";
    },
    retryLastCapture: async () => undefined
  };
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
