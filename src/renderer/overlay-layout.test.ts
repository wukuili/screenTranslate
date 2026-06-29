import { describe, expect, it } from "vitest";
import type { TranslationBlock } from "../shared/types";
import { getOverlayContentHeight, getTranslationChipPlacements } from "./overlay-layout";

describe("overlay layout", () => {
  it("keeps short translations inside their source boxes", () => {
    const blocks: TranslationBlock[] = [
      block("A", "善良收益", 10, 10, 180, 24),
      block("B", "怜悯", 12, 18, 180, 24),
      block("C", "热情", 320, 18, 120, 24)
    ];

    const placements = getTranslationChipPlacements(blocks, 500, 200);

    expect(placements[0]).toMatchObject({ variant: "inline", x: 10, y: 10, width: 180 });
    expect(placements[0].fontSize).toBe(22);
    expect(placements[1]).toMatchObject({ variant: "inline", x: 12, y: 18, width: 180 });
    expect(placements[2].y).toBe(18);
  });

  it("moves long fallback chips down when they overlap", () => {
    const blocks: TranslationBlock[] = [
      block("A", "This translation is deliberately far too long to fit in the source text cell", 10, 10, 80, 18),
      block("B", "This translation is also deliberately far too long to fit in the source text cell", 12, 18, 80, 18),
      block("C", "短词", 320, 18, 120, 24)
    ];

    const placements = getTranslationChipPlacements(blocks, 500, 200);

    expect(placements[0].variant).toBe("expanded");
    expect(placements[1].variant).toBe("expanded");
    expect(placements[1].y).toBeGreaterThanOrEqual(placements[0].y + placements[0].minHeight);
    expect(placements[2]).toMatchObject({ variant: "inline", y: 18 });
  });

  it("expands the overlay height when dense fallback chips cannot fit in the capture", () => {
    const blocks = Array.from({ length: 12 }, (_, index) =>
      block(`Text ${index}`, `Long translated text ${index} with enough words to overflow the original cell`, 8, 10 + index, 80, 18)
    );
    const placements = getTranslationChipPlacements(blocks, 260, 120);

    expect(getOverlayContentHeight(placements, 120)).toBeGreaterThan(120);
  });

  it("keeps adjacent inline text in the same column at a consistent font size", () => {
    const blocks: TranslationBlock[] = [
      block("Short", "弹幕", 20, 10, 120, 24),
      block("Long", "猎人负责中档，从事交易的移动骚扰者", 22, 36, 170, 42),
      block("Other", "远射", 320, 12, 120, 24)
    ];

    const placements = getTranslationChipPlacements(blocks, 520, 180);

    expect(placements[0].variant).toBe("inline");
    expect(placements[1].variant).toBe("inline");
    expect(placements[2].variant).toBe("inline");
    expect(placements[0].fontSize).toBe(placements[1].fontSize);
    expect(placements[2].fontSize).toBeGreaterThanOrEqual(placements[0].fontSize);
  });
});

function block(
  text: string,
  translatedText: string,
  x: number,
  y: number,
  width: number,
  height: number
): TranslationBlock {
  return {
    sourceText: text,
    translatedText,
    bbox: { x, y, width, height },
    confidence: 0.9
  };
}
