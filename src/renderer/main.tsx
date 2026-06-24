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
import "./styles.css";

const screenTranslate = window.screenTranslate ?? createBrowserMockApi();

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
        <h1>Preload failed</h1>
        <p className="muted">
          The desktop bridge did not load, so settings cannot be saved. Restart the app with npm run dev
          after rebuilding.
        </p>
      </section>
    </main>
  );
}

function SettingsView() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [settingsSnapshot, setSettingsSnapshot] = useState<SettingsSnapshot | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState("Ready");
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    screenTranslate.getSettings().then((snapshot) => {
      setSettingsSnapshot(snapshot);
      setSettings(snapshot.settings);
    });
  }, []);

  if (!settings) {
    return <div className="loading">Loading settings...</div>;
  }

  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings({ ...settings, [key]: value });
  };

  const save = async () => {
    setIsBusy(true);
    setStatus("Saving...");
    try {
      const saved = await screenTranslate.saveSettings(
        settings,
        apiKey.trim() ? apiKey : undefined
      );
      setSettings(saved);
      setSettingsSnapshot((current) =>
        current
          ? {
              ...current,
              settings: saved,
              hasApiKey: current.hasApiKey || Boolean(apiKey.trim())
            }
          : current
      );
      setApiKey("");
      setStatus("Settings saved.");
    } finally {
      setIsBusy(false);
    }
  };

  const testConnection = async () => {
    setIsBusy(true);
    setStatus("Testing connection...");
    try {
      const result = await screenTranslate.testConnection(settings, apiKey || undefined);
      setStatus(result.message);
    } finally {
      setIsBusy(false);
    }
  };

  const clearHistory = async () => {
    setIsBusy(true);
    setStatus("Clearing history...");
    try {
      await screenTranslate.clearHistory();
      setStatus("History cleared.");
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <main className="settings-shell">
      <section className="settings-hero">
        <div>
          <h1>Screen Translate</h1>
          <p>Press the global shortcut, select text on screen, and redraw the translation in place.</p>
        </div>
        <button className="primary-button" disabled={isBusy} onClick={save}>
          Save settings
        </button>
      </section>

      <section className="settings-grid">
        <div className="settings-section">
          <h2>Model</h2>
          <Field label="Base URL">
            <input
              value={settings.baseUrl}
              onChange={(event) => update("baseUrl", event.target.value)}
              placeholder="https://api.openai.com/v1"
            />
          </Field>
          <Field label="API Key">
            <input
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              type="password"
              placeholder={settingsSnapshot?.hasApiKey ? "Saved. Leave blank to keep current key" : "Enter API key"}
            />
          </Field>
          <Field label="Model">
            <input value={settings.model} onChange={(event) => update("model", event.target.value)} />
          </Field>
          <button className="secondary-button" disabled={isBusy} onClick={testConnection}>
            Test connection
          </button>
        </div>

        <div className="settings-section">
          <h2>Translation</h2>
          <Field label="Target language">
            <input
              value={settings.targetLanguage}
              onChange={(event) => update("targetLanguage", event.target.value)}
            />
          </Field>
          <Field label="Shortcut">
            <input value={settings.shortcut} onChange={(event) => update("shortcut", event.target.value)} />
          </Field>
          <Field label="Timeout">
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
            Auto-copy translated text
          </label>
        </div>

        <div className="settings-section">
          <h2>Privacy</h2>
          <p className="muted">
            Screenshots are sent to the model service you configure. History is off by default and stored
            locally only when enabled.
          </p>
          <label className="switch-row">
            <input
              type="checkbox"
              checked={settings.saveHistory}
              onChange={(event) => update("saveHistory", event.target.checked)}
            />
            Save history
          </label>
          <Field label="Maximum history items">
            <input
              type="number"
              min={1}
              value={settings.maxHistoryItems}
              disabled={!settings.saveHistory}
              onChange={(event) => update("maxHistoryItems", Number(event.target.value))}
            />
          </Field>
          <button className="secondary-button" disabled={isBusy || !settings.saveHistory} onClick={clearHistory}>
            Clear history
          </button>
        </div>

        <div className="settings-section status-section">
          <h2>Status</h2>
          <p>{status}</p>
          {settingsSnapshot?.hasApiKey ? <p className="muted">API key is saved securely and hidden.</p> : null}
          {settingsSnapshot ? <p className="muted">Settings file: {settingsSnapshot.storagePath}</p> : null}
          <p className="muted">Default shortcut: Ctrl + Alt + T. Use the tray menu if shortcut capture is paused.</p>
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
      <div className="capture-tip">Drag to select a region. Press Esc to cancel.</div>
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
    return <div className="result-empty">Preparing translation...</div>;
  }

  if (state.status === "translating") {
    return <TranslatingView capture={state.capture} stage={state.stage} />;
  }

  const payload = state.payload;
  const allText = payload.translation.blocks.map((block) => block.translatedText).join("\n");
  const fallbackReasons = [payload.captureFallbackReason, payload.translationFallbackReason].filter(Boolean);

  return (
    <main className="result-shell">
      <div className="result-toolbar">
        <span className="result-title">{payload.usedFallback ? "Fallback used" : "Translated"}</span>
        <button onClick={() => setMode("overlay")}>Overlay</button>
        <button onClick={() => setMode("original")}>Original</button>
        <button onClick={() => setMode("text")}>Text</button>
        <button onClick={() => screenTranslate.copyText(allText)}>Copy</button>
        <button onClick={() => screenTranslate.retryLastCapture()}>Retry</button>
        <button onClick={() => screenTranslate.closeResultWindow()}>Close</button>
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
            alt="Captured region"
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

function TranslatingView({ capture, stage }: { capture: CaptureResult; stage: TranslatingStage }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(() => {
      setElapsed((Date.now() - started) / 1000);
    }, 100);
    return () => window.clearInterval(timer);
  }, []);

  const title = stage === "ocr" ? "Recognizing text…" : "Translating…";

  return (
    <main className="result-shell">
      <section className="result-canvas translating-canvas">
        {capture.imageDataUrl ? (
          <img
            className="original-capture translating-image"
            src={capture.imageDataUrl}
            alt="Captured region"
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
              Cancel
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}

function TranslatedOverlay({ payload }: { payload: ResultPayload }) {
  return (
    <div className="translated-layer">
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
        const opacity = block.backgroundHint?.opacity ?? 0.9;
        const background = block.backgroundHint?.color ?? "#ffffff";
        const fontSize = Math.max(12, Math.min(block.fontHint?.size ?? 16, block.bbox.height * 0.55));

        return (
          <div
            className={block.confidence < 0.6 ? "translation-chip low-confidence" : "translation-chip"}
            key={`${block.sourceText}-${index}`}
            style={{
              left: block.bbox.x,
              top: block.bbox.y,
              width: block.bbox.width,
              minHeight: block.bbox.height,
              background: rgba(background, opacity),
              color: block.fontHint?.color ?? "#111827",
              fontSize,
              fontWeight: block.fontHint?.weight === "bold" ? 700 : 500
            }}
          >
            {block.translatedText}
          </div>
        );
      })}
    </div>
  );
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

function rgba(hex: string, opacity: number): string {
  const normalized = hex.replace("#", "");
  const value =
    normalized.length === 3
      ? normalized
          .split("")
          .map((char) => char + char)
          .join("")
      : normalized;

  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
}

function createBrowserMockApi(): ScreenTranslateApi {
  const settings: AppSettings = {
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4.1-mini",
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
