# iPadDuo

**把 iPad 变成 Mac 的第二块屏幕和快捷控制台。** 一个局域网网页应用：iPad 用 Safari 打开、添加到主屏幕即可，Mac 端一条命令安装。从 2013 年的 iPad mini 2（iOS 10 / 12）到最新的 iPad Pro 都能用，按设备性能自动调整画质与动效。

> **English** — iPadDuo turns any iPad into a second screen and a touch control deck for your Mac over the local network. No iPad app to install: open it in Safari and add it to the Home Screen. The Mac side is a zero-config Node.js service plus a small Swift helper (ScreenCaptureKit + VideoToolbox). Modern iPads get a hardware-decoded H.264 stream over WebRTC; old iPads (iOS 10–12) fall back to an adaptive JPEG stream. Features: second screen with direct touch and a trackpad toggle, an experimental Sidecar-like extended display, big app/web/folder tiles, per-app control surfaces (browser video remote, music, slides, Claude / ChatGPT panels), now-playing with synced lyrics, multi-source mini player, Finder-style column browser, light/dark themes. MIT licensed.

```
 iPad（Safari 主屏幕 Web App，ES5，iOS 10+）
   │  HTTP：磁贴、控件、文件浏览、播放信息
   │  WebSocket：触控 / 键盘输入、信令、JPEG 兼容画面
   │  WebRTC：H.264 硬件视频（iPadOS 11+）
   ▼
 Mac：server.js（Node.js，零必需依赖）
   ├─ deckctl（Swift，首次启动自动编译）：ScreenCaptureKit 采集 · VideoToolbox 编码 · CGVirtualDisplay 扩展屏
   │                                       辅助功能（菜单 / 按钮 / 输入框）· CGEvent 输入 · 随航 · 取色 · 二维码
   ├─ webrtc.js：libdatachannel（node-datachannel，可选依赖）把 H.264 打包成 RTP 发给 iPad
   └─ open / osascript / shortcuts / qlmanage
```

## 定位

- **Mac mini 的第二块屏幕**：「副屏」实时显示 Mac 上的窗口，手指直接点；需要精确操作时打开浮动的「触控板」开关；还可以让 Mac 新增一块与 iPad 同尺寸的虚拟显示器（扩展屏，实验功能）。
- **桌边的快捷控制台**：大磁贴一键打开应用、网页、文件夹、快捷指令；按前台应用给出整屏大号控件；常驻的播放器和音量。
- **旧设备可用**：iPad mini 2（A7、iOS 10.3 / 12）也能流畅使用，省电档自动关掉昂贵的效果。

## 亮点

| | |
|---|---|
| **副屏（WebRTC 硬件视频）** | Mac 用 VideoToolbox 硬件编码 H.264（Constrained Baseline、无 B 帧、低延迟配置），经 WebRTC 发到 iPad 硬件解码；只传变化部分，静止画面几乎不占带宽；丢包时 NACK 重传、关键帧按需请求。iOS 10 等不支持 WebRTC 的设备自动使用 JPEG 推流（按帧确认的额度机制，不会越积越多）。 |
| **指哪点哪** | 手指按下的瞬间指针就移到手指下（网页的悬停效果、视频控制条提前出现）；每次点击都带着「iPad 实际看到的那一帧」的编号，Mac 按那一帧的窗口位置换算坐标，画面延迟不会导致点偏；惯性滚动中轻点只会「按停」，不会误点。 |
| **触控板是工具，不是页面** | 副屏左下角的「☝︎ 触控板」开关：打开后单指相对移动指针、轻点单击、双指滚动，画面仍然可见。 |
| **扩展屏（实验）** | 类似随航：Mac 新增一块虚拟显示器（与 iPad 屏幕同尺寸、HiDPI），iPad 显示这块屏幕；「⇥ 移来窗口」把 Mac 前台窗口移过来，「⇤ 送回」移回主屏。 |
| **按应用的整屏控件** | 浏览器视频（整宽进度条、大号播放键）、音乐、Keynote / PPT 翻页、Claude / ChatGPT 交互面板、通用快捷键；分屏时按实际可用宽度重新排版。 |
| **多来源播放器** | 左下角迷你播放器可以在「音乐」和各浏览器里正在播放的视频之间切换，带窗口实时缩略图；选中视频后 Dock 的播放 / 上一首 / 下一首直接控制它（±10 秒）。 |
| **网页不重复打开** | 点网页磁贴时，如果浏览器里已经开着这个网站（比如正在播放的视频），直接切到那个标签页。 |
| **分栏文件浏览** | 点文件夹磁贴，在 iPad 上像访达的分栏视图一样逐级展开；选中文件显示 QuickLook 预览，大按钮「在 Mac 上打开 / 在 Finder 中显示」。 |
| **歌词页** | 播放时可进入动态歌词页：模糊封面背景、卡拉 OK 式逐句点亮、翻译；桌面闲置 20 秒才自动进入，不打扰操作。 |
| **深色 / 浅色 / 跟随系统** | 每台设备单独设置。 |

## 设备与功能对照

| iPad | 系统 | 副屏画面 | 默认性能档 |
|---|---|---|---|
| iPad mini 2 / 3、iPad Air（A7 / A8） | iOS 10.3 – 12 | JPEG 推流（iOS 12 起可用 WebRTC） | 省电 |
| iPad mini 4 / 5、iPad 5 – 9、Air 2 / 3、Pro 10.5 / 12.9（一、二代） | iPadOS 12 – 15 | WebRTC 硬件视频，1280px / 30fps | 均衡 |
| iPad mini 6 / 7、iPad 10、Air 4+、Pro 11 / 12.9（三代起） | iPadOS 16+ | WebRTC 硬件视频，最高 1920px / 60fps | 增强 |

- 档位按系统版本和屏幕尺寸推断（网页无法读取精确型号），可在「设置 → 这台设备」手动改。
- iPad mini 2 如果还停在 iOS 10.3，建议升级到它支持的最高版本 **iOS 12.5.7**：WebRTC 需要 Safari 11+（iOS 11 起），升级后副屏会从 JPEG 自动切到硬件视频，流畅度和清晰度都会明显提高。
- 苹果自带的随航需要 iPadOS 13+ 和支持的 Mac / iPad 型号；iPadDuo 的副屏与扩展屏不依赖随航。

## 快速开始

### 一条命令安装

在 Mac 的「终端」里运行：

```bash
curl -fsSL https://raw.githubusercontent.com/sudawhw/iPadDuo/main/scripts/install.sh | bash
```

或者克隆后在仓库目录里运行 `./scripts/install.sh`。脚本会：

1. 检查 Node.js 18+（有 Homebrew 时自动安装）和 Xcode 命令行工具（用于编译 Swift 小工具）
2. 安装可选依赖 `node-datachannel`（WebRTC；装不上时副屏自动使用 JPEG，其它功能不受影响）
3. 注册为登录自启动服务（LaunchAgent `com.ipadduo.server`，崩溃后自动重启）
4. 在 Mac 浏览器里打开**设置向导**：iPad 访问地址的二维码、辅助功能与屏幕录制权限检查

在 iPad 上：相机扫码（或 Safari 输入地址）→「分享」→「添加到主屏幕」→ 以后从主屏幕图标打开。建议插电使用。

### 手动运行

```bash
npm install                      # 可选：安装 WebRTC 依赖
node server.js                   # 前台运行，Ctrl+C 退出（默认端口 8780，PORT=xxxx 可改）
./scripts/install-autostart.sh   # 注册为登录自启动服务
./scripts/uninstall-autostart.sh # 卸载自启动服务
```

设置向导：`http://localhost:8780/setup.html`。

## 使用

### 磁贴

| 类型 | 说明 | 示例 |
|---|---|---|
| 应用 | 应用名、路径或 Bundle ID，可「从 Mac 选择」 | `Google Chrome`、`com.apple.Notes` |
| 网页 | 任意 URL，可指定浏览器；已打开的同一网站直接切过去 | `https://github.com`、`http://localhost:3000` |
| 文件夹 | 在 iPad 上分栏浏览（设置里可改为直接在 Mac 上打开） | `~/Downloads` |
| 文件 | 直接打开，或在访达中显示 | `~/Documents/报告.pdf` |
| 快捷指令 | 运行 macOS「快捷指令」 | 「开会模式」 |
| 系统控制 | 播放 / 暂停、音量、截图、调度中心、显示桌面、深色模式、锁屏、睡眠 | |
| 快捷键 | 发送组合键 | `cmd+shift+4` |
| 脚本 | zsh 或 AppleScript（只能执行已保存的内容） | `open -a Safari && say 好的` |

右上角「编辑」或长按磁贴进入编辑：改类型、目标、名称、颜色（默认取自图标）、尺寸（1×1 / 2×1 / 1×2 / 2×2）、自定义图标；长按拖动排序；「＋ Mac 当前应用」把 Mac 最前面的应用（或浏览器当前网页）一键加成磁贴。一页放不下时会先压缩行高，尽量一屏看全。配置保存在 Mac 的 `data/config.json`。

点开磁贴后自动进入对应控件（可关闭）：音乐应用 → 分屏音乐控件；浏览器 → 标签页与书签；视频网站 → 副屏「观看」视图；信息流（X、微博、知乎……）→「阅读」视图（右侧大按钮：上一条 / 下一条 / 点赞 / 回复）；其它网页 →「浏览」视图。

### 遥控：控制 · 副屏

底栏「遥控 Mac」进入。顶部两个模式：

- **控制**：按 Mac 最前面的应用显示整屏大号控件（浏览器视频遥控、音乐、演示翻页、Claude / ChatGPT 面板、通用快捷键）。从磁贴打开时固定在那个应用上，不随 Mac 前台变化。
- **副屏**：实时显示 Mac 的前台窗口（或扩展屏），直接触控：

| 手势 | 直接触控 | 打开「触控板」开关后 |
|---|---|---|
| 轻点 | 在该位置单击（双击同理） | 在指针处单击 |
| 单指拖动 | 在手指处滚动（带惯性）；放大后平移画面 | 移动指针（带加速） |
| 长按约半秒后拖动 | 拖拽（进度条、选中文字） | 轻点后立刻按住并移动 = 拖拽 |
| 双指 | 捏合放大（最多 4 倍）/ 滑动滚动 / 轻点右键 | 滑动滚动 / 轻点右键 |

底部按键条：esc、tab、方向键、退格、回车、⌨ 键盘（支持中文输入法，上方回显）。右上角显示实际帧率、分辨率、码率和传输方式（硬件视频 / 推流 / 兼容连接）。

**分屏**：「⤡ 分屏」让控件占半屏、磁贴占另一半；控件按实际宽度重排（窄时两列大按钮、封面上移）。

### 播放器与歌词

- 左下角迷你播放器：点按打开歌词页（选中视频来源时打开观看视图），上滑也可以；旁边的「来源」按钮列出所有正在播放的内容（带实时缩略图）。
- 底栏播放键控制谁：选中的视频来源 → 最近从磁贴打开的音乐应用 → 正在播放的应用 → 系统媒体键。
- 播放信息：QQ 音乐（辅助功能读取播放栏）、Apple Music（AppleScript）；「系统级」来源借助系统自带 perl 读取，属于绕开 macOS 15.4 限制的做法，默认关闭、自行决定。
- 歌词依次查询 QQ 音乐、网易云音乐、LRCLIB；可在设置里关闭联网查询。

### 浏览器视频遥控

在 Chrome / Edge / Brave（查看 → 开发者 → 允许 Apple 事件中的 JavaScript）或 Safari（开发菜单）里开启后，进度条显示真实时间、可精确跳转和调倍速，多来源播放器也能识别各浏览器里的视频。iPadDuo 只会执行仓库里写死的几段查询 / 控制脚本，iPad 不能传入任意 JavaScript。没开启时自动退回按键方式。

## 性能与自适应

| 档位 | 副屏 | 界面 |
|---|---|---|
| 省电 | WebRTC 1024px / 24fps 或 JPEG 1024px / 8fps（必要时降到 640px / 6fps） | 无毛玻璃、无持续动画，弹层只淡入，歌词整行高亮 |
| 均衡 | WebRTC 1280px / 30fps | 保留短过渡 |
| 增强 | WebRTC 最高 1920px / 60fps | 毛玻璃、位移缩放入场、背景漂移 |

- 画面请求宽度按实际显示区域与像素比计算；JPEG 路线按解码耗时、帧间隔与网络往返自动升降档。
- 触摸期间持续掉帧时，界面效果独立降一档；系统「减少动态效果」始终生效。
- 所有动画只用 transform / opacity；触摸立即响应，没有 300ms 延迟；前端为 ES5，无需编译。

## 权限

| 功能 | 权限（系统设置 → 隐私与安全性） |
|---|---|
| 打开应用 / 网页 / 快捷指令、音量 | 无 |
| 播放控制、快捷键、触控、AI 面板、QQ 音乐播放信息、扩展屏移动窗口 | **辅助功能**：允许运行服务的 `node`（前台运行时是「终端」） |
| 副屏画面、截图、播放器缩略图 | **屏幕录制**：允许 `node` |
| 浏览「文稿」「下载」「iCloud 云盘」等文件夹 | **文件与文件夹**：首次浏览时 Mac 会弹出「node 想访问……」，点「允许」 |
| 浏览器视频遥控、标签页 | **自动化**：首次使用时允许 node 控制对应浏览器 |

设置向导会检查并引导授权；没有授权的功能会给出明确提示，其它功能照常使用。

## 安全

- 只接受局域网 / 本机地址的请求；只接受 IP、`localhost`、`.local` 主机名（防 DNS rebinding）。
- 写入与执行类接口要求自定义请求头并校验 Origin（防 CSRF）；WebSocket 做同样的校验。
- 可设访问 PIN；画面与缩略图接口要求自定义请求头，只在有 iPad 观看时才采集。
- 文件浏览只允许家目录和已添加为磁贴的文件夹，不列出隐藏文件和 `~/Library`，替身指向外部也会被拒绝。
- 诊断接口与设置向导的操作只接受本机请求；脚本磁贴只能执行已保存在配置里的内容。
- 按键类操作发送前会再次确认目标应用在前台，否则拒绝执行。

## 常见问题

- **副屏显示「兼容模式」**：设备不支持 WebRTC（iOS 10），或 `node-datachannel` 没装上（`npm install`），或网络拦截了 UDP。都会自动退回 JPEG。
- **扩展屏创建后屏幕闪了一下**：这台 Mac 本身没有接真实显示器（无头 Mac mini、靠远程桌面的虚拟显示器）时，新增显示器会让系统重排显示器。这是实验功能，默认关闭，首次开启会提示。
- **文件夹打不开、提示 Mac 没有回应**：Mac 上可能弹出了文件访问授权提示，点「允许」后重试。
- **iPad 自动锁屏**：设置里「屏幕常亮」默认开启（循环播放一段静音小视频），打开页面后先点一下屏幕。
- **Mac 睡眠后连不上**：「系统设置 → 能耗」关闭自动睡眠，或开启「唤醒以供网络访问」。
- **Mac 的 IP 变了**：路由器里给 Mac 绑定固定 IP，或用 `http://<电脑名>.local:8780`。

## 目录

```
server.js              Mac 端服务：HTTP 接口、动作执行、图标与取色、播放控制、来源列表
input.js               会话化输入（触控 / 键盘）、WebSocket、JPEG 推流与帧编号校验
webrtc.js              WebRTC：H.264 编码进程管理、RTP 打包、信令、关键帧请求
files.js               文件夹分栏浏览：路径校验、目录读取（子进程隔离）、QuickLook 缩略图
remote.js              浏览器桥接：视频遥控、标签页、书签、网页磁贴去重
nowplaying.js          正在播放（QQ 音乐 / Apple Music / 系统级）与歌词
panels.js              应用交互面板定义（Claude、ChatGPT）
helper/deckctl.swift   原生小工具（首次启动自动编译）
public/                iPad 端（index.html / app.css / app.js）与 Mac 设置向导（setup.html）
scripts/               一键安装、自启动安装与卸载
tests/                 node:test 回归测试（不向真实应用发送输入）
```

## 开发

```bash
npm test                                              # 回归测试
npx --yes acorn@8.14.0 --ecma5 --silent public/app.js # 前端必须保持 ES5（iOS 10）
PORT=8781 NP_DEMO=1 node server.js                    # 模拟正在播放
```

- 新增应用面板：在 `panels.js` 里加一项；菜单路径可用 `curl "localhost:8780/api/debug/menus?bundle=<Bundle ID>"` 查看（只接受本机访问）。
- `/api/remote/status` 查看推流档位与观看者；WebRTC 状态见服务日志。
- 改了 `helper/deckctl.swift` 后重启服务会自动重新编译（先编译到临时文件再替换，不要直接覆盖正在运行的二进制）。

## 路线图

- **下一版（`next` 分支）**：主屏幕的 Mac 系统状态磁贴（CPU / 内存 / 磁盘 / 网络 / 电池 / 运行时间）、AI 用量与额度重置倒计时、倒计时、待办等小组件，更丰富的版式与自定义。
- 扩展屏：多分辨率与竖屏、记住窗口位置。
- 副屏：音频转发、按网络状况动态码率。

## 致谢

iPadDuo 站在这些项目和资料的肩膀上（「参考」表示只借鉴思路或公开协议，未复制代码）：

| 项目 | 用途 |
|---|---|
| [libdatachannel](https://github.com/paullouisageneau/libdatachannel)（MPL-2.0）与 [node-datachannel](https://github.com/murat-dogan/node-datachannel)（MPL-2.0） | WebRTC 传输、H.264 RTP 打包、RTCP 发送报告与 NACK 重传，作为可选依赖直接使用 |
| Apple ScreenCaptureKit / VideoToolbox / CoreGraphics | 窗口与显示器采集、硬件 H.264 编码、输入事件 |
| [opendisplay](https://github.com/peetzweg/opendisplay)（GPL-3.0） | 参考：CGVirtualDisplay + ScreenCaptureKit + VideoToolbox 做 iPad 扩展屏的整体思路 |
| [DeskPad](https://github.com/Stengo/DeskPad) | 参考：用 CGVirtualDisplay 创建虚拟显示器 |
| [Moonlight](https://github.com/moonlight-stream/moonlight-qt) / [Sunshine](https://github.com/LizardByte/Sunshine) | 参考：低延迟串流的编码参数与关键帧策略 |
| [SidecarLauncher](https://github.com/Ocasio-J/SidecarLauncher)、[free-sidecar](https://github.com/ben-z/free-sidecar) | 参考：通过 SidecarCore 连接随航 |
| [UU 远程接入指南](https://github.com/netease-uuyc/uuremote-integration-guide) | 参考：URL Scheme 拉起远控 |
| [LRCLIB](https://lrclib.net)、QQ 音乐与网易云音乐的公开接口 | 歌词与封面查询 |
| [NoSleep.js](https://github.com/richtr/NoSleep.js) | 参考：循环播放静音视频阻止 iPad 锁屏 |
| [Mole](https://github.com/tw93/Mole) | 参考：下一版系统状态磁贴的信息设计 |
| [RustDesk](https://github.com/rustdesk/rustdesk) | 评估过的开源远程桌面方案 |

## 分析与验证

- [交互重构分析与验证记录](docs/analysis-and-verification.md)：画面卡顿的根因、触控板与画面的取舍、局域网串流开源方案对比、帧时间与尺寸测试结果、尚未真机验证的部分
- [iPhone Duo 双屏交互调研](docs/iphone-duo-research.md)

## 许可

[MIT](LICENSE)。可选依赖 node-datachannel / libdatachannel 以 MPL-2.0 授权，通过 npm 单独安装，不随本仓库分发。
