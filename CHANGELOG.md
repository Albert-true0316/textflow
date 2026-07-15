# Changelog

## [v0.2.0](https://github.com/Albert-true0316/textflow/releases/tag/v0.2.0) — 2026-07-15

相对 [v0.1.0](https://github.com/Albert-true0316/textflow/releases/tag/v0.1.0) 的主要更新。

### 新增

- **日程视图**：按「今天 / 明天 / 已过期 / 未设日期」汇总；或切换「本周」，用日期条筛选某一天
- **分类视图**：按 `#生活`、`#工作` 等标签纵向分区；顶上 chip 可只看一类；无标签进入「未分类」
- **贴边球体**：窗口拖到屏幕边缘可收成球，点一下在旁边展开

### 改进

- 顶栏视图切换改为 **列表 | 日程 | 分类**
- 过期任务高亮，并显示过期天数；截止日期提到任务行上更显眼
- AI 自然语言更强调识别并写入 `due`（含「明天 / 本周五 / 7月18日」等）
- 拆解子任务：父任务有截止日期时，子任务 `due` 不会晚于父任务；尽量给子任务排期
- 默认倾向 **深夜** 主题（设置里仍可改为浅色 / 跟随系统）
- 设置面板布局与滚动区域微调

### 安装包

- macOS：`TextFlow_*.dmg`（未签名：首次打开请右键 → 打开）
- Windows：`TextFlow_*_x64-setup.exe`（需 Windows 10+，首次可能拉取 WebView2）

推送 `v*` tag 后，GitHub Actions 会自动构建并上传到本 Release。

---

## [v0.1.0](https://github.com/Albert-true0316/textflow/releases/tag/v0.1.0) — 2026-07-14

首个公开发布。

- 本地 Markdown 待办 + AI 自然语言增改 / 预览确认 / 拆解
- 多 Provider（DeepSeek / OpenAI / 通义 / Kimi / 智谱 / SiliconFlow / 自定义）
- Win / Mac 同一套 Tauri 代码；GitHub Actions 出 Windows / macOS 安装包
