import { app, BrowserWindow, clipboard, globalShortcut, ipcMain, nativeImage, screen, Tray, Menu } from "electron";
import { join } from "node:path";
import type { AppSettings, CaptureResult, ResultPayload } from "../shared/types";
import { mockTranslation } from "./defaults";
import { getApiKey, getSettings, saveSettings } from "./settings-store";
import { testOpenAiCompatibleEndpoint, translateScreenshot } from "./openai-compatible";

let tray: Tray | null = null;
let settingsWindow: BrowserWindow | null = null;
let captureWindow: BrowserWindow | null = null;
let resultWindow: BrowserWindow | null = null;
let lastCapture: CaptureResult | null = null;
let latestResult: ResultPayload | null = null;
let shortcutPaused = false;

function loadRenderer(window: BrowserWindow, view: string): void {
  const query = { view };

  if (process.env.ELECTRON_RENDERER_URL) {
    window.loadURL(`${process.env.ELECTRON_RENDERER_URL}?view=${view}`);
  } else {
    window.loadFile(join(__dirname, "../renderer/index.html"), { query });
  }
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
      preload: join(__dirname, "../preload/index.js"),
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

  const bounds = screen.getPrimaryDisplay().bounds;
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
      preload: join(__dirname, "../preload/index.js"),
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

function createResultWindow(payload: ResultPayload): void {
  if (resultWindow && !resultWindow.isDestroyed()) {
    resultWindow.close();
  }

  const { selection } = payload.capture;
  resultWindow = new BrowserWindow({
    x: Math.round(selection.x),
    y: Math.round(selection.y),
    width: Math.max(420, Math.round(selection.width)),
    height: Math.max(260, Math.round(selection.height)),
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    fullscreenable: false,
    skipTaskbar: true,
    resizable: true,
    title: "Screen Translate Result",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
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

async function translateCapture(capture: CaptureResult): Promise<ResultPayload> {
  const settings = await getSettings();
  const apiKey = await getApiKey();

  try {
    const translation = await translateScreenshot(settings, apiKey, capture);
    return { capture, translation, usedFallback: false };
  } catch {
    return {
      capture,
      translation: {
        ...mockTranslation,
        targetLanguage: settings.targetLanguage
      },
      usedFallback: true
    };
  }
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
  ipcMain.handle("settings:get", getSettings);

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

  ipcMain.handle("capture:complete", async (_event, capture: CaptureResult) => {
    lastCapture = capture;
    captureWindow?.close();
    latestResult = await translateCapture(capture);
    createResultWindow(latestResult);
  });

  ipcMain.handle("capture:cancel", () => {
    captureWindow?.close();
  });

  ipcMain.handle("result:getPayload", () => latestResult);

  ipcMain.handle("clipboard:copyText", (_event, text: string) => {
    clipboard.writeText(text);
  });

  ipcMain.handle("window:closeCurrent", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });

  ipcMain.handle("result:retryLastCapture", async () => {
    if (!lastCapture) {
      return;
    }

    latestResult = await translateCapture(lastCapture);
    createResultWindow(latestResult);
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
