import { describe, expect, it } from "vitest";
import { chunkArray, mapConcurrent } from "./concurrency";

describe("concurrency helpers", () => {
  it("maps concurrently while preserving result order", async () => {
    let active = 0;
    let maxActive = 0;

    const results = await mapConcurrent([30, 10, 20, 5], 2, async (delay, index) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, delay));
      active -= 1;
      return index;
    });

    expect(maxActive).toBe(2);
    expect(results).toEqual([0, 1, 2, 3]);
  });

  it("chunks arrays by the requested size", () => {
    expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});
