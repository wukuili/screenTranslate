import { afterEach, describe, expect, it, type MockInstance, vi } from "vitest";
import type { AppSettings } from "../shared/types";
import { toDeeplxLanguageCode, translateTextsWithDeeplx } from "./deeplx-translate";

describe("DeepLX translation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("posts text to a self-hosted DeepLX endpoint and reads the data field", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ code: 200, data: "你好" }), {
        status: 200
      })
    );

    await expect(translateTextsWithDeeplx(settings(), "secret-token", ["Hello"])).resolves.toEqual(["你好"]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:1188/translate");
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({
      Authorization: "Bearer secret-token"
    });
    expect(requestBody(fetchMock, 0)).toMatchObject({
      text: "Hello",
      source_lang: "auto",
      target_lang: "ZH"
    });
  });

  it("maps common target language names to DeepLX language codes", () => {
    expect(toDeeplxLanguageCode("中文")).toBe("ZH");
    expect(toDeeplxLanguageCode("English")).toBe("EN");
    expect(toDeeplxLanguageCode("ja")).toBe("JA");
  });
});

function requestBody(fetchMock: MockInstance<typeof fetch>, callIndex: number) {
  const init = fetchMock.mock.calls[callIndex][1] as RequestInit;
  return JSON.parse(String(init.body));
}

function settings(): AppSettings {
  return {
    interfaceLanguage: "zh-CN",
    translationProvider: "deeplx",
    ocrProvider: "windows",
    paddleOcrApiUrl: "http://127.0.0.1:8866",
    baseUrl: "http://127.0.0.1:1234/v1",
    model: "local-model",
    baiduAppId: "",
    deeplxApiUrl: "http://127.0.0.1:1188",
    targetLanguage: "中文",
    shortcut: "CommandOrControl+Alt+T",
    requestTimeoutMs: 10000,
    saveHistory: false,
    maxHistoryItems: 20,
    autoCopy: false
  };
}
