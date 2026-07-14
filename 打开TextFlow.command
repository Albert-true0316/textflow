#!/bin/zsh -l
# 与桌面同名脚本，便于从项目目录直接启动

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR" || exit 1

if ! command -v npm >/dev/null 2>&1; then
  echo "❌ 未找到 npm，请先安装 Node.js"
  read "?按回车键退出"
  exit 1
fi

echo "▶ 正在启动 TextFlow（桌面调试模式）…"
npm run tauri dev
read "?按回车键关闭此窗口"
