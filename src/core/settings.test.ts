import { describe, expect, it } from "vitest";
import { normalizeChatCompletionsUrl, resolveEndpoint } from "./settings";

describe("normalizeChatCompletionsUrl", () => {
  it("不追加 /chat/completions，只 trim 并去掉末尾斜杠", () => {
    expect(normalizeChatCompletionsUrl("https://api.openai.com/v1")).toBe(
      "https://api.openai.com/v1",
    );
    expect(normalizeChatCompletionsUrl("https://api.openai.com/v1/")).toBe(
      "https://api.openai.com/v1",
    );
    expect(normalizeChatCompletionsUrl("https://api.deepseek.com")).toBe(
      "https://api.deepseek.com",
    );
  });

  it("保留已完整的 chat/completions", () => {
    expect(
      normalizeChatCompletionsUrl("https://api.deepseek.com/chat/completions"),
    ).toBe("https://api.deepseek.com/chat/completions");
  });

  it("无协议时只补 https://，不改路径", () => {
    expect(normalizeChatCompletionsUrl("api.deepseek.com/v1")).toBe(
      "https://api.deepseek.com/v1",
    );
  });

  it("自定义路径原样保留", () => {
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
    expect(ep.model).toBe("deepseek-chat");
  });
});
