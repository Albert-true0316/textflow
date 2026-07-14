import { describe, expect, it } from "vitest";
import { formatAiHttpError, sanitizeApiKey } from "./apiKey";

describe("sanitizeApiKey", () => {
  it("去掉 Bearer 前缀与空白", () => {
    expect(sanitizeApiKey("  Bearer sk-abc  ")).toBe("sk-abc");
  });

  it("去掉引号", () => {
    expect(sanitizeApiKey('"sk-test"')).toBe("sk-test");
  });
});

describe("formatAiHttpError", () => {
  it("503 model_not_found 给出模型配置提示", () => {
    const msg = formatAiHttpError(
      503,
      '{"error":{"code":"model_not_found","message":"No available channel for model Claude"}}',
      "自定义",
      "https://proxy.example.com/v1/chat/completions",
      "Claude",
    );
    expect(msg).toContain("模型不可用");
    expect(msg).toContain("Claude");
    expect(msg).toContain("中转站");
  });
});
