import type { TranslationBlock } from "../shared/types";

export interface TranslationChipPlacement {
  index: number;
  variant: "inline" | "expanded";
  x: number;
  y: number;
  width: number;
  minHeight: number;
  fontSize: number;
  lineHeight: number;
  maxLines: number;
}

interface PlacedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const HORIZONTAL_PADDING = 16;
const VERTICAL_PADDING = 10;
const CHIP_GAP = 4;
const LINE_HEIGHT = 1.22;
const INLINE_HORIZONTAL_PADDING = 2;
const INLINE_VERTICAL_PADDING = 1;
const INLINE_LINE_HEIGHT = 1.02;
const MIN_INLINE_FONT_SIZE = 9;

export function getTranslationChipPlacements(
  blocks: TranslationBlock[],
  captureWidth: number,
  captureHeight: number
): TranslationChipPlacement[] {
  const placed: PlacedRect[] = [];
  const placements: TranslationChipPlacement[] = [];
  const sorted = blocks
    .map((block, index) => ({ block, index }))
    .sort((a, b) => a.block.bbox.y - b.block.bbox.y || a.block.bbox.x - b.block.bbox.x);

  for (const { block, index } of sorted) {
    const inline = getInlinePlacement(block, captureWidth, captureHeight);

    if (inline) {
      placements[index] = { index, ...inline };
      continue;
    }

    const fontSize = getExpandedFontSize(block);
    const layout = getExpandedChipLayout(block, captureWidth, fontSize);
    const height = estimateExpandedChipHeight(block.translatedText, layout.width, block.bbox.height, fontSize);
    const x = layout.x;
    let y = Math.max(0, Math.min(block.bbox.y, Math.max(0, captureHeight - height)));

    for (const rect of placed) {
      if (!hasHorizontalOverlap({ x, width: layout.width }, rect)) {
        continue;
      }

      const collides = y < rect.y + rect.height + CHIP_GAP && y + height + CHIP_GAP > rect.y;
      if (collides) {
        y = rect.y + rect.height + CHIP_GAP;
      }
    }

    placed.push({ x, y, width: layout.width, height });
    placements[index] = {
      index,
      variant: "expanded",
      x,
      y,
      width: layout.width,
      minHeight: Math.max(block.bbox.height, Math.ceil(height)),
      fontSize,
      lineHeight: Math.ceil(fontSize * LINE_HEIGHT),
      maxLines: Number.POSITIVE_INFINITY
    };
  }

  equalizeInlineFontSizes(placements);

  return placements;
}

export function getOverlayContentHeight(placements: TranslationChipPlacement[], captureHeight: number): number {
  return Math.max(
    captureHeight,
    ...placements.map((placement) => Math.ceil(placement.y + placement.minHeight + CHIP_GAP))
  );
}

function getInlinePlacement(
  block: TranslationBlock,
  captureWidth: number,
  captureHeight: number
): Omit<TranslationChipPlacement, "index"> | null {
  const x = clamp(block.bbox.x, 0, Math.max(0, captureWidth - block.bbox.width));
  const y = clamp(block.bbox.y, 0, Math.max(0, captureHeight - block.bbox.height));
  const width = Math.min(block.bbox.width, captureWidth - x);
  const minHeight = Math.min(block.bbox.height, captureHeight - y);
  const inferredFontSize = Math.max(MIN_INLINE_FONT_SIZE, Math.round(minHeight * 0.9));
  const maxFontSize = Math.max(10, Math.min(block.fontHint?.size ?? inferredFontSize, minHeight * 0.98));
  const contentWidth = Math.max(MIN_INLINE_FONT_SIZE, width - INLINE_HORIZONTAL_PADDING);
  const contentHeight = Math.max(MIN_INLINE_FONT_SIZE, minHeight - INLINE_VERTICAL_PADDING);

  for (let fontSize = Math.floor(maxFontSize); fontSize >= MIN_INLINE_FONT_SIZE; fontSize -= 1) {
    const lineHeight = Math.floor(fontSize * INLINE_LINE_HEIGHT);
    const textWidth = estimateTextWidth(block.translatedText, fontSize);

    if (textWidth <= contentWidth && lineHeight <= contentHeight) {
      return {
        variant: "inline",
        x,
        y,
        width,
        minHeight,
        fontSize,
        lineHeight,
        maxLines: 1
      };
    }

    if (textWidth <= contentWidth * 2 && lineHeight * 2 <= contentHeight) {
      return {
        variant: "inline",
        x,
        y,
        width,
        minHeight,
        fontSize,
        lineHeight,
        maxLines: 2
      };
    }
  }

  return null;
}

function getExpandedFontSize(block: TranslationBlock): number {
  return Math.max(12, Math.min(block.fontHint?.size ?? 16, block.bbox.height * 0.55));
}

function equalizeInlineFontSizes(placements: TranslationChipPlacement[]): void {
  const inlinePlacements = placements
    .filter((placement): placement is TranslationChipPlacement => placement?.variant === "inline")
    .sort((a, b) => a.y - b.y || a.x - b.x);
  const groups: TranslationChipPlacement[][] = [];

  for (const placement of inlinePlacements) {
    const group = groups.find((candidate) => belongsToInlineFontGroup(candidate, placement));
    if (group) {
      group.push(placement);
    } else {
      groups.push([placement]);
    }
  }

  for (const group of groups) {
    if (group.length < 2) {
      continue;
    }

    const fontSize = Math.min(...group.map((placement) => placement.fontSize));
    const lineHeight = Math.max(1, Math.floor(fontSize * INLINE_LINE_HEIGHT));

    for (const placement of group) {
      placement.fontSize = fontSize;
      placement.lineHeight = lineHeight;
    }
  }
}

function belongsToInlineFontGroup(group: TranslationChipPlacement[], placement: TranslationChipPlacement): boolean {
  const left = Math.min(...group.map((item) => item.x));
  const right = Math.max(...group.map((item) => item.x + item.width));
  const top = Math.min(...group.map((item) => item.y));
  const bottom = Math.max(...group.map((item) => item.y + item.minHeight));
  const groupWidth = right - left;
  const sameColumn =
    placement.x < right + Math.max(24, groupWidth * 0.2) &&
    placement.x + placement.width > left - Math.max(24, groupWidth * 0.2);
  const closeVertically = placement.y <= bottom + Math.max(20, placement.minHeight * 1.5) && placement.y >= top - 4;

  return sameColumn && closeVertically;
}

function getExpandedChipLayout(
  block: TranslationBlock,
  captureWidth: number,
  fontSize: number
): { x: number; width: number } {
  const textWidth = estimateTextWidth(block.translatedText, fontSize) + HORIZONTAL_PADDING;
  const desiredWidth = Math.max(block.bbox.width, textWidth);
  const maxWidth = Math.max(block.bbox.width, Math.min(captureWidth, Math.round(captureWidth * 0.48)));
  const width = Math.min(desiredWidth, maxWidth);
  const x = Math.min(block.bbox.x, Math.max(0, captureWidth - width));

  return { x, width };
}

function estimateExpandedChipHeight(text: string, width: number, minHeight: number, fontSize: number): number {
  const contentWidth = Math.max(fontSize, width - HORIZONTAL_PADDING);
  const lines = Math.max(1, Math.ceil(estimateTextWidth(text, fontSize) / contentWidth));
  return Math.max(minHeight, lines * fontSize * LINE_HEIGHT + VERTICAL_PADDING);
}

function estimateTextWidth(text: string, fontSize: number): number {
  let width = 0;

  for (const char of text) {
    if (/\s/.test(char)) {
      width += fontSize * 0.35;
    } else if (/[\u3400-\u9fff\uf900-\ufaff]/.test(char)) {
      width += fontSize;
    } else {
      width += fontSize * 0.58;
    }
  }

  return Math.ceil(width);
}

function hasHorizontalOverlap(a: { x: number; width: number }, b: { x: number; width: number }): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}
