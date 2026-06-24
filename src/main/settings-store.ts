import { app, safeStorage } from "electron";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { AppSettings } from "../shared/types";
import { defaultSettings } from "./defaults";

interface StoredSettings {
  settings: AppSettings;
  encryptedApiKey?: string;
}

const configPath = () => join(app.getPath("userData"), "settings.json");

async function readStoredSettings(): Promise<StoredSettings> {
  try {
    const content = await readFile(configPath(), "utf8");
    const parsed = JSON.parse(content) as Partial<StoredSettings>;
    return {
      settings: { ...defaultSettings, ...parsed.settings },
      encryptedApiKey: parsed.encryptedApiKey
    };
  } catch {
    return { settings: defaultSettings };
  }
}

export async function getSettings(): Promise<AppSettings> {
  const stored = await readStoredSettings();
  return stored.settings;
}

export async function getApiKey(): Promise<string> {
  const stored = await readStoredSettings();

  if (!stored.encryptedApiKey) {
    return "";
  }

  if (!safeStorage.isEncryptionAvailable()) {
    return Buffer.from(stored.encryptedApiKey, "base64").toString("utf8");
  }

  return safeStorage.decryptString(Buffer.from(stored.encryptedApiKey, "base64"));
}

export async function saveSettings(settings: AppSettings, apiKey?: string): Promise<AppSettings> {
  const previous = await readStoredSettings();
  const next: StoredSettings = {
    settings: { ...defaultSettings, ...settings },
    encryptedApiKey: previous.encryptedApiKey
  };

  if (apiKey !== undefined) {
    const encrypted = safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(apiKey)
      : Buffer.from(apiKey, "utf8");
    next.encryptedApiKey = encrypted.toString("base64");
  }

  await mkdir(dirname(configPath()), { recursive: true });
  await writeFile(configPath(), JSON.stringify(next, null, 2), "utf8");
  return next.settings;
}
