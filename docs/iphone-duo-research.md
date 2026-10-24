# 调研：iPhone Duo（折叠屏 iPhone）的双屏交互与应用适配

> 2026-10-25 整理。iPhone Duo 于 2026 年 9 月发布、iOS 27.1 随机。资料来自 Apple 新闻稿与发布后的媒体、开发者文章；涉及开发 API 的部分以 Xcode 27.1 正式文档为准。

## 1. 硬件与系统形态

- **两块屏**：外屏 5.4 英寸（约为 iPhone 18 Pro 的 90% 面积），内屏 7.6 英寸；**两块屏宽高比相同**，内容在两屏之间等比例缩放，翻转、展开时过渡连贯。
- **系统层面**：折叠时内容随角度调整，**翻过来就切到朝向用户的那块屏**；展开后主屏幕是两页并排、左侧为「今日」小组件列表；状态栏缩进角落的圆形，灵动岛改为竖向；Dock 与导航移到侧边。
- **放在桌上**：可以撑起来免手持 FaceTime、延时摄影；**StandBy 在任一块屏上都能进入**（不插电也可以）。
- **多任务**：iPhone 首次支持 Split View：两个 App 左右各半、可交换、同一 App 双窗口（如 Safari）、保存「App 组合」；Siri 可以在一侧对话、另一侧照常用 App。

## 2. 外屏（副屏）在折叠状态下的用法

| 场景 | 外屏做什么 | 内屏做什么 |
|---|---|---|
| 系统相机 · Duo Preview | 给被拍的人看实时取景，方便摆姿势 | 拍摄者取景、操作 |
| Duo FaceTime | 对面的人从外屏加入通话 | 主通话界面 |
| Kid Cue | 播放 Peanuts 动画吸引孩子看镜头 | 拍摄 |
| Netflix | 刷短片 Clips（快速浏览） | 展开后接着在大屏播放；撑起来时上半画面、下半控件 |
| TikTok | 竖屏刷视频 | 竖屏视图 |
| MLB | — | 撑起来：上半直播，下半实时比分；可与 X / Threads / 体育 App 分屏 |
| Zoom / Slack | — | 会议视图（共享内容 + 参会者）/ 完整工作区 |
| Inoreader | 列表 | 展开后订阅列表与文章并排 |

规律：**外屏 = 快速浏览、给别人看、轻量操作；展开 = 沉浸与并排；半折撑起 = 上内容、下控件。**

## 3. 开发者适配要点（iOS 27 / 27.1 SDK）

- **按 SDK 分三档**：iOS 26 及更早的 App 在内屏居中开窗、四周留空；iOS 27 SDK 基本铺满（避开状态栏）；**iOS 27.1 SDK 才完全铺满，工具栏 / 标签栏改为竖向**。App Store 新增「Made for iPhone Duo」标签，要求 27.1 SDK。
- **按尺寸类布局，不按方向**：外屏是普通 iPhone 的 compact 宽度；内屏宽高都是 regular（当 iPad 来排）；内屏不遵守「支持的界面方向」，横竖判断不再可靠。
- **折痕与遮挡区域**：`reservedRegions(kind:)` 提供 `.division`（折痕，仅半折时有效，展平时宽度为 0）和 `.occlusion`（屏下摄像头等）。滚动内容不需要刻意避开折痕，手工摆放的按钮需要。
- **铰链**：`onHingeChange`（SwiftUI）/ `UIHingeInteraction`（UIKit）给出 关闭 / 半开 / 全开 状态和角度，**只用于效果，不用于布局**；其他 iPhone 上为 nil。
- **ArrangementView**：主次两个视图按尺寸类、比例和折痕自动摆放；`.split` 平分，`.overlay` 先叠放、展开后并排。
- **场景配件**：`CameraCaptureAccessory`：内屏跑相机时在外屏显示内容。
- **多窗口**：支持 iPad 多窗口的 App 自动获得 Split View；新窗口只能在内屏创建，要处理失败情况。
- **检查清单**：去掉 `UIScreen.main`、对称安全区假设；测试 关 / 开 × 竖 / 横 四种姿态和 Split View。

## 4. 对 iPadDuo 的启发（后续可做）

1. **「外屏 = 轻量，展开 = 沉浸」的分层**：iPadDuo 现在的「控制」是轻量层、「副屏」是沉浸层。可以把这种分层做成自动切换：iPad 放在支架上（横屏、静止）默认副屏，拿在手里（竖屏、晃动）默认控制。
2. **半折式「上内容、下控件」**：MLB 和 Netflix 的桌面姿态正适合 iPadDuo 的「观看」视图：上面是 Mac 视频画面，下面是大号进度条和播放键。可以在分屏模式下提供上下布局（目前是左右）。
3. **按可用尺寸而不是方向排版**：与 Apple 对 iPhone Duo 的建议一致，iPadDuo 1.0 已经把控件改为按容器宽高分档（`ctlFit`）。小组件、文件分栏也应沿用同一套分档。
4. **竖向工具栏**：大屏时把导航放到侧边（Apple 在 27.1 的做法）。iPadDuo 的副屏可以把顶栏收成左侧竖条，让 Mac 画面更大。
5. **StandBy 式常亮页**：iPhone Duo 在两块屏上都能进入 StandBy。iPadDuo 可以把「Mac 状态」小组件页做成无操作一段时间后自动进入的大字常亮页（类似现在的歌词页）。
6. **给别人看的那块屏**：Duo Preview / Duo FaceTime 说明「第二块屏给对面的人看」是有价值的交互。iPadDuo 可以做「演示模式」：iPad 面向观众显示 Mac 的幻灯片或某个窗口，操作者只在 Mac 上控制。
7. **App 组合**：类似「保存 App 组合」，iPadDuo 的磁贴可以支持「一键打开一组应用并把窗口摆好」（结合扩展屏的移窗能力）。

## 资料来源

- [Apple unveils iPhone Duo — Apple Newsroom](https://www.apple.com/newsroom/2026/09/apple-unveils-iphone-duo/)
- [iPhone Duo for iOS Developers: What Actually Changes in Your Swift Code — DEV Community](https://dev.to/arshtechpro/iphone-duo-for-ios-developers-what-actually-changes-in-your-swift-code-5gc5)
- [Older apps on iPhone Duo sit in a centered window until developers update them — The Mac Observer](https://www.macobserver.com/news/iphone-duo-older-apps-layout/)
- [Apple Introduces 'Made for iPhone Duo' App Store Label — DEV Community](https://dev.to/saeediphone/apple-introduces-made-for-iphone-duo-app-store-label-and-ios-271-sdk-requirements-4a2l)
- [MLB is making the most of iPhone Duo's foldable screen — TechRadar](https://www.techradar.com/phones/iphone/mlb-is-making-the-most-of-iphone-duos-foldable-screen-just-in-time-for-the-world-series)
- [I've been testing dozens of iPhone Duo apps — Tom's Guide](https://www.tomsguide.com/phones/iphones/ive-been-testing-dozens-of-iphone-duo-apps-heres-my-top-15-picks-so-far)
- [iPhone Duo Apps: Which Apps Actually Use the Foldable Screen — iosapplists](https://iosapplists.com/iphone-duo-apps-which-apps-use-the-foldable-screen/)（聚合整理，部分为开发者说明，仅作参考）
- [iPhone Duo's iOS 27 Is Different — TechRepublic](https://www.techrepublic.com/article/news-iphone-duo-ios-27-foldable-features/)
