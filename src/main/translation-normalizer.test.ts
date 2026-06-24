import { describe, expect, it } from "vitest";
import { normalizeTranslationForCapture } from "./translation-normalizer";

describe("translation normalizer", () => {
  it("clamps model boxes to the capture bounds", () => {
    const result = normalizeTranslationForCapture(
      {
        sourceLanguage: "en",
        targetLanguage: "zh-CN",
        blocks: [
          {
            sourceText: "Hello",
            translatedText: "你好",
            bbox: { x: -10, y: 5, width: 200, height: 30 },
            confidence: 1.2
          }
        ]
      },
      {
        imageDataUrl: "data:image/png;base64,",
        selection: { x: 0, y: 0, width: 100, height: 80 }
      }
    );

    expect(result.blocks[0].bbox).toEqual({ x: 0, y: 5, width: 100, height: 30 });
    expect(result.blocks[0].confidence).toBe(1);
  });

  it("rejects results without usable blocks", () => {
    expect(() =>
      normalizeTranslationForCapture(
        {
          sourceLanguage: "en",
          targetLanguage: "zh-CN",
          blocks: [
            {
              sourceText: "Outside",
              translatedText: "外部",
              bbox: { x: 200, y: 200, width: 10, height: 10 },
              confidence: 0.8
            }
          ]
        },
        {
          imageDataUrl: "data:image/png;base64,",
          selection: { x: 0, y: 0, width: 100, height: 80 }
        }
      )
    ).toThrow();
  });
});
