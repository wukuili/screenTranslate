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
import { getApiKey, getSettings, getSettingsStoragePath, hasApiKey, saveSettings } from "./settings-store";
import { testOpenAiCompatibleEndpoint, translateGroupedLines, translateTexts } from "./openai-compatible";
import { recognizeText, type OcrLine } from "./ocr";
import { captureSelection } from "./screen-capture";
import { normalizeTranslationForCapture } from "./translation-normalizer";
import { clearHistory, saveHistoryEntry } from "./history-store";

let tray: Tray | null = null;
let settingsWindow: BrowserWindow | null = null;
let captureWindow: BrowserWindow | null = null;
let resultWindow: BrowserWindow | null = null;
let lastCapture: CaptureResult | null = null;
let latestResult: ResultPayload | null = null;
let latestState: ResultState | null = null;
let shortcutPaused = false;
const RESULT_TOOLBAR_WIDTH = 460;
const RESULT_TOOLBAR_HEIGHT = 56;
const APP_NAME = "Screen Translate";

app.setName(APP_NAME);
app.setPath("userData", join(app.getPath("appData"), APP_NAME));

function loadRenderer(window: BrowserWindow, view: string): void {
  const query = { view };

  if (process.env.ELECTRON_RENDERER_URL) {
    window.loadURL(`${process.env.ELECTRON_RENDERER_URL}?view=${view}`);
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

function createCaptureWindow(): void {
  if (captureWindow && !captureWindow.isDestroyed()) {
    captureWindow.focus();
    return;
  }

  const bounds = getVirtualScreenBounds();
  captureWindow = new BrowserWindow({
    ...bounds,
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
    captureWindow = null;
  });

  loadRenderer(captureWindow, "capture");
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
  resultWindow = new BrowserWindow({
    x: Math.round(selection.x),
    y: Math.round(selection.y),
    width: Math.max(RESULT_TOOLBAR_WIDTH, Math.round(selection.width)),
    height: Math.max(RESULT_TOOLBAR_HEIGHT, Math.round(selection.height)),
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

  try {
    onStage?.("ocr");
    const lines = await recognizeText(capture.imageDataUrl);
    if (lines.length === 0) {
      throw new Error("No text was detected in the selected area.");
    }

    onStage?.("translating");
    const blocks = await buildTranslatedBlocks(settings, apiKey, lines);

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

// Groups OCR lines into sentences/paragraphs via the model, then renders each merged group
// as one block positioned over the union of its source lines' bounding boxes.
async function buildTranslatedBlocks(
  settings: AppSettings,
  apiKey: string,
  lines: OcrLine[]
): Promise<TranslationBlock[]> {
  const segments = await translateGroupedLines(
    settings,
    apiKey,
    lines.map((line) => line.text)
  );

  const blocks: TranslationBlock[] = [];
  const covered = new Set<number>();

  for (const segment of segments) {
    const segmentLines = segment.lineIndices
      .filter((index) => !covered.has(index))
      .map((index) => {
        covered.add(index);
        return lines[index];
      });

    if (segmentLines.length === 0) {
      continue;
    }

    blocks.push({
      sourceText: segmentLines.map((line) => line.text).join(" "),
      translatedText: segment.translatedText,
      bbox: unionBbox(segmentLines.map((line) => line.bbox)),
      confidence: 1
    });
  }

  // Any line the model failed to group must not be dropped. If grouping produced nothing at
  // all, translate the leftovers per-line as a real fallback; otherwise keep them in place.
  const leftovers = lines.filter((_, index) => !covered.has(index));
  if (leftovers.length > 0) {
    const groupingFailed = blocks.length === 0;
    const translated = groupingFailed
      ? await translateTexts(settings, apiKey, leftovers.map((line) => line.text))
      : [];

    leftovers.forEach((line, index) => {
      blocks.push({
        sourceText: line.text,
        translatedText: groupingFailed ? translated[index] ?? line.text : line.text,
        bbox: line.bbox,
        confidence: groupingFailed ? 1 : 0.5
      });
    });
  }

  return blocks;
}

function unionBbox(boxes: CaptureSelection[]): CaptureSelection {
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));

  return { x: left, y: top, width: right - left, height: bottom - top };
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
    storagePath: getSettingsStoragePath()
  }));

  ipcMain.handle("settings:save", async (_event, settings: AppSettings, apiKey?: string) => {
    const saved = await saveSettings(settings, apiKey);
    await registerShortcut();
    return saved;
  });

  ipcMain.handle("settings:testConnection", async (_event, settings: AppSettings, apiKey?: string) => {
    try {
      await testOpenAiCompatibleEndpoint(settings, apiKey ?? (await getApiKey()));
      return { ok: true, message: "Connection succeeded." };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "Connection failed." };
    }
  });

  ipcMain.handle("capture:getWindowBounds", () => captureWindow?.getBounds() ?? getVirtualScreenBounds());

  ipcMain.handle("capture:complete", async (_event, capture: CaptureResult) => {
    captureWindow?.close();
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
        imageDataUrl = await captureSelection(captureWithDisplay.selection, captureWithDisplay.displayId);
      } catch (error) {
        captureFallbackReason =
          error instanceof Error ? error.message : "Unable to capture the selected screen.";
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

    const settings = await getSettings();
    if (settings.autoCopy) {
      clipboard.writeText(latestResult.translation.blocks.map((block) => block.translatedText).join("\n"));
    }
    await saveHistoryEntry(latestResult, settings);
  });

  ipcMain.handle("capture:cancel", () => {
    captureWindow?.close();
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
