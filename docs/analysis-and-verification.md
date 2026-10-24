# 交互重构分析与验证记录（1.0）

> 2026-10-25。本文回答四个问题：画面为什么卡、触控板与画面是否重叠、局域网同步画面有哪些开源方案可借鉴，以及 1.0 做了哪些验证、还缺什么。

## 1. 画面卡顿与「指针没跟上」的原因

| 现象 | 根因 | 1.0 的处理 |
|---|---|---|
| 画面卡、糊、延迟高 | 旧方案每帧都是一张完整 JPEG（几十到几百 KB），需要 WebSocket 传输、iPad 软解码，再替换 `<img>`。帧率被「编码、传输、解码」串行链路卡死；网络稍抖就积压。Mac 端测得 WebSocket 往返 0.24 ms、helper 管道 0.33 ms，瓶颈不在 Mac，而在 JPEG 帧模型和 iPad 的 Wi-Fi | iPadOS 11+ 改走 **WebRTC + VideoToolbox H.264**：硬件编解码、只传变化、抖动缓冲、NACK 重传、关键帧按需。实测 57 fps，静止画面接近零带宽。iOS 10 保留 JPEG，但改为「按帧确认的额度」推流，不会积压 |
| 手指已在视频上，点击却没生效 | ① 点击换算用的是「最新」窗口位置，而 iPad 看到的是旧帧；② helper 严格要求前台窗口就是目标窗口，Chrome 的悬停浮层在最前时会把点击拒掉；③ 指针只在抬手时才移动，网页的悬停控件（视频控制条）此时还没出现 | ① 每一帧带编号，点击按「iPad 显示的那一帧」换算；② 校验改为「前台窗口属于同一进程」；③ **按下即悬停**（`hv`）：手指一落下指针就过去，控制条提前出现 |
| 滚动后误点 | 惯性滚动中轻点会被当成点击 | 160 ms 内有滚动输出时，这一下只「按停」 |

## 2. 触控板与画面是否重叠

是的。旧版有「控制 / 触控板 / 画面」三个平级页面，触控板页面看不到画面，只能盲操作；画面页面又只能直接点，点不准小目标时无处可退。两者是同一件事（操作 Mac）的两种输入方式，不应该是两个页面。

1.0 的方案：
- 顶栏只保留 **控制 | 副屏**。「控制」是按应用的大按钮；「副屏」是 Mac 画面。
- 触控板变成副屏左下角的**开关**：开 = 相对移动指针（画面仍在）；关 = 直接触控。键盘条两种状态都在。
- 「像随航一样当副屏」由 **扩展屏**（CGVirtualDisplay，实验）实现：Mac 多出一块 iPad 尺寸的显示器，可以把窗口移过去。

## 3. 局域网同步画面的开源方案（GitHub 检索，2026-10-25）

| 项目 | Stars | 许可 | 方式 | 对 iPadDuo 的意义 |
|---|---|---|---|---|
| [rustdesk/rustdesk](https://github.com/rustdesk/rustdesk) | 126.8k | AGPL-3.0 | 原生客户端，VP9/H.264 | iOS 客户端要求较新系统，老 iPad 用不了；许可证不兼容 MIT |
| [pavlobu/deskreen](https://github.com/pavlobu/deskreen) | 21.6k | AGPL-3.0 | **浏览器即副屏，WebRTC** | 方向与 iPadDuo 一致，验证了「浏览器 + WebRTC」可行；我们在 Mac 端用硬件编码替代其软件路径 |
| [moonlight-stream/moonlight-qt](https://github.com/moonlight-stream/moonlight-qt) + [LizardByte/Sunshine](https://github.com/LizardByte/Sunshine) | 19.2k | GPL-3.0 | 原生客户端，低延迟游戏串流 | 参考了低延迟编码参数（无 B 帧、短 GOP、按需关键帧）；iOS 客户端需 iOS 12+ |
| [H-M-H/Weylus](https://github.com/H-M-H/Weylus) | 9.7k | AGPL-3.0 | 浏览器触控屏，WebSocket + 视频 | 「平板浏览器当触控屏」的同类方案 |
| [Stengo/DeskPad](https://github.com/Stengo/DeskPad) | 7.9k | MIT | CGVirtualDisplay 虚拟显示器 | 扩展屏的虚拟显示器做法 |
| [peetzweg/opendisplay](https://github.com/peetzweg/opendisplay) | 5.9k | GPL-3.0 | CGVirtualDisplay + SCK + VideoToolbox，原生 iPad App | 整体架构参考；需要 iOS 15+ 原生 App，与「老 iPad 免安装」目标冲突 |
| [selkies-project/selkies](https://github.com/selkies-project/selkies) | 2.4k | MPL-2.0 | WebRTC 网页远程桌面（Linux） | WebRTC 低延迟网页串流的工程实践 |
| [StephenLovino/BetterCast](https://github.com/StephenLovino/BetterCast) | 224 | GPL-3.0 | 把多种设备变成扩展屏 | 同类 |

结论：没有一个现成方案同时满足「iOS 10 Safari 免安装、MIT 可分发、局域网低延迟、可点击」。1.0 采用 **WebRTC（libdatachannel，MPL-2.0 可选依赖）+ Mac 硬件编码**，老设备保留 JPEG 兜底；代码没有复制上述 GPL / AGPL 项目。

## 4. 验证记录

### 4.1 已验证

| 项目 | 方法 | 结果 |
|---|---|---|
| WebRTC 全链路 | Node 端 WebRTC 客户端连到服务，收 RTP 5 秒 | 连接建立，557 个包 / 570 KB；窗口元数据和帧编号正常 |
| 浏览器端硬件视频 | Chromium 进入副屏 | 57 fps、视频分辨率按显示区域自适应、标记为「硬件视频」 |
| 动画帧时间（增强档） | rAF 记录翻页、打开遥控、切分屏、关闭各 700 ms；另加每帧 10 ms 主线程负载 | p95 17.4 ms，没有超过 33 ms 的帧；加负载后仍无掉帧（动画在合成层，不依赖主线程） |
| 动画帧时间（省电档） | 同上，含文件夹打开、分栏展开 | 毛玻璃确认关闭；翻页、分栏展开无掉帧；打开浮层时有 1 帧 34 ms（构建控件 HTML） |
| 老 CPU 模拟 · 动效 | 无头 Chrome + DevTools CPU 降速 4× / 6× / 10×（A7 约为 M4 单核的 1/10），省电档，iPad 横屏尺寸 | 翻页、打开遥控、推流时空闲帧：p95 16.8 ms，最多 1 帧超过 33 ms |
| 老 CPU 模拟 · JPEG 副屏 | 同上，`#screen-compat` | 1× / 6× / 10× 降速下都稳定在 **约 8 fps · 1024px · 每帧 83 KB**，正好是省电档的设计上限，CPU 变慢没有让它掉得更低 |
| **副屏触控端到端** | 本机测试页（8 个按钮 + 滚动区，只记录点击）在新的 Safari 窗口打开；脚本按 iPad 的协议发送：取帧 → 悬停 `hv` → 点击 `tap`（含离按钮边缘 15px 的点）→ 滚动 `sa` → 触控板相对移动 `m` + 单击 `c` | 修复后 **24/24 点中，最大误差 1px**；悬停 24/24；滚动区 0 → 400；触控板 2/2 |
| 遮挡保护 | 用临时浮动窗口盖住第一列再点 | 被盖住的 B0、B4 拒绝点击并返回 `covered:<应用名>`；未遮挡的 B3 正常点中 |
| iPad 尺寸布局 | 1024×768、768×1024、1133×744、744×1133、1366×1024、1024×1366 | Dock、顶栏无溢出；磁贴多的页面自动压缩行高，一屏看全 |
| 分屏控件 | 1024×768 下分屏 | 控件区按实际宽度用两列大按钮，左侧 Dock 收起为迷你播放器 + 播放键 |
| 真实 iPadOS Safari | iOS 27 模拟器（iPad mini A17 Pro）打开主页 | WebKit 渲染正常（竖屏 4 列） |
| 真实 iPadOS Safari · 副屏硬件视频 | 模拟器 Safari 打开 `#screen` 深链接，读右上角读数 | **53 fps · 1396px · 0.8 Mbps · 硬件视频**，网络 2 ms；画面清晰，「触控板 / 扩展屏」工具按钮位置正确 |
| 真实 iPadOS Safari · JPEG 兼容路线（iOS 10 用的路线） | 模拟器 Safari 打开 `#screen-compat` | **13.7 fps · 1280px · 每帧约 125 KB · 兼容连接**；不支持 WebRTC 时「扩展屏」按钮正确隐藏 |
| iOS 10 兼容 | `acorn --ecma5` 语法检查 + 新 API 检索（finally / includes / closest / Array.from 等） | 前端为纯 ES5，未使用 iOS 10 缺失的 API；安全区样式包在 `@supports` 里 |
| 他人安装 | 从 GitHub 全新克隆、`npm install`、端口 8782 启动 | 依赖不到 1 秒装好，原生小工具 8 秒内编译完成，按本机应用自动生成默认配置，设置向导可访问，30 项测试通过 |
| 回归测试 | `npm test` | main 30 项、next 33 项全部通过 |

### 4.2 尚未验证（需要真机）

- **iPad mini 2 / iOS 10.3 真机**：CPU 降速 10× 的模拟下省电档仍有约 8 fps、动效不掉帧，但真机的 GPU、Wi-Fi、发热与耗电只能在真机上确认。合成层动画在 Chromium 上加负载不掉帧，只能说明动画不依赖主线程，不能代替 A7 实测。
- **模拟器里的触控输入**：两条画面路线已在模拟器 Safari 里实测（见上表）。但在副屏上点按 / 滚动会把真实点击发到 Mac，需要授权模拟器面板并在测试应用上进行，本次未做。
- **扩展屏**：这台 Mac mini 本身只有一块虚拟显示器，新建虚拟显示器会让系统重排，所以没有完整测试。需要在接了真实显示器的 Mac 上验证。

建议的真机检查：iPad 打开 `http://<Mac IP>:8780` → 遥控 Mac → 副屏，看右上角读数。iPadOS 11+ 应显示「硬件视频」；iOS 10 显示「推流」，能达到 6–8 fps 即为正常。

## 5. 本轮发现并修复的问题

- **屏幕录制权限失效时，iPad 只显示「画面暂不可用，正在重试」**：常驻采集进程拿到的 ScreenCaptureKit 授权失效后，会返回本地化的 TCC 错误，旧代码没识别出来。现在这类错误统一归为 `screen-permission`：WebRTC 与 JPEG 两条路线都会在 iPad 上提示需要授权，HTTP 兼容连接也会显示服务端给出的具体原因。重启服务即可恢复。
- **点击偶发无效（约 1/4）**：helper 把「移动 → 按下 → 松开」三个事件在同一微秒内发出，WebKit 等应用会把零时长的按下 / 松开丢掉；触控板单击同样如此。现在先停稳 12ms、按住 35ms 再松开，点击率从 9/12 提高到 24/24。
- **副屏看不到的遮挡**：副屏只截目标窗口，系统授权弹窗、通知等浮在它上面时，iPad 上看不到，点击却会落到弹窗上（测试中就被一个系统通知窗口挡住了第三列）。现在点击前检查该点的窗口层级，被别的应用盖住就拒绝点击，并在 iPad 上提示是哪个应用挡住了。
