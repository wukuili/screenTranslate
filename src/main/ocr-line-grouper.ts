import type { CaptureSelection } from "../shared/types";
import type { OcrLine } from "./ocr";

export interface OcrLineGroup {
  text: string;
  lines: OcrLine[];
  bbox: CaptureSelection;
}

const SENTENCE_END_PATTERN = /[.!?。！？;；:：]$/;

export function groupOcrLinesBySentence(lines: OcrLine[]): OcrLineGroup[] {
  const groups: OcrLineGroup[] = [];
  let current: OcrLine[] = [];
  let currentText = "";

  for (const line of lines) {
    const text = normalizeOcrText(line.text);
    if (!text) {
      continue;
    }

    const normalizedLine = { ...line, text };
    if (current.length > 0 && startsNewVisualGroup(current[current.length - 1], normalizedLine)) {
      groups.push(createGroup(current, currentText));
      current = [];
      currentText = "";
    }

    current.push(normalizedLine);
    currentText = joinOcrText(currentText, text);

    if (SENTENCE_END_PATTERN.test(text)) {
      groups.push(createGroup(current, currentText));
      current = [];
      currentText = "";
    }
  }

  if (current.length > 0) {
    groups.push(createGroup(current, currentText));
  }

  return groups;
}

function normalizeOcrText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function joinOcrText(previous: string, next: string): string {
  if (!previous) {
    return next;
  }

  return shouldJoinWithoutSpace(previous, next) ? `${previous}${next}` : `${previous} ${next}`;
}

function shouldJoinWithoutSpace(previous: string, next: string): boolean {
  return previous.endsWith("-") || isCjk(previous.at(-1) ?? "") || isCjk(next.at(0) ?? "");
}

function isCjk(char: string): boolean {
  return /[\u3400-\u9fff\uf900-\ufaff]/.test(char);
}

function startsNewVisualGroup(previous: OcrLine, next: OcrLine): boolean {
  const verticalGap = next.bbox.y - (previous.bbox.y + previous.bbox.height);
  const largeVerticalGap = verticalGap > Math.max(8, Math.min(previous.bbox.height, next.bbox.height) * 0.75);
  const overlap = horizontalOverlapRatio(previous.bbox, next.bbox);
  const xDelta = Math.abs(previous.bbox.x - next.bbox.x);
  const separateColumn = overlap < 0.15 && xDelta > Math.max(previous.bbox.height, next.bbox.height);
  const fontSizeChanged =
    Math.max(previous.bbox.height, next.bbox.height) / Math.max(1, Math.min(previous.bbox.height, next.bbox.height)) >
    1.35;

  return largeVerticalGap || separateColumn || fontSizeChanged;
}

function horizontalOverlapRatio(a: CaptureSelection, b: CaptureSelection): number {
  const left = Math.max(a.x, b.x);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const overlap = Math.max(0, right - left);
  return overlap / Math.max(1, Math.min(a.width, b.width));
}

function createGroup(lines: OcrLine[], text: string): OcrLineGroup {
  const left = Math.min(...lines.map((line) => line.bbox.x));
  const top = Math.min(...lines.map((line) => line.bbox.y));
  const right = Math.max(...lines.map((line) => line.bbox.x + line.bbox.width));
  const bottom = Math.max(...lines.map((line) => line.bbox.y + line.bbox.height));

  return {
    text,
    lines,
    bbox: {
      x: left,
      y: top,
      width: right - left,
      height: bottom - top
    }
  };
}
