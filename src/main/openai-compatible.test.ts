import { afterEach, describe, expect, it, type MockInstance, vi } from "vitest";
import type { AppSettings } from "../shared/types";
import { translateTexts } from "./openai-compatible";

describe("OpenAI-compatible translation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("falls back to text response format when the provider rejects json_schema/json_object formats", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "'response_format.type' must be 'json_schema' or 'text'" }), {
          status: 400,
          statusText: "Bad Request"
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: "{\"translations\":[\"你好\"]}"
                }
              }
            ]
          }),
          { status: 200 }
        )
      );

    await expect(translateTexts(settings(), "test-key", ["Hello"])).resolves.toEqual(["你好"]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(requestBody(fetchMock, 0).response_format.type).toBe("json_schema");
    expect(requestBody(fetchMock, 1).response_format.type).toBe("text");
  });
});

function requestBody(fetchMock: MockInstance<typeof fetch>, callIndex: number) {
  const init = fetchMock.mock.calls[callIndex][1] as RequestInit;
  return JSON.parse(String(init.body));
}

function settings(): AppSettings {
  return {
    interfaceLanguage: "zh-CN",
    translationProvider: "openai",
    ocrProvider: "windows",
    paddleOcrApiUrl: "http://127.0.0.1:8866",
    baseUrl: "http://127.0.0.1:1234/v1",
    model: "local-model",
    baiduAppId: "",
    deeplxApiUrl: "http://127.0.0.1:1188/translate",
    targetLanguage: "zh-CN",
    shortcut: "CommandOrControl+Alt+T",
    requestTimeoutMs: 10000,
    saveHistory: false,
    maxHistoryItems: 20,
    autoCopy: false
  };
}
