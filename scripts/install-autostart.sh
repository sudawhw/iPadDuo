#!/bin/bash
# 安装为登录后自动运行的后台服务（LaunchAgent），崩溃会自动重启。
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)"
NODE="$(command -v node)"
LABEL="com.ipadduo.server"
LEGACY="com.touchdeck.server" # 旧名称（Touch Deck），安装 / 卸载时一并清理
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
PORT="${PORT:-8780}"

if [ -z "$NODE" ]; then echo "未找到 node，请先安装 Node.js 18+"; exit 1; fi
mkdir -p "$HOME/Library/LaunchAgents" "$DIR/data"

cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array><string>$NODE</string><string>$DIR/server.js</string></array>
  <key>WorkingDirectory</key><string>$DIR</string>
  <key>EnvironmentVariables</key>
  <dict><key>PORT</key><string>$PORT</string><key>PATH</key><string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$DIR/data/server.log</string>
  <key>StandardErrorPath</key><string>$DIR/data/server.log</string>
</dict>
</plist>
PL

launchctl bootout "gui/$(id -u)/$LEGACY" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/$LEGACY.plist"
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
sleep 1
IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo '<Mac的IP>')"
echo "✅ 已安装自启动服务"
echo "   iPad Safari 打开： http://$IP:$PORT"
echo "   日志： $DIR/data/server.log"
echo ""
echo "⚠️  若要使用媒体键 / 快捷键磁贴，请在「系统设置 → 隐私与安全性 → 辅助功能」中添加："
echo "   $NODE"
echo "   （按 ⌘⇧G 输入上面的路径），然后运行： launchctl kickstart -k gui/$(id -u)/$LABEL"
