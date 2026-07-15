# TextFlow

本地优先的 AI 自然语言 Todo 悬浮挂件（Tauri v2 + Vue 3）。

## 开发

```bash
cd textflow-app
npm install
npm run tauri dev
```

## 试用

1. 打开一份 `.md`（可用 `examples/todos.md`）
2. 右上角 **☰ 菜单 → 设置**：选 Provider、填 API Key、调拆解条数（默认 4）
3. 底部随便说：`买菜搞定了，加个周五交报告`
4. 悬停任务点 **拆** → 按设置条数拆成若干步骤

## 打包

### Mac（本机，可直接出安装包）

```bash
npm run build:app
```

产物：
- `src-tauri/target/release/bundle/dmg/*.dmg`（推荐发给别人）
- `src-tauri/target/release/bundle/macos/TextFlow.app`

也可在 GitHub Actions 跑 **Release macOS**，从 Artifacts 下载 DMG。

> 未签名的 Mac 包：打开时若被拦截，右键 App → 打开，或到「系统设置 → 隐私与安全性」允许。

### Windows 安装包（`.exe`）

**无法在 Mac 本机直接打出 Windows exe**，请用 GitHub Actions：

1. 把本仓库推到 GitHub
2. 打开 **Actions → Release Windows → Run workflow**
3. 跑完后在该次运行的 **Artifacts** 下载 `TextFlow-Windows-Setup`
4. 或打 tag 自动发 Release：

```bash
git tag v0.2.0
git push origin v0.2.0
```

产物为 NSIS 安装包，例如：`TextFlow_0.2.0_x64-setup.exe`  
（需 Windows 10+，首次运行会拉取 WebView2 运行时）

若手里有 Windows 电脑，也可直接：

```bash
npm install
npm run build:win
```

## 当前能力

- Win / Mac 同一套代码（Tauri）；窗口标题栏已按平台分支
- 多 Provider（DeepSeek / OpenAI / 通义 / Kimi / 智谱 / SiliconFlow / 自定义）
- 本地 Markdown + 自然语言 + 预览确认 + 拆解
- 列表 / 日程 / 分类三视图；贴边收成球体；过期高亮与 AI 排期增强
