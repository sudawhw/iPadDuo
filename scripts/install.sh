#!/bin/bash
# iPadDuo 一键安装（macOS）
#
#   在线安装： curl -fsSL https://raw.githubusercontent.com/sudawhw/iPadDuo/main/scripts/install.sh | bash
#   本地安装： ./scripts/install.sh            （在已下载 / 克隆的仓库里运行）
#
# 会做的事：检查 / 安装 Node.js 与 Xcode 命令行工具 → 安装可选的 WebRTC 组件 → 注册登录自启动服务 → 打开设置向导（显示 iPad 扫码地址）。
set -e

REPO="${IPADDUO_REPO:-https://github.com/sudawhw/iPadDuo}"
DEST="${IPADDUO_DIR:-$HOME/iPadDuo}"
PORT="${PORT:-8780}"

[ "$(uname)" = "Darwin" ] || { echo "iPadDuo 的 Mac 端只支持 macOS"; exit 1; }

# 1. 源码：脚本在仓库里运行就直接用当前仓库；通过 curl | bash 运行则下载最新代码
SRC=""
if [ -n "${BASH_SOURCE[0]}" ] && [ -f "${BASH_SOURCE[0]}" ]; then
  SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fi
if [ -n "$SRC" ] && [ -f "$SRC/server.js" ]; then
  DEST="$SRC"
else
  echo "→ 下载 iPadDuo 到 $DEST"
  mkdir -p "$DEST"
  curl -fsSL "$REPO/archive/refs/heads/main.tar.gz" | tar xz -C "$DEST" --strip-components 1
fi

# 2. Node.js 18+
need_node=1
if command -v node >/dev/null 2>&1 && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 18 ]; then need_node=0; fi
if [ $need_node = 1 ]; then
  if command -v brew >/dev/null 2>&1; then
    echo "→ 用 Homebrew 安装 Node.js"
    brew install node
  else
    echo "需要 Node.js 18 或更高版本：请从 https://nodejs.org 下载安装包，装好后重新运行本脚本"
    exit 1
  fi
fi

# 3. Xcode 命令行工具（编译媒体键 / 触控板等原生小工具，约 300MB，只需一次）
if ! xcode-select -p >/dev/null 2>&1; then
  echo "→ 需要 Xcode 命令行工具：已打开系统安装窗口，安装完成后请重新运行本脚本"
  xcode-select --install || true
  exit 1
fi

# 4. 可选依赖：WebRTC（node-datachannel，预编译包）。装不上也没关系，副屏会使用 JPEG 兼容模式
echo "→ 安装 WebRTC 组件（可选）"
(cd "$DEST" && npm install --omit=dev --no-audit --no-fund >/dev/null 2>&1) && echo "   已安装" || echo "   跳过：副屏将使用兼容模式"

# 5. 注册登录自启动服务并启动
PORT="$PORT" "$DEST/scripts/install-autostart.sh"

# 6. 等首次编译完成后打开设置向导
echo "→ 正在首次编译原生小工具…"
for i in $(seq 1 30); do
  curl -fs "http://localhost:$PORT/api/setup" 2>/dev/null | grep -q '"helper":true' && break
  sleep 1
done
open "http://localhost:$PORT/setup.html"
echo "✅ 安装完成。已在浏览器打开设置向导，用 iPad 扫码即可。"
