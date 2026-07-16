/** 上手引导块：绑定缺少 ^guide 的 .md 时自动插入 */

export const ONBOARDING_GUIDE_ID = "guide";

const ONBOARDING_BLOCK = `# TextFlow 上手必读

请先逐项打勾下方任务，表示已知晓操作方式。

## 快捷键（任务行获得焦点时）

先用 **Tab** 在任务间移动焦点，或 **点击任务文字** 直接编辑。

| 按键 | 作用 |
|------|------|
| **Enter** | 编辑名称 |
| **Tab** | 在此下新增一步（类似 Word 列表缩进） |
| **⌘ / Ctrl + Enter** | 勾选 / 取消完成 |
| **⌘ / Ctrl + Shift + D** | AI 拆解 |
| **Backspace / Delete** | 删除该任务 |

编辑名称时：**Enter** 保存，**Tab** 保存并在此下新增一步，**Esc** 取消。

底部输入框：**Enter** 添加顶层任务（有 API Key 时默认识别自然语言）。

---

- [ ] 📋 上手必读：请逐项打勾，表示已知晓 ^guide
    - [ ] Tab 在任务间移动焦点；点击任务文字可直接编辑 ^g001
    - [ ] Enter：编辑任务名称 ^g002
    - [ ] Tab（未在编辑时）：在此任务下新增一步 ^g003
    - [ ] ⌘ / Ctrl + Enter：勾选或取消完成 ^g004
    - [ ] ⌘ / Ctrl + Shift + D：AI 拆解 ^g005
    - [ ] Backspace / Delete：删除该任务 ^g006
    - [ ] 编辑时 Enter 保存，Tab 保存并新增子步，Esc 取消 ^g007
    - [ ] 底部输入框 Enter 添加顶层任务（有 API Key 时为自然语言）^g008`;

const ONBOARDING_TITLE_RE = /^#\s*TextFlow\s*上手必读/m;

/** 文件是否已包含上手引导（以 ^guide 或标题为标记） */
export function hasOnboarding(source: string): boolean {
  // 历史版本里可能只有标题/表格，用户也可能手动删掉 ^guide 那一行；
  // 只要出现过引导标题就视为已有，避免每次打开都重复插入。
  return /\^guide\b/u.test(source) || ONBOARDING_TITLE_RE.test(source);
}

/**
 * 清理多次误插入的「上手必读」块，只保留一份标准引导 + 非引导正文。
 * 不依赖「# TextFlow 待办」标题（用户文件标题各异）。
 */
export function dedupeOnboarding(source: string): string {
  const headers = [...source.matchAll(/^#\s*TextFlow\s*上手必读/gm)];
  if (headers.length <= 1) return source;

  const firstIdx = headers[0].index ?? 0;
  const before = source.slice(0, firstIdx).trim();
  const fromFirst = source.slice(firstIdx);

  // 第一份引导之后，找下一个「不是上手必读」的一级标题，当作正文起点
  const otherH1 = /\n(# (?!TextFlow\s*上手必读)[^\n]*[\s\S]*)/.exec(fromFirst);
  let tail = otherH1 ? otherH1[1].trimStart() : "";

  if (!tail) {
    // 没有其它标题：尝试取最后一份引导块末尾 --- 之后的内容
    const lastIdx = headers[headers.length - 1].index ?? 0;
    const lastChunk = source.slice(lastIdx);
    const sep = lastChunk.lastIndexOf("\n---\n");
    if (sep >= 0) {
      const after = lastChunk.slice(sep + 5).trim();
      if (after && !ONBOARDING_TITLE_RE.test(after)) tail = after;
    }
  }

  const body = [before, tail].filter(Boolean).join("\n\n").trim();
  if (!body) return `${ONBOARDING_BLOCK}\n`;
  return `${ONBOARDING_BLOCK}\n\n---\n\n${body}\n`;
}

/**
 * 仅对「空文件」自动插入上手必读。
 * 已有内容的用户笔记绝不擅自插入（避免污染他人 Markdown）。
 * 返回 null 表示无需改动。
 */
export function ensureOnboarding(source: string): string | null {
  if (hasOnboarding(source)) return null;
  if (!source.trim()) return `${ONBOARDING_BLOCK}\n`;
  return null;
}
