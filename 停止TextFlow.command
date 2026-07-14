#!/bin/zsh -l
# 与桌面同名脚本，便于从项目目录停止调试

echo "▶ 正在停止 TextFlow…"
pkill -f "target/debug/textflow" 2>/dev/null || true
pkill -f "textflow-app.*tauri dev" 2>/dev/null || true
pkill -f "vite.*1420" 2>/dev/null || true
echo "✅ 已尝试停止"
read "?按回车键关闭此窗口"
