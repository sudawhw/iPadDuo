#!/bin/bash
LABEL="com.ipadduo.server"
LEGACY="com.touchdeck.server" # 旧名称（Touch Deck），安装 / 卸载时一并清理
launchctl bootout "gui/$(id -u)/$LEGACY" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/$LEGACY.plist"
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/$LABEL.plist"
echo "已移除自启动服务"
