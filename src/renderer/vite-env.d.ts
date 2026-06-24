/// <reference types="vite/client" />

import type { ScreenTranslateApi } from "../shared/types";

declare global {
  interface Window {
    screenTranslate?: ScreenTranslateApi;
  }
}
