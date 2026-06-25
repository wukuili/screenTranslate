import { app, safeStorage } from "electron";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { AppSettings } from "../shared/types";
import { defaultSettings } from "./defaults";

interface StoredSettings {
  settings: AppSettings;
  encryptedApiKey?: string;
  encryptedBaiduSecretKey?: string;
}

const configPath = () => join(app.getPath("userData"), "settings.json");

export function getSettingsStoragePath(): string {
  return configPath();
}

async function readStoredSettings(): Promise<StoredSettings> {
  try {
    const content = await readFile(configPath(), "utf8");
    const parsed = JSON.parse(content) as Partial<StoredSettings>;
    return {
      settings: { ...defaultSettings, ...parsed.settings },
      encryptedApiKey: parsed.encryptedApiKey,
      encryptedBaiduSecretKey: parsed.encryptedBaiduSecretKey
    };
  } catch {
    return { settings: defaultSettings };
  }
}

export async function getSettings(): Promise<AppSettings> {
  const stored = await readStoredSettings();
  return stored.settings;
}

export async function hasApiKey(): Promise<boolean> {
  const stored = await readStoredSettings();
  return Boolean(stored.encryptedApiKey);
}

export async function hasBaiduSecretKey(): Promise<boolean> {
  const stored = await readStoredSettings();
  return Boolean(stored.encryptedBaiduSecretKey);
}

export async function getApiKey(): Promise<string> {
  const stored = await readStoredSettings();

  return decryptSecret(stored.encryptedApiKey);
}

export async function getBaiduSecretKey(): Promise<string> {
  const stored = await readStoredSettings();

  return decryptSecret(stored.encryptedBaiduSecretKey);
}

function decryptSecret(encryptedSecret?: string): string {
  if (!encryptedSecret) {
    return "";
  }

  if (!safeStorage.isEncryptionAvailable()) {
    return Buffer.from(encryptedSecret, "base64").toString("utf8");
  }

  return safeStorage.decryptString(Buffer.from(encryptedSecret, "base64"));
}

function encryptSecret(secret: string): string {
  const encrypted = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(secret)
    : Buffer.from(secret, "utf8");
  return encrypted.toString("base64");
}

export async function saveSettings(
  settings: AppSettings,
  apiKey?: string,
  baiduSecretKey?: string
): Promise<AppSettings> {
  const previous = await readStoredSettings();
  const next: StoredSettings = {
    settings: { ...defaultSettings, ...settings },
    encryptedApiKey: previous.encryptedApiKey,
    encryptedBaiduSecretKey: previous.encryptedBaiduSecretKey
  };

  if (apiKey !== undefined) {
    next.encryptedApiKey = encryptSecret(apiKey);
  }

  if (baiduSecretKey !== undefined) {
    next.encryptedBaiduSecretKey = encryptSecret(baiduSecretKey);
  }

  await mkdir(dirname(configPath()), { recursive: true });
  await writeFile(configPath(), JSON.stringify(next, null, 2), "utf8");
  return next.settings;
}
