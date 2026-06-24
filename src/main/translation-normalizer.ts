import type { CaptureResult, TranslationBlock, TranslationResult } from "../shared/types";

export function normalizeTranslationForCapture(
  result: TranslationResult,
  capture: CaptureResult
): TranslationResult {
  const blocks = result.blocks
    .map((block) => clampBlock(block, capture.selection.width, capture.selection.height))
    .filter((block): block is TranslationBlock => Boolean(block));

  if (blocks.length === 0) {
    throw new Error("Model response did not contain usable translation blocks.");
  }

  return { ...result, blocks };
}

function clampBlock(
  block: TranslationBlock,
  maxWidth: number,
  maxHeight: number
): TranslationBlock | null {
  const x = clamp(block.bbox.x, 0, maxWidth);
  const y = clamp(block.bbox.y, 0, maxHeight);
  const right = clamp(block.bbox.x + block.bbox.width, 0, maxWidth);
  const bottom = clamp(block.bbox.y + block.bbox.height, 0, maxHeight);
  const width = right - x;
  const height = bottom - y;

  if (width < 4 || height < 4) {
    return null;
  }

  return {
    ...block,
    bbox: { x, y, width, height },
    confidence: clamp(block.confidence, 0, 1)
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
