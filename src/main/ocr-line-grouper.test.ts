import { describe, expect, it } from "vitest";
import type { OcrLine } from "./ocr";
import { groupOcrLinesBySentence } from "./ocr-line-grouper";

describe("OCR line grouper", () => {
  it("removes line breaks and groups wrapped text until sentence punctuation", () => {
    const groups = groupOcrLinesBySentence([
      line("A mobile, harassing mid-", 10, 10, 120, 18),
      line("ranged hunter.", 12, 30, 90, 18),
      line("Skills Earned:", 10, 54, 100, 18),
      line("Scourging Blow", 40, 80, 120, 18)
    ]);

    expect(groups.map((group) => group.text)).toEqual([
      "A mobile, harassing mid-ranged hunter.",
      "Skills Earned:",
      "Scourging Blow"
    ]);
    expect(groups[0].bbox).toEqual({ x: 10, y: 10, width: 120, height: 38 });
  });

  it("joins CJK wrapped lines without inserting extra spaces", () => {
    const groups = groupOcrLinesBySentence([
      line("猎人属于中档", 0, 0, 80, 18),
      line("移动职业。", 0, 20, 80, 18)
    ]);

    expect(groups[0].text).toBe("猎人属于中档移动职业。");
  });

  it("does not merge visually separate labels just because punctuation is missing", () => {
    const groups = groupOcrLinesBySentence([
      line("猎人", 80, 0, 40, 18),
      line("猎人属于中档", 10, 36, 90, 18),
      line("移动职业。", 10, 56, 90, 18)
    ]);

    expect(groups.map((group) => group.text)).toEqual(["猎人", "猎人属于中档移动职业。"]);
  });

  it("does not merge adjacent lines when their detected font sizes are very different", () => {
    const groups = groupOcrLinesBySentence([
      line("[9] Bundle for Bywater", 8, 6, 220, 26),
      line("Shire", 8, 44, 48, 13),
      line("Collect the satchel from Postman Boffin's table", 8, 70, 320, 14),
      line("Avoid nosey hobbits", 8, 88, 180, 14)
    ]);

    expect(groups.map((group) => group.text)).toEqual([
      "[9] Bundle for Bywater",
      "Shire",
      "Collect the satchel from Postman Boffin's table Avoid nosey hobbits"
    ]);
  });
});

function line(text: string, x: number, y: number, width: number, height: number): OcrLine {
  return {
    text,
    bbox: { x, y, width, height }
  };
}
