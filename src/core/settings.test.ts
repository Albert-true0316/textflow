import { describe, expect, it } from "vitest";
import { normalizeChatCompletionsUrl, resolveEndpoint } from "./settings";

describe("normalizeChatCompletionsUrl", () => {
  it("补全只写到 /v1 的地址", () => {
    expect(normalizeChatCompletionsUrl("https://api.openai.com/v1")).toBe(
      "https://api.openai.com/v1/chat/completions",
    );
  });

  it("保留已完整的 chat/completions", () => {
    expect(
      normalizeChatCompletionsUrl("https://api.deepseek.com/chat/completions"),
    ).toBe("https://api.deepseek.com/chat/completions");
  });

  it("去掉末尾斜杠再补全", () => {
    expect(normalizeChatCompletionsUrl("https://api.openai.com/v1/")).toBe(
      "https://api.openai.com/v1/chat/completions",
    );
  });

  it("补全无协议的地址", () => {
    expect(normalizeChatCompletionsUrl("api.deepseek.com/v1")).toBe(
      "https://api.deepseek.com/v1/chat/completions",
    );
  });
});

describe("resolveEndpoint", () => {
  it("非自定义 Provider 忽略残留的 customBaseUrl", () => {
    const ep = resolveEndpoint({
      providerId: "deepseek",
      customBaseUrl: "https://api.openai.com/v1",
      model: "",
      previewEnabled: true,
      decomposeCount: 4,
    });
    expect(ep.url).toBe("https://api.deepseek.com/chat/completions");
  });
});
