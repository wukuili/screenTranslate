import { app } from "electron";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AppSettings, ResultPayload } from "../shared/types";

const historyDir = () => join(app.getPath("userData"), "history");

export async function saveHistoryEntry(payload: ResultPayload, settings: AppSettings): Promise<void> {
  if (!settings.saveHistory) {
    return;
  }

  const dir = historyDir();
  await mkdir(dir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const baseName = `${timestamp}-${Math.random().toString(16).slice(2, 8)}`;
  const imagePath = join(dir, `${baseName}.png`);
  const jsonPath = join(dir, `${baseName}.json`);

  await writeFile(imagePath, dataUrlToBuffer(payload.capture.imageDataUrl));
  await writeFile(
    jsonPath,
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        targetLanguage: payload.translation.targetLanguage,
        usedFallback: payload.usedFallback,
        selection: payload.capture.selection,
        translation: payload.translation
      },
      null,
      2
    ),
    "utf8"
  );

  await pruneHistory(settings.maxHistoryItems);
}

export async function clearHistory(): Promise<void> {
  await rm(historyDir(), { recursive: true, force: true });
  await mkdir(historyDir(), { recursive: true });
}

async function pruneHistory(maxItems: number): Promise<void> {
  const files = await readdir(historyDir(), { withFileTypes: true });
  const jsonFiles = files
    .filter((file) => file.isFile() && file.name.endsWith(".json"))
    .map((file) => file.name)
    .sort()
    .reverse();

  const staleJsonFiles = jsonFiles.slice(Math.max(1, maxItems));
  await Promise.all(
    staleJsonFiles.flatMap((jsonFile) => {
      const baseName = jsonFile.replace(/\.json$/, "");
      return [
        rm(join(historyDir(), `${baseName}.json`), { force: true }),
        rm(join(historyDir(), `${baseName}.png`), { force: true })
      ];
    })
  );
}

function dataUrlToBuffer(dataUrl: string): Buffer {
  const [, base64 = ""] = dataUrl.split(",", 2);
  return Buffer.from(base64, "base64");
}
