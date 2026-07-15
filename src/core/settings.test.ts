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

  it("补全无协议且写到 /v1 的地址", () => {
    expect(normalizeChatCompletionsUrl("api.deepseek.com/v1")).toBe(
      "https://api.deepseek.com/v1/chat/completions",
    );
  });

  it("仅域名时补 /chat/completions", () => {
    expect(normalizeChatCompletionsUrl("https://api.deepseek.com")).toBe(
      "https://api.deepseek.com/chat/completions",
    );
  });

  it("不改写非 completions 的自定义路径", () => {
    expect(
      normalizeChatCompletionsUrl("https://proxy.example.com/openai/v1/chat"),
    ).toBe("https://proxy.example.com/openai/v1/chat");
    expect(
      normalizeChatCompletionsUrl("https://proxy.example.com/v1/messages"),
    ).toBe("https://proxy.example.com/v1/messages");
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
