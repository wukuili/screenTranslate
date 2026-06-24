import { contextBridge, ipcRenderer } from "electron";
import type { AppSettings, CaptureResult, ScreenTranslateApi } from "../shared/types";

const api: ScreenTranslateApi = {
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (settings: AppSettings, apiKey?: string) =>
    ipcRenderer.invoke("settings:save", settings, apiKey),
  testConnection: (settings: AppSettings, apiKey?: string) =>
    ipcRenderer.invoke("settings:testConnection", settings, apiKey),
  completeCapture: (capture: CaptureResult) => ipcRenderer.invoke("capture:complete", capture),
  cancelCapture: () => ipcRenderer.invoke("capture:cancel"),
  getResultPayload: () => ipcRenderer.invoke("result:getPayload"),
  copyText: (text: string) => ipcRenderer.invoke("clipboard:copyText", text),
  closeCurrentWindow: () => ipcRenderer.invoke("window:closeCurrent"),
  retryLastCapture: () => ipcRenderer.invoke("result:retryLastCapture")
};

contextBridge.exposeInMainWorld("screenTranslate", api);
