import { describe, expect, it } from "vitest";
import { ensureOnboarding, hasOnboarding } from "./onboarding";

describe("onboarding", () => {
  it("detects existing guide marker", () => {
    expect(hasOnboarding("- [ ] 说明 ^guide")).toBe(true);
    expect(hasOnboarding("- [ ] 普通任务 ^abcd")).toBe(false);
  });

  it("prepends guide block to non-empty file", () => {
    const next = ensureOnboarding("# 我的待办\n\n- [ ] 买菜\n");
    expect(next).not.toBeNull();
    expect(next!).toMatch(/^# TextFlow 上手必读/);
    expect(next!).toContain("^guide");
    expect(next!).toContain("---\n\n# 我的待办");
    expect(next!).toContain("- [ ] 买菜");
  });

  it("returns null when guide already present", () => {
    const md = "# 待办\n\n- [ ] 📋 上手必读 ^guide\n";
    expect(ensureOnboarding(md)).toBeNull();
  });

  it("inserts guide into empty file", () => {
    const next = ensureOnboarding("");
    expect(next).toContain("^g008");
    expect(next).not.toMatch(/\n---\n\n# 我的/);
  });
});
