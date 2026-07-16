import { describe, expect, it } from "vitest";
import { dedupeOnboarding, ensureOnboarding, hasOnboarding } from "./onboarding";

describe("onboarding", () => {
  it("detects existing guide marker", () => {
    expect(hasOnboarding("- [ ] 说明 ^guide")).toBe(true);
    expect(hasOnboarding("- [ ] 普通任务 ^abcd")).toBe(false);
  });

  it("detects guide by title even without ^guide line", () => {
    expect(hasOnboarding("# TextFlow 上手必读\n\n## 快捷键\n")).toBe(true);
    expect(ensureOnboarding("# TextFlow 上手必读\n\n正文\n")).toBeNull();
  });

  it("does not prepend guide into non-empty user files", () => {
    expect(ensureOnboarding("# 我的待办\n\n- [ ] 买菜\n")).toBeNull();
  });

  it("returns null when guide already present", () => {
    const md = "# 待办\n\n- [ ] 📋 上手必读 ^guide\n";
    expect(ensureOnboarding(md)).toBeNull();
  });

  it("inserts guide into empty file only", () => {
    const next = ensureOnboarding("");
    expect(next).toContain("^g008");
    expect(next).toMatch(/^# TextFlow 上手必读/);
  });

  it("dedupes repeated onboarding blocks on load", () => {
    const polluted = `# TextFlow 上手必读

- [ ] 📋 上手必读 ^guide

---

# TextFlow 上手必读

重复块

---

# TextFlow 上手必读

又重复

---

# 我的笔记

正文

- [ ] 买菜 ^a1
`;
    const next = dedupeOnboarding(polluted);
    expect((next.match(/^#\s*TextFlow\s*上手必读/gm) ?? []).length).toBe(1);
    expect(next).toContain("^guide");
    expect(next).toContain("# 我的笔记");
    expect(next).toContain("- [ ] 买菜 ^a1");
    expect(next).not.toContain("重复块");
  });
});
