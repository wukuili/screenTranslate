import { describe, expect, it } from "vitest";
import { extractJsonObject, parseTranslationResult } from "./translation-schema";

describe("translation schema", () => {
  it("parses valid translation output", () => {
    const result = parseTranslationResult({
      sourceLanguage: "en",
      targetLanguage: "zh-CN",
      blocks: [
        {
          sourceText: "Hello",
          translatedText: "你好",
          bbox: { x: 10, y: 20, width: 120, height: 36 },
          confidence: 0.9
        }
      ]
    });

    expect(result.blocks[0].translatedText).toBe("你好");
  });

  it("extracts a fenced JSON object from model text", () => {
    const raw = "```json\n{\"sourceLanguage\":\"en\",\"targetLanguage\":\"zh-CN\",\"blocks\":[]}\n```";

    expect(extractJsonObject(raw)).toEqual({
      sourceLanguage: "en",
      targetLanguage: "zh-CN",
      blocks: []
    });
  });

  it("rejects invalid bounding boxes", () => {
    expect(() =>
      parseTranslationResult({
        sourceLanguage: "en",
        targetLanguage: "zh-CN",
        blocks: [
          {
            sourceText: "Hello",
            translatedText: "你好",
            bbox: { x: 10, y: 20, width: 0, height: 36 },
            confidence: 0.9
          }
        ]
      })
    ).toThrow();
  });
});
