import {
  app,
  BrowserWindow,
  clipboard,
  globalShortcut,
  ipcMain,
  nativeImage,
  screen,
  Tray,
  Menu,
  type Rectangle
} from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type {
  AppSettings,
  CaptureResult,
  CaptureSelection,
  ResultPayload,
  ResultState,
  TranslatingStage,
  TranslationBlock,
  TranslationResult
} from "../shared/types";
import { createMockCaptureImageDataUrl, mockTranslation } from "./defaults";
import {
  getApiKey,
  getBaiduSecretKey,
  getDeeplxToken,
  getSettings,
  getSettingsStoragePath,
  hasApiKey,
  hasBaiduSecretKey,
  hasDeeplxToken,
  saveSettings
} from "./settings-store";
import { testOpenAiCompatibleEndpoint, translateTexts } from "./openai-compatible";
import { testBaiduTranslateEndpoint, translateTextsWithBaidu } from "./baidu-translate";
import { testDeeplxEndpoint, translateTextsWithDeeplx } from "./deeplx-translate";
import { recognizeText, type OcrLine } from "./ocr";
import { groupOcrLinesBySentence } from "./ocr-line-grouper";
import { captureSelection } from "./screen-capture";
import { normalizeTranslationForCapture } from "./translation-normalizer";
import { clearHistory, saveHistoryEntry } from "./history-store";

let tray: Tray | null = null;
let settingsWindow: BrowserWindow | null = null;
let captureWindows: BrowserWindow[] = [];
let resultWindow: BrowserWindow | null = null;
let lastCapture: CaptureResult | null = null;
let latestResult: ResultPayload | null = null;
let latestState: ResultState | null = null;
let shortcutPaused = false;
const RESULT_TOOLBAR_WIDTH = 460;
const RESULT_TOOLBAR_HEIGHT = 56;
const APP_NAME = "Screen Translate";
const LOOPBACK_PROXY_BYPASS = "<-loopback>;localhost;127.0.0.1;[::1]";

app.setName(APP_NAME);
app.setPath("userData", join(app.getPath("appData"), APP_NAME));
app.commandLine.appendSwitch("no-proxy-server");
app.commandLine.appendSwitch("proxy-bypass-list", LOOPBACK_PROXY_BYPASS);

function logTiming(stage: string, startedAt: number, detail?: string): void {
  const suffix = detail ? ` (${detail})` : "";
  console.info(`[Screen Translate timing] ${stage}: ${Date.now() - startedAt}ms${suffix}`);
}

function getRendererDevUrl(view: string): string {
  const rendererUrl = process.env.ELECTRON_RENDERER_URL;
  if (!rendererUrl) {
    throw new Error("ELECTRON_RENDERER_URL is not set.");
  }

  const url = new URL(rendererUrl);
  if (url.hostname === "localhost") {
    url.hostname = "127.0.0.1";
  }
  url.searchParams.set("view", view);

  return url.toString();
}

function loadRenderer(window: BrowserWindow, view: string): void {
  const query = { view };

  if (process.env.ELECTRON_RENDERER_URL) {
    window.loadURL(getRendererDevUrl(view));
  } else {
    window.loadFile(join(__dirname, "../renderer/index.html"), { query });
  }
}

function getPreloadPath(): string {
  const candidates = [
    join(__dirname, "../preload/index.cjs"),
    join(__dirname, "../preload/index.js"),
    join(__dirname, "../preload/index.mjs")
  ];

  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}

function getVirtualScreenBounds(): Rectangle {
  const displays = screen.getAllDisplays();
  const left = Math.min(...displays.map((display) => display.bounds.x));
  const top = Math.min(...displays.map((display) => display.bounds.y));
  const right = Math.max(...displays.map((display) => display.bounds.x + display.bounds.width));
  const bottom = Math.max(...displays.map((display) => display.bounds.y + display.bounds.height));

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top
  };
}

function createSettingsWindow(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 960,
    height: 680,
    minWidth: 820,
    minHeight: 560,
    title: "Screen Translate Settings",
    backgroundColor: "#f6f7fb",
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });

  loadRenderer(settingsWindow, "settings");
}

function closeCaptureWindows(): void {
  for (const window of captureWindows) {
    if (!window.isDestroyed()) {
      window.close();
    }
  }
  captureWindows = [];
}

function createCaptureWindow(): void {
  const activeCaptureWindows = captureWindows.filter((window) => !window.isDestroyed());
  if (activeCaptureWindows.length > 0) {
    activeCaptureWindows[0].focus();
    return;
  }
  captureWindows = [];

  for (const display of screen.getAllDisplays()) {
    const captureWindow = new BrowserWindow({
      ...display.bounds,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      fullscreenable: false,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      title: "Screen Translate Capture",
      webPreferences: {
        preload: getPreloadPath(),
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    captureWindow.setAlwaysOnTop(true, "screen-saver");
    captureWindow.on("closed", () => {
      captureWindows = captureWindows.filter((window) => window !== captureWindow);
    });

    captureWindows.push(captureWindow);
    loadRenderer(captureWindow, "capture");
  }
}

function setResultState(state: ResultState): void {
  latestState = state;
  if (resultWindow && !resultWindow.isDestroyed()) {
    resultWindow.webContents.send("result:state", state);
  }
}

function createResultWindow(capture: CaptureResult): void {
  if (resultWindow && !resultWindow.isDestroyed()) {
    resultWindow.destroy();
  }

  const { selection } = capture;
  const display = screen.getDisplayMatching(selection);
  const resultY = Math.max(display.bounds.y, Math.round(selection.y) - RESULT_TOOLBAR_HEIGHT);
  const toolbarOffset = Math.round(selection.y) - resultY;
  resultWindow = new BrowserWindow({
    x: Math.round(selection.x),
    y: resultY,
    width: Math.max(RESULT_TOOLBAR_WIDTH, Math.round(selection.width)),
    height: toolbarOffset + Math.round(selection.height),
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    fullscreenable: false,
    skipTaskbar: true,
    resizable: false,
    title: "Screen Translate Result",
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  resultWindow.setAlwaysOnTop(true, "floating");
  resultWindow.on("closed", () => {
    resultWindow = null;
  });

  loadRenderer(resultWindow, "result");
}

async function translateCapture(
  capture: CaptureResult,
  captureFallbackReason?: string,
  onStage?: (stage: TranslatingStage) => void
): Promise<ResultPayload> {
  const settings = await getSettings();
  const apiKey = await getApiKey();
  const baiduSecretKey = await getBaiduSecretKey();
  const deeplxToken = await getDeeplxToken();
  const startedAt = Date.now();
  let activeStage: TranslatingStage = "ocr";

  try {
    onStage?.("ocr");
    const ocrStartedAt = Date.now();
    const lines = await recognizeText(
      capture.imageDataUrl,
      settings.ocrProvider,
      settings.requestTimeoutMs,
      settings.paddleOcrApiUrl
    );
    logTiming("ocr", ocrStartedAt, `${lines.length} line${lines.length === 1 ? "" : "s"}`);
    if (lines.length === 0) {
      throw new Error("No text was detected in the selected area.");
    }

    activeStage = "translating";
    onStage?.("translating");
    const modelStartedAt = Date.now();
    const blocks = await buildTranslatedBlocksForProvider(settings, apiKey, baiduSecretKey, deeplxToken, lines);
    logTiming(
      settings.translationProvider === "baidu" ? "baidu" : settings.translationProvider === "deeplx" ? "deeplx" : "model",
      modelStartedAt,
      `${blocks.length} block${blocks.length === 1 ? "" : "s"}`
    );

    const translation = normalizeTranslationForCapture(
      {
        sourceLanguage: "auto",
        targetLanguage: settings.targetLanguage,
        blocks
      },
      capture
    );
    return { capture, translation, usedFallback: Boolean(captureFallbackReason), captureFallbackReason };
  } catch (error) {
    const translationFallbackReason = error instanceof Error ? error.message : "Translation failed.";
    logTiming(`translation failed during ${activeStage}`, startedAt, translationFallbackReason);
    console.error("Translation failed; using fallback result.", error);
    return {
      capture,
      translation: createFallbackTranslation(capture, settings.targetLanguage),
      usedFallback: true,
      captureFallbackReason,
      translationFallbackReason
    };
  }
}

async function buildTranslatedBlocksForProvider(
  settings: AppSettings,
  apiKey: string,
  baiduSecretKey: string,
  deeplxToken: string,
  lines: OcrLine[]
): Promise<TranslationBlock[]> {
  if (settings.translationProvider === "baidu") {
    return buildBaiduTranslatedBlocks(settings, baiduSecretKey, lines);
  }

  if (settings.translationProvider === "deeplx") {
    return buildDeeplxTranslatedBlocks(settings, deeplxToken, lines);
  }

  return buildOpenAiTranslatedBlocks(settings, apiKey, lines);
}

async function buildBaiduTranslatedBlocks(
  settings: AppSettings,
  secretKey: string,
  lines: OcrLine[]
): Promise<TranslationBlock[]> {
  const groups = groupOcrLinesBySentence(lines);
  const translated = await translateTextsWithBaidu(
    settings,
    secretKey,
    groups.map((group) => group.text)
  );

  return groups.map((group, index) => ({
    sourceText: group.text,
    translatedText: translated[index] ?? group.text,
    bbox: group.bbox,
    confidence: 1
  }));
}

async function buildDeeplxTranslatedBlocks(
  settings: AppSettings,
  token: string,
  lines: OcrLine[]
): Promise<TranslationBlock[]> {
  const groups = groupOcrLinesBySentence(lines);
  const translated = await translateTextsWithDeeplx(
    settings,
    token,
    groups.map((group) => group.text)
  );

  return groups.map((group, index) => ({
    sourceText: group.text,
    translatedText: translated[index] ?? group.text,
    bbox: group.bbox,
    confidence: 1
  }));
}

async function buildOpenAiTranslatedBlocks(
  settings: AppSettings,
  apiKey: string,
  lines: OcrLine[]
): Promise<TranslationBlock[]> {
  const groups = groupOcrLinesBySentence(lines);
  const translated = await translateTexts(
    settings,
    apiKey,
    groups.map((group) => group.text)
  );

  return groups.map((group, index) => ({
    sourceText: group.text,
    translatedText: translated[index] ?? group.text,
    bbox: group.bbox,
    confidence: 1
  }));
}

function createFallbackTranslation(capture: CaptureResult, targetLanguage: string): TranslationResult {
  const scaleX = capture.selection.width / 720;
  const scaleY = capture.selection.height / 420;

  return normalizeTranslationForCapture(
    {
      ...mockTranslation,
      targetLanguage,
      blocks: mockTranslation.blocks.map((block) => ({
        ...block,
        bbox: {
          x: Math.round(block.bbox.x * scaleX),
          y: Math.round(block.bbox.y * scaleY),
          width: Math.max(4, Math.round(block.bbox.width * scaleX)),
          height: Math.max(4, Math.round(block.bbox.height * scaleY))
        },
        fontHint: block.fontHint
          ? {
              ...block.fontHint,
              size: block.fontHint.size ? Math.max(10, Math.round(block.fontHint.size * scaleY)) : undefined
            }
          : undefined
      }))
    },
    capture
  );
}

async function registerShortcut(): Promise<void> {
  globalShortcut.unregisterAll();

  const settings = await getSettings();
  if (shortcutPaused) {
    return;
  }

  const ok = globalShortcut.register(settings.shortcut, createCaptureWindow);
  if (!ok) {
    createSettingsWindow();
  }
}

function createTray(): void {
  const icon = nativeImage.createFromDataURL(
    "data:image/svg+xml;utf8," +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" rx="8" fill="#2563eb"/><text x="16" y="22" text-anchor="middle" font-size="18" fill="white" font-family="Arial">译</text></svg>'
      )
  );

  tray = new Tray(icon);
  tray.setToolTip("Screen Translate");
  updateTrayMenu();
}

function updateTrayMenu(): void {
  tray?.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Screenshot Translate", click: createCaptureWindow },
      { label: "Open Settings", click: createSettingsWindow },
      {
        label: shortcutPaused ? "Resume Shortcut" : "Pause Shortcut",
        click: async () => {
          shortcutPaused = !shortcutPaused;
          await registerShortcut();
          updateTrayMenu();
        }
      },
      { type: "separator" },
      { label: "Exit", click: () => app.quit() }
    ])
  );
}

function registerIpc(): void {
  ipcMain.handle("settings:get", async () => ({
    settings: await getSettings(),
    hasApiKey: await hasApiKey(),
    hasBaiduSecretKey: await hasBaiduSecretKey(),
    hasDeeplxToken: await hasDeeplxToken(),
    storagePath: getSettingsStoragePath()
  }));

  ipcMain.handle(
    "settings:save",
    async (_event, settings: AppSettings, apiKey?: string, baiduSecretKey?: string, deeplxToken?: string) => {
      const saved = await saveSettings(settings, apiKey, baiduSecretKey, deeplxToken);
      await registerShortcut();
      return saved;
    }
  );

  ipcMain.handle(
    "settings:testConnection",
    async (_event, settings: AppSettings, apiKey?: string, baiduSecretKey?: string, deeplxToken?: string) => {
      try {
        if (settings.translationProvider === "baidu") {
          await testBaiduTranslateEndpoint(settings, baiduSecretKey ?? (await getBaiduSecretKey()));
          return {
            ok: true,
            message: settings.interfaceLanguage === "zh-CN" ? "百度翻译连接成功。" : "Baidu Translate connection succeeded."
          };
        }

        if (settings.translationProvider === "deeplx") {
          await testDeeplxEndpoint(settings, deeplxToken ?? (await getDeeplxToken()));
          return {
            ok: true,
            message: settings.interfaceLanguage === "zh-CN" ? "DeepLX 连接成功。" : "DeepLX connection succeeded."
          };
        }

        await testOpenAiCompatibleEndpoint(settings, apiKey ?? (await getApiKey()));
        return {
          ok: true,
          message: settings.interfaceLanguage === "zh-CN" ? "连接成功。" : "Connection succeeded."
        };
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : "Connection failed." };
      }
    }
  );

  ipcMain.handle("capture:getWindowBounds", (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.getBounds() ?? getVirtualScreenBounds();
  });

  ipcMain.handle("capture:complete", async (_event, capture: CaptureResult) => {
    const totalStartedAt = Date.now();
    closeCaptureWindows();
    await new Promise((resolve) => setTimeout(resolve, 120));

    const captureDisplay = screen.getDisplayMatching(capture.selection);
    const captureWithDisplay = {
      ...capture,
      displayId: captureDisplay.id
    };

    let imageDataUrl = capture.imageDataUrl;
    let captureFallbackReason: string | undefined;
    if (!imageDataUrl) {
      try {
        const captureStartedAt = Date.now();
        imageDataUrl = await captureSelection(captureWithDisplay.selection, captureWithDisplay.displayId);
        logTiming("capture", captureStartedAt, `${captureWithDisplay.selection.width}x${captureWithDisplay.selection.height}`);
      } catch (error) {
        captureFallbackReason =
          error instanceof Error ? error.message : "Unable to capture the selected screen.";
        logTiming("capture failed", totalStartedAt, captureFallbackReason);
        console.error("Screen capture failed; using fallback image.", error);
        imageDataUrl = "";
      }
    }
    const completedCapture = {
      ...captureWithDisplay,
      imageDataUrl:
        imageDataUrl || createMockCaptureImageDataUrl(captureWithDisplay.selection.width, captureWithDisplay.selection.height)
    };

    lastCapture = completedCapture;
    setResultState({ status: "translating", capture: completedCapture, stage: "ocr" });
    createResultWindow(completedCapture);

    latestResult = await translateCapture(completedCapture, captureFallbackReason, (stage) =>
      setResultState({ status: "translating", capture: completedCapture, stage })
    );
    setResultState({ status: "done", capture: completedCapture, payload: latestResult });
    logTiming("total", totalStartedAt);

    const settings = await getSettings();
    if (settings.autoCopy) {
      clipboard.writeText(latestResult.translation.blocks.map((block) => block.translatedText).join("\n"));
    }
    await saveHistoryEntry(latestResult, settings);
  });

  ipcMain.handle("capture:cancel", () => {
    closeCaptureWindows();
  });

  ipcMain.handle("result:getPayload", () => latestResult);

  ipcMain.handle("result:getState", () => latestState);

  ipcMain.handle("history:clear", clearHistory);

  ipcMain.handle("clipboard:copyText", (_event, text: string) => {
    clipboard.writeText(text);
  });

  ipcMain.handle("window:closeCurrent", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });

  ipcMain.handle("result:close", () => {
    if (resultWindow && !resultWindow.isDestroyed()) {
      resultWindow.setAlwaysOnTop(false);
      resultWindow.destroy();
    }
    resultWindow = null;
  });

  ipcMain.handle("result:retryLastCapture", async () => {
    if (!lastCapture) {
      return;
    }

    const capture = lastCapture;
    setResultState({ status: "translating", capture, stage: "ocr" });
    latestResult = await translateCapture(capture, undefined, (stage) =>
      setResultState({ status: "translating", capture, stage })
    );
    setResultState({ status: "done", capture, payload: latestResult });
  });
}

app.whenReady().then(async () => {
  registerIpc();
  createTray();
  createSettingsWindow();
  await registerShortcut();
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("activate", () => {
  createSettingsWindow();
});
