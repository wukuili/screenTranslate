import { contextBridge, ipcRenderer } from "electron";
import type { AppSettings, CaptureResult, ResultState, ScreenTranslateApi } from "../shared/types";

const api: ScreenTranslateApi = {
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (settings: AppSettings, apiKey?: string) =>
    ipcRenderer.invoke("settings:save", settings, apiKey),
  testConnection: (settings: AppSettings, apiKey?: string) =>
    ipcRenderer.invoke("settings:testConnection", settings, apiKey),
  getCaptureWindowBounds: () => ipcRenderer.invoke("capture:getWindowBounds"),
  completeCapture: (capture: CaptureResult) => ipcRenderer.invoke("capture:complete", capture),
  cancelCapture: () => ipcRenderer.invoke("capture:cancel"),
  getResultPayload: () => ipcRenderer.invoke("result:getPayload"),
  getResultState: () => ipcRenderer.invoke("result:getState"),
  onResultState: (callback: (state: ResultState) => void) => {
    const listener = (_event: unknown, state: ResultState) => callback(state);
    ipcRenderer.on("result:state", listener);
    return () => ipcRenderer.removeListener("result:state", listener);
  },
  clearHistory: () => ipcRenderer.invoke("history:clear"),
  copyText: (text: string) => ipcRenderer.invoke("clipboard:copyText", text),
  closeCurrentWindow: () => ipcRenderer.invoke("window:closeCurrent"),
  closeResultWindow: () => ipcRenderer.invoke("result:close"),
  retryLastCapture: () => ipcRenderer.invoke("result:retryLastCapture")
};

contextBridge.exposeInMainWorld("screenTranslate", api);
