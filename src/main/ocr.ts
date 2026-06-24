import { app } from "electron";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CaptureSelection } from "../shared/types";

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

export async function recognizeText(imageDataUrl: string): Promise<OcrLine[]> {
  if (process.platform !== "win32") {
    throw new Error("Local OCR is only available on Windows.");
  }

  const png = decodeRasterDataUrl(imageDataUrl);
  if (!png) {
    throw new Error("Capture image is not a raster image OCR can read.");
  }

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
