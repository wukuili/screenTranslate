import { app } from "electron";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import type { CaptureSelection, OcrProvider } from "../shared/types";

export interface OcrLine {
  text: string;
  bbox: CaptureSelection;
}

interface RawOcrLine {
  text?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

interface PaddleApiItem {
  text?: string;
  score?: number;
  box?: unknown;
  poly?: unknown;
}

interface PaddleApiResponse {
  ok?: boolean;
  error?: string;
  items?: PaddleApiItem[];
}

// Uses the OCR engine built into Windows (Windows.Media.Ocr) via PowerShell/WinRT.
// The recognized coordinates are in the pixel space of the supplied image, which —
// because captureSelection resizes the crop to the selection size — already matches
// the CSS coordinate space the overlay renders in.
const OCR_SCRIPT = `param([string]$ImagePath, [string]$OutPath)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime | Out-Null

$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1'
})[0]

function Await($op, $resultType) {
  $m = $asTaskGeneric.MakeGenericMethod($resultType)
  $task = $m.Invoke($null, @($op))
  $task.Wait(-1) | Out-Null
  $task.Result
}

[Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.Streams.IRandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.SoftwareBitmap, Windows.Graphics.Imaging, ContentType = WindowsRuntime] | Out-Null
[Windows.Media.Ocr.OcrEngine, Windows.Media.Ocr, ContentType = WindowsRuntime] | Out-Null

$enc = New-Object System.Text.UTF8Encoding($false)

$file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($ImagePath)) ([Windows.Storage.StorageFile])
$stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
$decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
$bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])

$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
if ($null -eq $engine) {
  [System.IO.File]::WriteAllText($OutPath, '[]', $enc)
  exit 0
}

$result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])

$lines = @()
foreach ($line in $result.Lines) {
  $minX = [double]::MaxValue; $minY = [double]::MaxValue; $maxX = 0.0; $maxY = 0.0
  foreach ($word in $line.Words) {
    $r = $word.BoundingRect
    if ($r.X -lt $minX) { $minX = $r.X }
    if ($r.Y -lt $minY) { $minY = $r.Y }
    if (($r.X + $r.Width) -gt $maxX) { $maxX = $r.X + $r.Width }
    if (($r.Y + $r.Height) -gt $maxY) { $maxY = $r.Y + $r.Height }
  }
  if ($minX -eq [double]::MaxValue) { continue }
  $lines += [pscustomobject]@{
    text = $line.Text
    x = [int][math]::Floor($minX)
    y = [int][math]::Floor($minY)
    width = [int][math]::Ceiling($maxX - $minX)
    height = [int][math]::Ceiling($maxY - $minY)
  }
}

$json = ConvertTo-Json @($lines) -Depth 5 -Compress
[System.IO.File]::WriteAllText($OutPath, $json, $enc)
`;

const PADDLE_OCR_SCRIPT = `import json
import math
import sys
from pathlib import Path


def main():
    image_path = sys.argv[1]
    out_path = sys.argv[2]

    try:
        from paddleocr import PaddleOCR
    except Exception as exc:
        raise RuntimeError(
            "PaddleOCR is not installed. Install it with: pip install paddleocr paddlepaddle"
        ) from exc

    ocr = create_ocr()
    result = run_ocr(ocr, image_path)
    lines = parse_result(result)
    Path(out_path).write_text(json.dumps(lines, ensure_ascii=False), encoding="utf-8")


def create_ocr():
    from paddleocr import PaddleOCR

    attempts = [
        lambda: PaddleOCR(use_angle_cls=True, lang="ch", show_log=False),
        lambda: PaddleOCR(use_angle_cls=True, lang="ch"),
        lambda: PaddleOCR(lang="ch"),
        lambda: PaddleOCR(),
    ]

    last_error = None
    for attempt in attempts:
        try:
            return attempt()
        except TypeError as exc:
            last_error = exc

    raise last_error


def run_ocr(ocr, image_path):
    if hasattr(ocr, "ocr"):
        try:
            return ocr.ocr(image_path, cls=True)
        except TypeError:
            return ocr.ocr(image_path)

    if hasattr(ocr, "predict"):
        return ocr.predict(image_path)

    raise RuntimeError("Unsupported PaddleOCR API: no ocr() or predict() method found.")


def parse_result(result):
    lines = []
    collect_lines(result, lines)
    return lines


def collect_lines(value, lines):
    structured = to_structured_value(value)
    if structured is not value:
        collect_lines(structured, lines)
        return

    parsed = parse_line(value)
    if parsed:
        lines.append(parsed)
        return

    if isinstance(value, dict):
        extracted = extract_from_dict(value)
        for item in extracted:
            lines.append(item)
        if extracted:
            return
        for item in value.values():
            collect_lines(item, lines)
        return

    if isinstance(value, (list, tuple)):
        for item in value:
            collect_lines(item, lines)


def to_structured_value(value):
    for name in ("to_dict", "json"):
        attr = getattr(value, name, None)
        if not attr:
            continue

        try:
            candidate = attr() if callable(attr) else attr
        except Exception:
            continue

        if isinstance(candidate, str):
            try:
                return json.loads(candidate)
            except Exception:
                continue

        if isinstance(candidate, (dict, list, tuple)):
            return candidate

    return value


def extract_from_dict(value):
    texts = value.get("rec_texts") or value.get("texts") or []
    scores = value.get("rec_scores") or value.get("scores") or []
    boxes = value.get("rec_polys") or value.get("rec_boxes") or value.get("dt_polys") or value.get("boxes") or []
    lines = []

    for index, text in enumerate(texts):
        box = boxes[index] if index < len(boxes) else None
        parsed_box = normalize_box(box)
        if not parsed_box:
            continue

        score = scores[index] if index < len(scores) else None
        item = make_line(text, parsed_box, score)
        if item:
            lines.append(item)

    return lines


def parse_line(value):
    if not isinstance(value, (list, tuple)) or len(value) < 2:
        return None

    box = normalize_box(value[0])
    if not box:
        return None

    text = None
    score = None
    payload = value[1]

    if isinstance(payload, str):
        text = payload
    elif isinstance(payload, (list, tuple)) and payload:
        text = payload[0]
        if len(payload) > 1:
            score = payload[1]
    elif isinstance(payload, dict):
        text = payload.get("text") or payload.get("rec_text")
        score = payload.get("score") or payload.get("confidence") or payload.get("rec_score")

    return make_line(text, box, score)


def normalize_box(box):
    if box is None:
        return None

    if hasattr(box, "tolist"):
        box = box.tolist()

    if not isinstance(box, (list, tuple)) or not box:
        return None

    if len(box) == 4 and all(is_number(value) for value in box):
        x, y, width_or_x2, height_or_y2 = [float(value) for value in box]
        width = width_or_x2 - x if width_or_x2 > x else width_or_x2
        height = height_or_y2 - y if height_or_y2 > y else height_or_y2
        return x, y, width, height

    points = []
    for point in box:
        if hasattr(point, "tolist"):
            point = point.tolist()
        if isinstance(point, (list, tuple)) and len(point) >= 2 and is_number(point[0]) and is_number(point[1]):
            points.append((float(point[0]), float(point[1])))

    if not points:
        return None

    xs = [point[0] for point in points]
    ys = [point[1] for point in points]
    x = min(xs)
    y = min(ys)
    return x, y, max(xs) - x, max(ys) - y


def make_line(text, box, score):
    if not isinstance(text, str) or not text.strip():
        return None

    x, y, width, height = box
    if width <= 0 or height <= 0:
        return None

    line = {
        "text": text.strip(),
        "x": math.floor(x),
        "y": math.floor(y),
        "width": math.ceil(width),
        "height": math.ceil(height),
    }

    if is_number(score):
        line["confidence"] = float(score)

    return line


def is_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


if __name__ == "__main__":
    main()
`;

export async function recognizeText(
  imageDataUrl: string,
  provider: OcrProvider = "windows",
  timeoutMs = 60000,
  paddleApiUrl = "http://127.0.0.1:8866"
): Promise<OcrLine[]> {
  if (process.platform !== "win32") {
    throw new Error("Local OCR is only available on Windows.");
  }

  const png = decodeRasterDataUrl(imageDataUrl);
  if (!png) {
    throw new Error("Capture image is not a raster image OCR can read.");
  }

  return provider === "paddle" ? recognizeWithPaddle(png, timeoutMs, paddleApiUrl) : recognizeWithWindows(png);
}

async function recognizeWithWindows(png: Buffer): Promise<OcrLine[]> {
  const dir = await mkdtemp(join(tmpdir(), "screen-translate-ocr-"));
  const imagePath = join(dir, "capture.png");
  const scriptPath = join(dir, "ocr.ps1");
  const outPath = join(dir, "result.json");

  try {
    await Promise.all([writeFile(imagePath, png), writeFile(scriptPath, OCR_SCRIPT, "utf8")]);

    await runPowerShell(scriptPath, imagePath, outPath);

    const content = await readFile(outPath, "utf8");
    const parsed = JSON.parse(content.replace(/^﻿/, "")) as RawOcrLine[] | RawOcrLine | null;
    const rawLines = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];

    return rawLines
      .map((line) => normalizeLine(line))
      .filter((line): line is OcrLine => line !== null);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function recognizeWithPaddle(png: Buffer, timeoutMs: number, apiUrl: string): Promise<OcrLine[]> {
  if (apiUrl.trim()) {
    try {
      return await recognizeWithPaddleApi(png, timeoutMs, apiUrl);
    } catch (error) {
      console.warn("PaddleOCR API failed; falling back to local Python package.", error);
    }
  }

  const dir = await mkdtemp(join(tmpdir(), "screen-translate-paddle-ocr-"));
  const imagePath = join(dir, "capture.png");
  const scriptPath = join(dir, "paddle_ocr.py");
  const outPath = join(dir, "result.json");

  try {
    await Promise.all([writeFile(imagePath, png), writeFile(scriptPath, PADDLE_OCR_SCRIPT, "utf8")]);

    await runPython(scriptPath, imagePath, outPath, timeoutMs);

    const content = await readFile(outPath, "utf8");
    const parsed = JSON.parse(content.replace(/^﻿/, "")) as RawOcrLine[] | RawOcrLine | null;
    const rawLines = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];

    return rawLines
      .map((line) => normalizeLine(line))
      .filter((line): line is OcrLine => line !== null);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function recognizeWithPaddleApi(png: Buffer, timeoutMs: number, apiUrl: string): Promise<OcrLine[]> {
  const endpoint = `${apiUrl.replace(/\/$/, "")}/ocr_base64`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(5000, timeoutMs));

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        image_base64: png.toString("base64"),
        filename: "capture.png",
        return_raw: false
      }),
      signal: controller.signal
    });

    const body = await response.text();
    if (!response.ok) {
      throw new Error(`PaddleOCR API returned ${response.status}: ${body.slice(0, 300)}`);
    }

    const parsed = JSON.parse(body) as PaddleApiResponse;
    if (parsed.ok === false) {
      throw new Error(parsed.error || "PaddleOCR API returned ok=false.");
    }

    return (parsed.items ?? [])
      .map((item) => normalizePaddleApiItem(item))
      .filter((line): line is OcrLine => line !== null);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`PaddleOCR API timed out after ${Math.round(timeoutMs / 1000)}s.`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizePaddleApiItem(item: PaddleApiItem): OcrLine | null {
  const text = (item.text ?? "").trim();
  const box = normalizePaddleBox(item.poly ?? item.box);

  if (!text || !box) {
    return null;
  }

  return { text, bbox: box };
}

function normalizePaddleBox(box: unknown): CaptureSelection | null {
  if (!Array.isArray(box) || box.length === 0) {
    return null;
  }

  if (box.length === 4 && box.every((value) => typeof value === "number" && Number.isFinite(value))) {
    const [left, top, rightOrWidth, bottomOrHeight] = box;
    const width = rightOrWidth > left ? rightOrWidth - left : rightOrWidth;
    const height = bottomOrHeight > top ? bottomOrHeight - top : bottomOrHeight;
    return normalizeBoxRect(left, top, width, height);
  }

  const points = box
    .filter((point): point is number[] => Array.isArray(point))
    .map((point) => [Number(point[0]), Number(point[1])])
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));

  if (points.length === 0) {
    return null;
  }

  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  return normalizeBoxRect(left, top, Math.max(...xs) - left, Math.max(...ys) - top);
}

function normalizeBoxRect(x: number, y: number, width: number, height: number): CaptureSelection | null {
  const roundedWidth = Math.round(width);
  const roundedHeight = Math.round(height);
  if (roundedWidth <= 0 || roundedHeight <= 0) {
    return null;
  }

  return {
    x: Math.round(x),
    y: Math.round(y),
    width: roundedWidth,
    height: roundedHeight
  };
}

function normalizeLine(line: RawOcrLine): OcrLine | null {
  const text = (line.text ?? "").trim();
  const width = Math.round(line.width ?? 0);
  const height = Math.round(line.height ?? 0);

  if (!text || width <= 0 || height <= 0) {
    return null;
  }

  return {
    text,
    bbox: {
      x: Math.round(line.x ?? 0),
      y: Math.round(line.y ?? 0),
      width,
      height
    }
  };
}

function decodeRasterDataUrl(dataUrl: string): Buffer | null {
  const match = /^data:image\/(png|jpe?g|bmp);base64,(.+)$/i.exec(dataUrl.trim());
  if (!match) {
    return null;
  }

  return Buffer.from(match[2], "base64");
}

function runPowerShell(scriptPath: string, imagePath: string, outPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", scriptPath, imagePath, outPath],
      { windowsHide: true, timeout: 30000, maxBuffer: 1024 * 1024 },
      (error, _stdout, stderr) => {
        if (error) {
          const detail = stderr?.trim();
          reject(new Error(`OCR failed: ${detail || error.message}`));
          return;
        }
        resolve();
      }
    );
  });
}

async function runPython(scriptPath: string, imagePath: string, outPath: string, timeoutMs: number): Promise<void> {
  const candidates = await getPythonCandidates(scriptPath, imagePath, outPath);

  const errors: string[] = [];
  for (const candidate of candidates) {
    try {
      await runExecutable(candidate.command, candidate.args, timeoutMs);
      return;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  throw new Error(`PaddleOCR failed: ${summarizePythonErrors(errors)}`);
}

async function getPythonCandidates(
  scriptPath: string,
  imagePath: string,
  outPath: string
): Promise<Array<{ command: string; args: string[] }>> {
  const commands: string[] = [];
  const addCommand = (command: string) => {
    const trimmed = command.trim();
    if (!trimmed || (!isAbsolute(trimmed) && trimmed.includes("\\"))) {
      return;
    }

    if (!commands.some((existing) => existing.toLowerCase() === trimmed.toLowerCase())) {
      commands.push(trimmed);
    }
  };

  if (process.platform === "win32") {
    for (const command of await listWindowsPythonPaths()) {
      addCommand(command);
    }

    addCommand("python.exe");
    addCommand("py.exe");
    addCommand("python3.exe");
  } else {
    addCommand("python3");
    addCommand("python");
  }

  return commands.map((command) => ({
    command,
    args: command.toLowerCase().endsWith("py.exe") ? ["-3", scriptPath, imagePath, outPath] : [scriptPath, imagePath, outPath]
  }));
}

async function listWindowsPythonPaths(): Promise<string[]> {
  const [whereOutput, launcherOutput] = await Promise.all([
    readProcessOutput("where.exe", ["python", "python3"]).catch(() => ""),
    readProcessOutput("py.exe", ["-0p"]).catch(() => "")
  ]);

  const paths: string[] = [];
  for (const line of whereOutput.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.includes("WindowsApps")) {
      paths.push(trimmed);
    }
  }

  for (const line of launcherOutput.split(/\r?\n/)) {
    const match = /([A-Za-z]:\\.*?python\.exe)\s*$/i.exec(line.trim());
    if (match) {
      paths.push(match[1]);
    }
  }

  return paths;
}

function summarizePythonErrors(errors: string[]): string {
  const unique = [...new Set(errors.map((error) => error.trim()).filter(Boolean))];
  if (unique.some((error) => error.includes("ModuleNotFoundError: No module named 'paddleocr'"))) {
    return "PaddleOCR is not installed in any discovered Python environment. Install it with: python -m pip install paddleocr paddlepaddle";
  }

  return unique.slice(0, 3).join(" | ") || "Python executable was not found.";
}

function readProcessOutput(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { windowsHide: true, timeout: 5000, maxBuffer: 1024 * 1024 }, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(stdout);
    });
  });
}

function runExecutable(command: string, args: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      { windowsHide: true, timeout: Math.max(30000, timeoutMs), maxBuffer: 1024 * 1024 * 4 },
      (error, _stdout, stderr) => {
        if (error) {
          const detail = stderr?.trim();
          reject(new Error(detail || error.message));
          return;
        }

        resolve();
      }
    );
  });
}
