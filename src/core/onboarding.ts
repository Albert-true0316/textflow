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

/** 文件是否已包含上手引导（以 ^guide 为标记） */
export function hasOnboarding(source: string): boolean {
  return /\^guide\b/u.test(source);
}

/**
 * 缺少引导时，在文件开头插入上手必读块。
 * 返回 null 表示无需改动。
 */
export function ensureOnboarding(source: string): string | null {
  if (hasOnboarding(source)) return null;

  const body = source.trim();
  if (!body) return `${ONBOARDING_BLOCK}\n`;
  return `${ONBOARDING_BLOCK}\n\n---\n\n${body}\n`;
}
