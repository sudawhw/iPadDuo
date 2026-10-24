// deckctl — iPadDuo 的本地小工具，由 server.js 首次启动时自动编译。
//   deckctl media playpause|next|prev     发送系统媒体键（对任何播放器生效）
//   deckctl key <combo>                   发送组合键，如 cmd+shift+4
//   deckctl trusted                       输出是否已获得「辅助功能」权限
//   deckctl prompt                        请求「辅助功能」权限（弹出系统对话框）
//   deckctl color <png>                   提取图标主色
//   deckctl blur <in> <out>               生成歌词页用的模糊暗化背景（JPEG）
//   deckctl menu <bundleId> <action>      点击应用菜单里的 播放/暂停、下一首、上一首（action: playpause|next|prev）
//   deckctl menus <bundleId>              列出应用的菜单项（诊断用）
//   deckctl texts <bundleId>              列出应用窗口里的文字（诊断 / 读取播放栏）
//   deckctl running <bundleId>            应用是否在运行
//   deckctl menupath <bundleId> <路径…>     按「菜单 > 项」路径点击菜单项，可给多个候选（中英文），命中第一个可用的
//   deckctl axfocus <bundleId>            把焦点放进应用窗口里的输入框（聊天类应用的输入区）
//   deckctl composer <bundleId> get|set <文本>|insert <文本>   直接读 / 写输入框内容（不经过键盘，不依赖前台应用）
//   deckctl axpress <bundleId> <正则>      点击窗口里标题/描述匹配正则的第一个按钮（如模型选择器）
//   deckctl axbutton <bundleId> <正则>     只读：输出匹配按钮的标题（如当前模型名）
//   deckctl axmenu <bundleId>             列出当前弹出的菜单（下拉选项）
//   deckctl axpopup <bundleId> <正则>      点开匹配的下拉按钮，并列出新弹出的菜单选项
//   deckctl axpick <bundleId> <标题>       点击弹出菜单里标题完全相同的一项；axcancel 关闭弹出菜单
//   deckctl qr <text> <out.png>           生成二维码（设置向导里给 iPad 扫码打开）
//   deckctl serve                         常驻模式：从 stdin 逐行读取指令，模拟鼠标 / 键盘（iPad 触控板用）
//                                         move dx dy | click left|right n | down/up left|right | scroll dx dy | key combo | text 文本 | front
//                                         moveto x y | clickat x y left|right n | downat/upat x y left|right | scrollat x y dx dy（屏幕坐标，投屏用）
//   deckctl capture                       常驻模式：每读到一行「frame <最大宽度> <输出路径>」就截一次最前面的窗口（投屏用，旧方式）
//   deckctl stream <最大宽度> <帧率>        常驻模式：持续推流最前面的窗口（画面变化才出帧），stdout 输出「JSON 头一行 + JPEG 字节」
//   deckctl h264 <最大宽度> <帧率> <码率kbps> [window|virtual WxH]
//                                         常驻：VideoToolbox 硬件编码 H.264（Annex-B），推最前面的窗口或 iPad 专用的虚拟扩展屏
//                                         stdout 每帧「JSON 头一行 + 字节」；stdin：kf / bitrate N / profile W FPS KBPS / pause / resume
//   deckctl screenperm | screenprompt     检查 / 请求「屏幕录制」权限
//   deckctl sidecar list | connect <名称> | disconnect <名称>   随航（Sidecar）：列出 / 连接 / 断开 iPad（系统私有框架 SidecarCore）
import AppKit
import ApplicationServices
import CoreImage
import ScreenCaptureKit
import VideoToolbox
import UniformTypeIdentifiers

func postMedia(_ code: Int32) {
    for down in [true, false] {
        let flags = NSEvent.ModifierFlags(rawValue: down ? 0xa00 : 0xb00)
        let data1 = Int((code << 16) | ((down ? 0xa : 0xb) << 8))
        guard let ev = NSEvent.otherEvent(with: .systemDefined, location: .zero, modifierFlags: flags,
                                          timestamp: 0, windowNumber: 0, context: nil, subtype: 8,
                                          data1: data1, data2: -1) else { continue }
        ev.cgEvent?.post(tap: .cghidEventTap)
    }
}

// 美式键盘布局的虚拟键码
let keyCodes: [String: CGKeyCode] = [
    "a": 0, "s": 1, "d": 2, "f": 3, "h": 4, "g": 5, "z": 6, "x": 7, "c": 8, "v": 9, "b": 11, "q": 12,
    "w": 13, "e": 14, "r": 15, "y": 16, "t": 17, "1": 18, "2": 19, "3": 20, "4": 21, "6": 22, "5": 23,
    "=": 24, "9": 25, "7": 26, "-": 27, "8": 28, "0": 29, "]": 30, "o": 31, "u": 32, "[": 33, "i": 34,
    "p": 35, "l": 37, "j": 38, "'": 39, "k": 40, ";": 41, "\\": 42, ",": 43, "/": 44, "n": 45, "m": 46,
    ".": 47, "`": 50,
    "return": 36, "enter": 36, "tab": 48, "space": 49, "delete": 51, "backspace": 51, "esc": 53, "escape": 53,
    "fwddelete": 117, "home": 115, "end": 119, "pageup": 116, "pagedown": 121,
    "left": 123, "right": 124, "down": 125, "up": 126,
    "f1": 122, "f2": 120, "f3": 99, "f4": 118, "f5": 96, "f6": 97, "f7": 98, "f8": 100,
    "f9": 101, "f10": 109, "f11": 103, "f12": 111,
]

let modifierFlags: [String: CGEventFlags] = [
    "cmd": .maskCommand, "command": .maskCommand, "⌘": .maskCommand,
    "shift": .maskShift, "⇧": .maskShift,
    "opt": .maskAlternate, "option": .maskAlternate, "alt": .maskAlternate, "⌥": .maskAlternate,
    "ctrl": .maskControl, "control": .maskControl, "⌃": .maskControl,
    "fn": .maskSecondaryFn,
]

func postKey(_ combo: String) -> Bool {
    var flags: CGEventFlags = []
    var key: CGKeyCode?
    for part in combo.lowercased().split(separator: "+").map({ $0.trimmingCharacters(in: .whitespaces) }) where !part.isEmpty {
        if let f = modifierFlags[part] { flags.insert(f) } else if let k = keyCodes[part] { key = k } else { return false }
    }
    guard let code = key else { return false }
    let src = CGEventSource(stateID: .hidSystemState)
    for down in [true, false] {
        guard let ev = CGEvent(keyboardEventSource: src, virtualKey: code, keyDown: down) else { return false }
        ev.flags = flags
        ev.post(tap: .cghidEventTap)
    }
    return true
}

// 提取图标主色：按色相分桶，权重 = 饱和度² × 不透明度，取权重最高的桶的平均色。
// 输出 JSON：{"tint":"#rrggbb"|null,"plate":bool}；plate 表示图标是透明底的深色图形，需要浅色底板衬托。
func iconColor(_ path: String) -> String {
    guard let img = NSImage(contentsOfFile: path) else { return "{\"tint\":null,\"plate\":false}" }
    let n = 32
    guard let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: n, pixelsHigh: n, bitsPerSample: 8,
                                     samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                                     colorSpaceName: .deviceRGB, bytesPerRow: n * 4, bitsPerPixel: 32) else { return "{\"tint\":null,\"plate\":false}" }
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    img.draw(in: NSRect(x: 0, y: 0, width: n, height: n))
    NSGraphicsContext.restoreGraphicsState()
    guard let data = rep.bitmapData else { return "{\"tint\":null,\"plate\":false}" }

    var buckets = [(w: Double, r: Double, g: Double, b: Double)](repeating: (0, 0, 0, 0), count: 12)
    var transparent = 0, opaque = 0
    var lumSum = 0.0
    for i in 0..<(n * n) {
        let a = Double(data[i * 4 + 3]) / 255
        if a < 0.5 { transparent += 1; continue }
        opaque += 1
        // 预乘 alpha 还原
        let r = min(1, Double(data[i * 4]) / 255 / a), g = min(1, Double(data[i * 4 + 1]) / 255 / a), b = min(1, Double(data[i * 4 + 2]) / 255 / a)
        let mx = max(r, g, b), mn = min(r, g, b)
        lumSum += 0.299 * r + 0.587 * g + 0.114 * b
        let sat = mx == 0 ? 0 : (mx - mn) / mx
        if sat < 0.25 || mx < 0.18 { continue }
        var h: Double
        if mx == mn { h = 0 } else if mx == r { h = (g - b) / (mx - mn) } else if mx == g { h = 2 + (b - r) / (mx - mn) } else { h = 4 + (r - g) / (mx - mn) }
        h = (h < 0 ? h + 6 : h) / 6
        let k = min(11, Int(h * 12))
        let w = sat * sat * a
        buckets[k].w += w; buckets[k].r += r * w; buckets[k].g += g * w; buckets[k].b += b * w
    }
    let total = n * n
    let plate = Double(transparent) / Double(total) > 0.2 && opaque > 0 && lumSum / Double(opaque) < 0.35
    let best = buckets.max { $0.w < $1.w }!
    // 有效彩色像素太少（黑白 logo）时不给主色，由前端使用中性深色
    if best.w < Double(total) * 0.03 { return "{\"tint\":null,\"plate\":\(plate)}" }
    let hex = String(format: "#%02x%02x%02x", Int(best.r / best.w * 255), Int(best.g / best.w * 255), Int(best.b / best.w * 255))
    return "{\"tint\":\"\(hex)\",\"plate\":\(plate)}"
}

// 专辑封面 → 大半径高斯模糊 + 压暗，作为歌词页背景。在 Mac 上算好，iPad 只需显示一张图。
func blurArtwork(_ input: String, _ output: String) -> Bool {
    guard let img = CIImage(contentsOf: URL(fileURLWithPath: input)) else { return false }
    let side = 360.0
    let scale = side / max(img.extent.width, img.extent.height)
    let small = img.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
    let blurred = small.clampedToExtent()
        .applyingGaussianBlur(sigma: 28)
        .applyingFilter("CIColorControls", parameters: [kCIInputSaturationKey: 1.35, kCIInputBrightnessKey: -0.18])
        .cropped(to: small.extent)
    let ctx = CIContext()
    guard let cs = CGColorSpace(name: CGColorSpace.sRGB),
          let data = ctx.jpegRepresentation(of: blurred, colorSpace: cs, options: [kCGImageDestinationLossyCompressionQuality as CIImageRepresentationOption: 0.8]) else { return false }
    return (try? data.write(to: URL(fileURLWithPath: output))) != nil
}

// ---------- 辅助功能（AX）：应用菜单与窗口文字 ----------

func axAttr(_ e: AXUIElement, _ name: String) -> AnyObject? {
    var v: AnyObject?
    return AXUIElementCopyAttributeValue(e, name as CFString, &v) == .success ? v : nil
}
func axChildren(_ e: AXUIElement) -> [AXUIElement] { (axAttr(e, kAXChildrenAttribute) as? [AXUIElement]) ?? [] }
func axString(_ e: AXUIElement, _ name: String) -> String { ((axAttr(e, name) as? String) ?? "").trimmingCharacters(in: .whitespacesAndNewlines) }
func axEnabled(_ e: AXUIElement) -> Bool { (axAttr(e, kAXEnabledAttribute) as? Bool) ?? true }

func appElement(_ bundle: String) -> AXUIElement? {
    guard let app = NSRunningApplication.runningApplications(withBundleIdentifier: bundle).first else { return nil }
    let el = AXUIElementCreateApplication(app.processIdentifier)
    // Electron / Chromium 应用默认不生成网页内容的辅助功能树，需要显式打开
    AXUIElementSetAttributeValue(el, "AXManualAccessibility" as CFString, kCFBooleanTrue)
    return el
}

func axWindow(_ app: AXUIElement) -> AXUIElement? {
    if let w = axAttr(app, kAXFocusedWindowAttribute) { return (w as! AXUIElement) }
    return ((axAttr(app, kAXWindowsAttribute) as? [AXUIElement]) ?? []).first
}

func axLabel(_ e: AXUIElement) -> String {
    for k in [kAXTitleAttribute, kAXDescriptionAttribute, kAXHelpAttribute, kAXValueAttribute] {
        let v = axString(e, k)
        if !v.isEmpty { return v }
    }
    return ""
}

// 深度优先找元素（限制深度和数量，避免大窗口卡住）
func axFind(_ root: AXUIElement, maxDepth: Int = 40, _ match: (AXUIElement, String) -> Bool) -> AXUIElement? {
    var visited = 0
    func walk(_ e: AXUIElement, _ d: Int) -> AXUIElement? {
        visited += 1
        if visited > 6000 || d > maxDepth { return nil }
        let role = axString(e, kAXRoleAttribute)
        if match(e, role) { return e }
        for c in axChildren(e) { if let hit = walk(c, d + 1) { return hit } }
        return nil
    }
    return walk(root, 0)
}

func pressMenuPath(_ bundle: String, _ paths: [String]) -> Int32 {
    guard let app = appElement(bundle) else { return 5 }
    let items = menuItems(app)
    for p in paths {
        let want = p.replacingOccurrences(of: " ", with: "")
        if let hit = items.first(where: { $0.path.replacingOccurrences(of: " ", with: "") == want && $0.enabled }) {
            return AXUIElementPerformAction(hit.el, kAXPressAction as CFString) == .success ? 0 : 6
        }
    }
    return 4
}

// 聊天输入框：优先名字像输入框的 TextArea（「提示词」「Message」「回复」…），其次最后一个 TextArea；
// 不选 TextField，避免误选内置浏览器的地址栏、搜索框
let composerHint = try! NSRegularExpression(pattern: "提示词|消息|回复|询问|输入|聊天|Message|Reply|Prompt|Ask|Chat|Work", options: [.caseInsensitive])
func findComposer(_ bundle: String) -> AXUIElement? {
    guard let app = appElement(bundle), let win = axWindow(app) else { return nil }
    var named: AXUIElement?, last: AXUIElement?
    _ = axFind(win) { e, role in
        guard role == "AXTextArea" else { return false }
        last = e
        let l = axLabel(e)
        if named == nil, composerHint.firstMatch(in: l, range: NSRange(l.startIndex..., in: l)) != nil { named = e }
        return false
    }
    return named ?? last
}

func composer(_ bundle: String, _ op: String, _ text: String) -> Int32 {
    guard let c = findComposer(bundle) else { return 4 }
    switch op {
    case "get":
        // 空输入框有的会把占位文字当作值返回（如「使用 ChatGPT Work」），视为空
        let v = (axAttr(c, kAXValueAttribute) as? String) ?? ""
        let placeholders = [axString(c, kAXPlaceholderValueAttribute), axString(c, kAXDescriptionAttribute), axString(c, kAXTitleAttribute)]
        print(placeholders.contains(v.trimmingCharacters(in: .whitespacesAndNewlines)) ? "" : v)
        return 0
    case "set":
        return AXUIElementSetAttributeValue(c, kAXValueAttribute as CFString, text as CFString) == .success ? 0 : 6
    case "insert":
        // 在光标处插入（相当于粘贴），对网页 / 原生输入框都适用
        AXUIElementSetAttributeValue(c, kAXFocusedAttribute as CFString, kCFBooleanTrue)
        return AXUIElementSetAttributeValue(c, kAXSelectedTextAttribute as CFString, text as CFString) == .success ? 0 : 6
    default:
        return 2
    }
}

func focusComposer(_ bundle: String) -> Int32 {
    guard let app = appElement(bundle), let win = axWindow(app) else { return 5 }
    var named: AXUIElement?, last: AXUIElement?
    _ = axFind(win) { e, role in
        guard role == "AXTextArea" else { return false }
        var settable: DarwinBoolean = false
        AXUIElementIsAttributeSettable(e, kAXFocusedAttribute as CFString, &settable)
        guard settable.boolValue else { return false }
        last = e
        let l = axLabel(e)
        if named == nil, composerHint.firstMatch(in: l, range: NSRange(l.startIndex..., in: l)) != nil { named = e }
        return false
    }
    guard let target = named ?? last else { return 4 }
    return AXUIElementSetAttributeValue(target, kAXFocusedAttribute as CFString, kCFBooleanTrue) == .success ? 0 : 6
}

func findButton(_ bundle: String, _ pattern: String) -> AXUIElement? {
    guard let app = appElement(bundle), let win = axWindow(app),
          let re = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else { return nil }
    return axFind(win) { e, role in
        guard role == "AXButton" || role == "AXPopUpButton" || role == "AXMenuButton" else { return false }
        let l = axLabel(e)
        return !l.isEmpty && re.firstMatch(in: l, range: NSRange(l.startIndex..., in: l)) != nil
    }
}

// 屏幕上正在显示的菜单：AXMenu 且有实际尺寸（收起的网页下拉菜单也会留在辅助功能树里，但尺寸为 0 或没有子项）
func axSize(_ e: AXUIElement) -> CGSize {
    guard let v = axAttr(e, kAXSizeAttribute) else { return .zero }
    var s = CGSize.zero
    AXValueGetValue(v as! AXValue, .cgSize, &s)
    return s
}

func visibleMenus(_ bundle: String) -> [AXUIElement] {
    guard let app = appElement(bundle) else { return [] }
    var out: [AXUIElement] = []
    var visited = 0
    func walk(_ e: AXUIElement, _ d: Int) {
        visited += 1
        if visited > 8000 || d > 45 { return }
        let role = axString(e, kAXRoleAttribute)
        if role == "AXMenuBar" { return }                       // 菜单栏不算
        if role == "AXMenu" {
            let sz = axSize(e)
            if sz.width > 1 && sz.height > 1 && !axChildren(e).isEmpty { out.append(e) }
        }
        for c in axChildren(e) { walk(c, d + 1) }
    }
    walk(app, 0)
    return out
}

func openMenu(_ bundle: String) -> AXUIElement? { visibleMenus(bundle).last }

func axPoint(_ e: AXUIElement) -> CGPoint? {
    guard let v = axAttr(e, kAXPositionAttribute) else { return nil }
    var p = CGPoint.zero
    AXValueGetValue(v as! AXValue, .cgPoint, &p)
    let s = axSize(e)
    guard s.width > 0, s.height > 0 else { return nil }
    return CGPoint(x: p.x + s.width / 2, y: p.y + s.height / 2)
}

// 在元素中心模拟一次真实的鼠标点击（有些网页控件只响应指针事件，不响应辅助功能的「按下」），点完把鼠标放回原处
func clickElement(_ e: AXUIElement) -> Bool {
    guard let p = axPoint(e) else { return false }
    let src = CGEventSource(stateID: .hidSystemState)
    let back = CGEvent(source: nil)?.location ?? p
    for t: CGEventType in [.mouseMoved, .leftMouseDown, .leftMouseUp] {
        CGEvent(mouseEventSource: src, mouseType: t, mouseCursorPosition: p, mouseButton: .left)?.post(tap: .cghidEventTap)
        usleep(15_000)
    }
    CGEvent(mouseEventSource: src, mouseType: .mouseMoved, mouseCursorPosition: back, mouseButton: .left)?.post(tap: .cghidEventTap)
    return true
}

func newMenu(_ bundle: String, after before: [AXUIElement], tries: Int) -> AXUIElement? {
    for _ in 0..<tries {
        usleep(100_000)
        if let fresh = visibleMenus(bundle).first(where: { m in !before.contains(where: { CFEqual($0, m) }) }) { return fresh }
    }
    return nil
}

// 点开下拉按钮，等待新出现的菜单：先用辅助功能「按下」，0.5 秒内没出现就在按钮中心真实点击一次
func popupMenu(_ bundle: String, _ pattern: String) -> AXUIElement? {
    let before = visibleMenus(bundle)
    guard let b = findButton(bundle, pattern) else { return nil }
    _ = AXUIElementPerformAction(b, kAXPressAction as CFString)
    if let m = newMenu(bundle, after: before, tries: 5) { return m }
    guard clickElement(b) else { return nil }
    return newMenu(bundle, after: before, tries: 12)
}

func menuEntries(_ menu: AXUIElement) -> [(title: String, el: AXUIElement, enabled: Bool, checked: Bool)] {
    var out: [(String, AXUIElement, Bool, Bool)] = []
    func walk(_ e: AXUIElement, _ d: Int) {
        if d > 6 { return }
        for c in axChildren(e) {
            let role = axString(c, kAXRoleAttribute)
            if role == "AXMenuItem" || role == "AXMenuItemCheckBox" || role == "AXMenuItemRadio" {
                var t = axLabel(c)
                if t.isEmpty {
                    // 网页菜单项的文字常在子元素里
                    t = axChildren(c).map { axLabel($0) }.filter { !$0.isEmpty }.joined(separator: " ")
                }
                let checked = ((axAttr(c, "AXMenuItemMarkChar") as? String) ?? "").isEmpty == false || (axAttr(c, kAXValueAttribute) as? Int) == 1
                if !t.isEmpty { out.append((t, c, axEnabled(c), checked)) }
            } else {
                walk(c, d + 1)
            }
        }
    }
    walk(menu, 0)
    return out
}

func pressButton(_ bundle: String, _ pattern: String) -> Int32 {
    guard let b = findButton(bundle, pattern) else { return 4 }
    return AXUIElementPerformAction(b, kAXPressAction as CFString) == .success ? 0 : 6
}

// 遍历菜单栏（跳过苹果菜单），返回 (路径, 元素, 是否可用)，包含一层子菜单
func menuItems(_ app: AXUIElement) -> [(path: String, title: String, el: AXUIElement, enabled: Bool)] {
    guard let bar = axAttr(app, kAXMenuBarAttribute) else { return [] }
    var out: [(String, String, AXUIElement, Bool)] = []
    for (i, top) in axChildren(bar as! AXUIElement).enumerated() where i > 0 {
        let topTitle = axString(top, kAXTitleAttribute)
        for menu in axChildren(top) {
            for item in axChildren(menu) {
                let t = axString(item, kAXTitleAttribute)
                if t.isEmpty { continue }
                out.append((topTitle + " > " + t, t, item, axEnabled(item)))
                for sub in axChildren(item) {
                    for subItem in axChildren(sub) {
                        let st = axString(subItem, kAXTitleAttribute)
                        if !st.isEmpty { out.append((topTitle + " > " + t + " > " + st, st, subItem, axEnabled(subItem))) }
                    }
                }
            }
        }
    }
    return out
}

let menuCandidates: [String: [String]] = [
    "playpause": ["播放/暂停", "播放 / 暂停", "暂停/播放", "Play/Pause", "Play / Pause", "暂停", "Pause", "播放", "Play"],
    "next": ["下一首", "下一曲", "下一个", "Next", "Next Track", "Next Song"],
    "prev": ["上一首", "上一曲", "上一个", "Previous", "Previous Track", "Previous Song"],
]

func pressMenu(_ bundle: String, _ action: String) -> Int32 {
    guard let app = appElement(bundle) else { return 5 }           // 未运行
    guard let cands = menuCandidates[action] else { return 2 }
    let items = menuItems(app)
    for c in cands {
        if let hit = items.first(where: { $0.title.caseInsensitiveCompare(c) == .orderedSame && $0.enabled }) {
            return AXUIElementPerformAction(hit.el, kAXPressAction as CFString) == .success ? 0 : 6
        }
    }
    return 4                                                          // 没找到对应菜单项
}

// 收集窗口里的静态文字（深度优先，最多 400 条）
func windowTexts(_ bundle: String) -> [String] {
    guard let app = appElement(bundle) else { return [] }
    var out: [String] = []
    func walk(_ e: AXUIElement, _ depth: Int) {
        if out.count >= 600 || depth > 40 { return }
        let role = axString(e, kAXRoleAttribute)
        if role == "AXStaticText" || role == "AXButton" || role == "AXSlider" || role == "AXPopUpButton" || role == "AXMenuButton" {
            var v = axString(e, kAXValueAttribute)
            if v.isEmpty { v = axString(e, kAXTitleAttribute) }
            if v.isEmpty { v = axString(e, kAXDescriptionAttribute) }
            if !v.isEmpty { out.append(role.replacingOccurrences(of: "AX", with: "") + "\t" + v) }
        } else if role == "AXTextArea" || role == "AXTextField" {
            out.append(role.replacingOccurrences(of: "AX", with: "") + "\t" + axLabel(e))
        }
        for c in axChildren(e) { walk(c, depth + 1) }
    }
    for w in (axAttr(app, kAXWindowsAttribute) as? [AXUIElement]) ?? [] { walk(w, 0) }
    return out
}

// ---------- 投屏：截取最前面的窗口 ----------

// 最前面的普通窗口（层级 0、足够大），与 frontmostBundle 用同一套判断
func frontWindowID() -> CGWindowID? {
    let list = (CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]]) ?? []
    for w in list where (w[kCGWindowLayer as String] as? Int) == 0 {
        let b = w[kCGWindowBounds as String] as? [String: CGFloat] ?? [:]
        if (b["Width"] ?? 0) < 120 || (b["Height"] ?? 0) < 80 { continue }
        if ((w[kCGWindowAlpha as String] as? Double) ?? 1) <= 0 { continue }
        if let id = w[kCGWindowNumber as String] as? CGWindowID { return id }
    }
    return nil
}

func windowGeometry(_ id: CGWindowID) -> CGRect? {
    guard let list = CGWindowListCopyWindowInfo([.optionIncludingWindow], id) as? [[String: Any]],
          let w = list.first(where: { ($0[kCGWindowNumber as String] as? CGWindowID) == id }),
          let b = w[kCGWindowBounds as String] as? [String: CGFloat],
          let x = b["X"], let y = b["Y"], let width = b["Width"], let height = b["Height"], width > 0, height > 0 else { return nil }
    return CGRect(x: x, y: y, width: width, height: height)
}

// 点击位置上方是否盖着别的应用的窗口（系统授权弹窗、通知、浮动工具条……）。
// 副屏只截目标窗口，iPad 上看不到这些遮挡；直接点会点到别的窗口上，所以先检查并拒绝。
// 窗口列表从前往后排列；忽略程序坞 / 菜单栏这类全屏透明层（层级 ≥ 20）和负层级、全透明窗口。
func coveringWindow(at p: CGPoint, owner: pid_t) -> String? {
    let list = (CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]]) ?? []
    for w in list {
        guard let pid = w[kCGWindowOwnerPID as String] as? pid_t,
              let bd = w[kCGWindowBounds as String] as? [String: Any],
              let r = CGRect(dictionaryRepresentation: bd as CFDictionary), r.contains(p) else { continue }
        if pid == owner { return nil }
        let layer = w[kCGWindowLayer as String] as? Int ?? 0, alpha = w[kCGWindowAlpha as String] as? Double ?? 1
        if layer < 0 || layer >= 20 || alpha < 0.05 { continue }
        return (w[kCGWindowOwnerName as String] as? String ?? "?").replacingOccurrences(of: "\t", with: " ")
    }
    return nil
}

func windowOwnerPID(_ id: CGWindowID) -> pid_t? {
    guard let list = CGWindowListCopyWindowInfo([.optionIncludingWindow], id) as? [[String: Any]],
          let w = list.first(where: { ($0[kCGWindowNumber as String] as? CGWindowID) == id }) else { return nil }
    return w[kCGWindowOwnerPID as String] as? pid_t
}

func activeDisplayBounds() -> [CGRect] {
    var count: UInt32 = 0
    CGGetActiveDisplayList(0, nil, &count)
    var ids = [CGDirectDisplayID](repeating: 0, count: Int(count))
    CGGetActiveDisplayList(count, &ids, &count)
    return ids.map { CGDisplayBounds($0) }
}

func jsonString(_ o: [String: Any]) -> String {
    guard let d = try? JSONSerialization.data(withJSONObject: o), let s = String(data: d, encoding: .utf8) else { return "{}" }
    return s
}

final class WindowCapturer: @unchecked Sendable {
    private var content: SCShareableContent?
    private var contentAt = Date.distantPast

    // ScreenCaptureKit 是异步 API；这里在后台线程里同步等待结果，保持「一行指令 → 一行结果」
    func frame(out: String, maxWidth: CGFloat, bundle: String? = nil) -> String {
        let sem = DispatchSemaphore(value: 0)
        var result = jsonString(["ok": 0, "err": "timeout"])
        Task {
            result = await self.capture(out: out, maxWidth: maxWidth, bundle: bundle)
            sem.signal()
        }
        _ = sem.wait(timeout: .now() + 3)
        return result
    }

    // bundle 为空：截前台窗口；指定 bundle：截该应用最大的可见窗口（播放来源缩略图，不需要在前台）
    private func capture(out: String, maxWidth: CGFloat, bundle: String? = nil) async -> String {
        guard CGPreflightScreenCaptureAccess() else { return jsonString(["ok": 0, "err": "screen-permission"]) }
        let front = bundle == nil ? frontWindowID() : nil
        if bundle == nil && front == nil { return jsonString(["ok": 0, "err": "no-window"]) }
        do {
            // 可共享内容列表获取较慢，缓存 1.5 秒；找不到窗口时再刷新
            if content == nil || Date().timeIntervalSince(contentAt) > 1.5 || (front != nil && content?.windows.contains(where: { $0.windowID == front }) != true) {
                content = try await SCShareableContent.excludingDesktopWindows(true, onScreenWindowsOnly: true)
                contentAt = Date()
            }
            let candidate: SCWindow?
            if let b = bundle {
                candidate = content?.windows.filter { $0.owningApplication?.bundleIdentifier == b && $0.windowLayer == 0 && $0.frame.width > 200 && $0.frame.height > 150 }
                    .max(by: { $0.frame.width * $0.frame.height < $1.frame.width * $1.frame.height })
            } else {
                candidate = content?.windows.first(where: { $0.windowID == front })
            }
            guard let win = candidate else { return jsonString(["ok": 0, "err": "no-window"]) }
            let wid = win.windowID
            let filter = SCContentFilter(desktopIndependentWindow: win)
            let cfg = SCStreamConfiguration()
            let scale = CGFloat(filter.pointPixelScale)
            let pxW = min(maxWidth, win.frame.width * scale)
            cfg.width = max(1, Int(pxW))
            cfg.height = max(1, Int(pxW * win.frame.height / win.frame.width))
            cfg.showsCursor = true
            cfg.ignoreShadowsSingleWindow = true
            let img = try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: cfg)
            guard let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: out) as CFURL, UTType.jpeg.identifier as CFString, 1, nil) else {
                return jsonString(["ok": 0, "err": "write"])
            }
            CGImageDestinationAddImage(dest, img, [kCGImageDestinationLossyCompressionQuality: 0.62] as CFDictionary)
            guard CGImageDestinationFinalize(dest) else { return jsonString(["ok": 0, "err": "write"]) }
            return jsonString([
                "ok": 1, "x": win.frame.minX, "y": win.frame.minY, "w": win.frame.width, "h": win.frame.height,
                "wid": wid, "at": Int64(Date().timeIntervalSince1970 * 1000),
                "pw": img.width, "ph": img.height,
                "app": win.owningApplication?.applicationName ?? "", "bundle": win.owningApplication?.bundleIdentifier ?? "",
                "title": win.title ?? "",
            ])
        } catch {
            return jsonString(["ok": 0, "err": error.localizedDescription])
        }
    }
}

func captureLoop() {
    _ = NSApplication.shared // 先连上窗口服务器：缩略图请求不经过 frontWindowID()，否则 SCContentFilter 会断言崩溃
    let cap = WindowCapturer()
    setvbuf(stdout, nil, _IOLBF, 0)
    Thread.detachNewThread {
        while let line = readLine() {
            // frame <最大宽度> <输出路径>：路径放最后且整段读取，允许包含空格
            let p = line.split(separator: " ", maxSplits: 2).map(String.init)
            if p.first == "frame", p.count == 3, let w = Double(p[1]), p[2].hasPrefix("/") {
                print(cap.frame(out: p[2], maxWidth: CGFloat(w)))
            } else if p.first == "thumb", p.count == 3, let w = Double(p[1]) {
                // thumb <最大宽度> <bundle> <输出路径>
                let q = p[2].split(separator: " ", maxSplits: 1).map(String.init)
                if q.count == 2, q[1].hasPrefix("/") { print(cap.frame(out: q[1], maxWidth: CGFloat(w), bundle: q[0])) }
                else { print(jsonString(["ok": 0, "err": "bad-command"])) }
            } else {
                print(jsonString(["ok": 0, "err": "bad-command"]))
            }
        }
        exit(0)
    }
    RunLoop.main.run()
}

// ---------- 随航（Sidecar） ----------
// 调用系统私有框架 SidecarCore（与控制中心「屏幕镜像」里选 iPad 是同一套机制）。
// 只对支持随航的 iPad（iPadOS 13+，与 Mac 登录同一 Apple 账户）有效。

func sidecarManager() -> NSObject? {
    guard dlopen("/System/Library/PrivateFrameworks/SidecarCore.framework/SidecarCore", RTLD_NOW) != nil,
          let cls = NSClassFromString("SidecarDisplayManager") as? NSObject.Type,
          cls.responds(to: NSSelectorFromString("sharedManager")),
          let mgr = cls.perform(NSSelectorFromString("sharedManager"))?.takeUnretainedValue() as? NSObject else { return nil }
    return mgr
}

func sidecarDevices(_ mgr: NSObject) -> [NSObject] {
    // 设备列表需要一点时间发现，最多等 2 秒
    for _ in 0..<20 {
        if let d = mgr.value(forKey: "devices") as? [NSObject], !d.isEmpty { return d }
        RunLoop.current.run(until: Date().addingTimeInterval(0.1))
    }
    return (mgr.value(forKey: "devices") as? [NSObject]) ?? []
}

func sidecar(_ args: [String]) -> Int32 {
    guard let mgr = sidecarManager() else { print("unavailable"); return 4 }
    let devices = sidecarDevices(mgr)
    let sub = args.first ?? "list"
    if sub == "list" {
        let connected = (mgr.value(forKey: "connectedDevices") as? [NSObject]) ?? []
        for d in devices {
            let name = (d.value(forKey: "name") as? String) ?? "?"
            let on = connected.contains { ($0.value(forKey: "name") as? String) == name }
            print(name + "\t" + (on ? "connected" : ""))
        }
        return 0
    }
    guard args.count > 1, let dev = devices.first(where: { (($0.value(forKey: "name") as? String) ?? "").localizedCaseInsensitiveContains(args[1]) }) else {
        print("not-found"); return 4
    }
    let sel = NSSelectorFromString(sub == "connect" ? "connectToDevice:completion:" : "disconnectFromDevice:completion:")
    guard mgr.responds(to: sel) else { print("unsupported"); return 4 }
    var done = false, failed: String? = nil
    let completion: @convention(block) (NSError?) -> Void = { err in failed = err?.localizedDescription; done = true }
    _ = mgr.perform(sel, with: dev, with: unsafeBitCast(completion, to: AnyObject.self))
    let deadline = Date().addingTimeInterval(20)
    while !done && Date() < deadline { RunLoop.current.run(until: Date().addingTimeInterval(0.1)) }
    if let f = failed { print("error\t" + f); return 6 }
    print(done ? "ok" : "timeout")
    return done ? 0 : 7
}

// ---------- 投屏：持续推流（ScreenCaptureKit SCStream） ----------
// 画面有变化才产生新帧；最前面的窗口变了就切换捕获目标。每帧输出：一行 JSON（含 bytes）+ 紧跟的 JPEG 字节。

final class WindowStreamer: NSObject, SCStreamOutput, SCStreamDelegate, @unchecked Sendable {
    // 配置/重定位只在主线程；帧、额度和输出只在 queue；JPEG 只在 encoderQueue。
    var maxWidth: CGFloat
    var fps: Int
    var quality: Double
    let creditMode: Bool
    var stream: SCStream?
    var currentID: CGWindowID = 0
    var currentBounds = CGRect.null
    var win: SCWindow?
    var retargeting = false
    var configDirty = true
    let ciContext = CIContext(options: [.useSoftwareRenderer: false])
    let out = FileHandle.standardOutput
    let queue = DispatchQueue(label: "deck.stream.state")
    let encoderQueue = DispatchQueue(label: "deck.stream.encode", qos: .userInitiated)
    var paused = false
    var credit = false
    var encoding = false
    var generation = 0
    var acceptedStream: SCStream?
    var expectedSize = CGSize.zero
    var outputMeta: [String: Any]?
    var pending: CVPixelBuffer?
    var lastPixel: CVPixelBuffer?
    var captureAt: Int64 = 0
    var outputQuality = 0.6
    var lastError = ""

    init(maxWidth: CGFloat, fps: Int, quality: Double, creditMode: Bool) {
        self.maxWidth = maxWidth; self.fps = fps; self.quality = quality; self.creditMode = creditMode
    }
    @MainActor func config(for w: SCWindow, scale: CGFloat) -> SCStreamConfiguration {
        let cfg = SCStreamConfiguration()
        let pxW = min(maxWidth, w.frame.width * scale)
        cfg.width = max(2, Int(pxW) & ~1)
        cfg.height = max(2, Int(pxW * w.frame.height / w.frame.width) & ~1)
        cfg.minimumFrameInterval = CMTime(value: 1, timescale: CMTimeScale(max(4, min(30, fps))))
        cfg.queueDepth = 3; cfg.showsCursor = true
        cfg.pixelFormat = kCVPixelFormatType_32BGRA; cfg.ignoreShadowsSingleWindow = true
        return cfg
    }
    @MainActor func command(_ line: String) {
        let p = line.split(separator: " ").map(String.init)
        switch p.first {
        case "credit": queue.async { self.credit = true; self.encodePending() }
        case "pause": queue.async { self.paused = true; self.pending = nil }
        case "resume": queue.async { self.paused = false; self.encodePending() }
        case "profile":
            if p.count >= 4, let w = Double(p[1]), let f = Int(p[2]), let q = Double(p[3]), w.isFinite, q.isFinite {
                maxWidth = CGFloat(max(320, min(2048, w))); fps = max(4, min(30, f)); quality = max(0.35, min(0.8, q)); configDirty = true
                invalidatePending()
            }
        case "width": if p.count > 1, let w = Double(p[1]), w.isFinite { maxWidth = CGFloat(max(320, min(2048, w))); configDirty = true; invalidatePending() }
        case "fps": if p.count > 1, let f = Int(p[1]) { fps = max(4, min(30, f)); configDirty = true; invalidatePending() }
        default: break
        }
    }
    func invalidatePending() {
        queue.async { self.generation += 1; self.outputMeta = nil; self.pending = nil; self.lastPixel = nil }
    }
    @MainActor func retarget() async {
        guard !retargeting else { return }
        retargeting = true
        defer { retargeting = false }
        guard let wid = frontWindowID(), let bounds = windowGeometry(wid) else {
            queue.async { self.outputMeta = nil; self.pending = nil; self.lastPixel = nil }
            currentID = 0; emitError("no-window"); return
        }
        let targetChanged = wid != currentID
        let sizeChanged = bounds.size != currentBounds.size
        let geometryChanged = bounds != currentBounds
        if !targetChanged && !geometryChanged && !configDirty && stream != nil { return }
        do {
            var active = win
            var filter: SCContentFilter?
            let rebuild = targetChanged || sizeChanged || configDirty || stream == nil
            if rebuild {
                let content = try await SCShareableContent.excludingDesktopWindows(true, onScreenWindowsOnly: true)
                guard let fresh = content.windows.first(where: { $0.windowID == wid }) else { emitError("no-window"); return }
                active = fresh; filter = SCContentFilter(desktopIndependentWindow: fresh)
            }
            guard let w = active else { return }
            let q = quality
            let meta: [String: Any] = ["wid": wid, "x": bounds.minX, "y": bounds.minY, "w": bounds.width, "h": bounds.height,
                "app": w.owningApplication?.applicationName ?? "", "bundle": w.owningApplication?.bundleIdentifier ?? ""]
            // 重配期间先禁用旧帧，防止旧窗口像素配上新窗口几何。
            if rebuild { queue.sync { self.generation += 1; self.outputMeta = nil; self.pending = nil; self.lastPixel = nil } }
            if let f = filter {
                let cfg = config(for: w, scale: CGFloat(f.pointPixelScale))
                if targetChanged, let old = stream {
                    queue.sync { self.acceptedStream = nil }
                    stream = nil
                    try? await old.stopCapture()
                }
                if let s = stream {
                    queue.sync { self.expectedSize = CGSize(width: cfg.width, height: cfg.height) }
                    try await s.updateConfiguration(cfg)
                } else {
                    let s = SCStream(filter: f, configuration: cfg, delegate: self)
                    try s.addStreamOutput(self, type: .screen, sampleHandlerQueue: queue)
                    // 开始前就放好元数据，首个静止画面也不会被丢弃。
                    queue.sync { self.outputMeta = meta; self.outputQuality = q; self.acceptedStream = s; self.expectedSize = CGSize(width: cfg.width, height: cfg.height) }
                    stream = s
                    do { try await s.startCapture() } catch { stream = nil; throw error }
                }
            }
            queue.async {
                if !rebuild { self.generation += 1 }
                self.outputMeta = meta; self.outputQuality = q; self.lastError = ""
                if geometryChanged && !rebuild { self.pending = self.lastPixel; self.captureAt = Int64(Date().timeIntervalSince1970 * 1000) }
                self.encodePending()
            }
            currentID = wid; currentBounds = bounds; win = w; configDirty = false
        } catch { emitError(error.localizedDescription) }
    }
    func emitError(_ error: String) {
        queue.async {
            if self.lastError == error { return }
            self.lastError = error
            self.write(["ok": 0, "err": error])
        }
    }
    func write(_ header: [String: Any], jpg: Data? = nil) {
        var packet = (jsonString(header) + "\n").data(using: .utf8)!
        if let jpg = jpg { packet.append(jpg) }
        do { try out.write(contentsOf: packet) } catch { exit(0) }
    }
    func health() { queue.async { self.write(["ok": 1, "kind": "health"]) } }
    func encodePending() {
        guard !paused, !encoding, (!creditMode || credit), let px = pending, var meta = outputMeta else { return }
        pending = nil; encoding = true; if creditMode { credit = false }
        let version = generation, q = outputQuality, at = captureAt
        encoderQueue.async {
            let began = ProcessInfo.processInfo.systemUptime
            let img = CIImage(cvPixelBuffer: px)
            let cs = CGColorSpace(name: CGColorSpace.sRGB)!
            let jpg = self.ciContext.jpegRepresentation(of: img, colorSpace: cs,
                options: [kCGImageDestinationLossyCompressionQuality as CIImageRepresentationOption: q])
            let ms = (ProcessInfo.processInfo.systemUptime - began) * 1000
            self.queue.async {
                self.encoding = false
                guard version == self.generation, !self.paused, let jpg = jpg else {
                    if self.creditMode { self.credit = true }
                    self.encodePending(); return
                }
                meta["ok"] = 1; meta["bytes"] = jpg.count; meta["pw"] = CVPixelBufferGetWidth(px); meta["ph"] = CVPixelBufferGetHeight(px)
                meta["at"] = at; meta["encodeMs"] = ms; meta["encodedAt"] = Int64(Date().timeIntervalSince1970 * 1000)
                self.write(meta, jpg: jpg); self.encodePending()
            }
        }
    }
    func stream(_ stream: SCStream, didOutputSampleBuffer sb: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .screen, !paused, acceptedStream === stream,
              let atts = CMSampleBufferGetSampleAttachmentsArray(sb, createIfNecessary: false) as? [[SCStreamFrameInfo: Any]],
              let raw = atts.first?[.status] as? Int, SCFrameStatus(rawValue: raw) == .complete,
              let px = CMSampleBufferGetImageBuffer(sb),
              CVPixelBufferGetWidth(px) == Int(expectedSize.width), CVPixelBufferGetHeight(px) == Int(expectedSize.height) else { return }
        // 最多保留最新待编码帧，额度未到时不进行 JPEG 编码。
        lastPixel = px; pending = px; captureAt = Int64(Date().timeIntervalSince1970 * 1000); encodePending()
    }
    func stream(_ stream: SCStream, didStopWithError error: Error) {
        Task { @MainActor in
            if self.stream === stream {
                self.stream = nil; self.currentID = 0; self.configDirty = true
                self.queue.async { self.generation += 1; self.outputMeta = nil; self.pending = nil; self.lastPixel = nil; if self.creditMode { self.credit = true } }
                self.emitError(error.localizedDescription)
            }
        }
    }
}

func streamLoop(_ maxWidth: CGFloat, _ fps: Int, _ quality: Double, _ creditMode: Bool) {
    guard CGPreflightScreenCaptureAccess() else { print(jsonString(["ok": 0, "err": "screen-permission"])); exit(3) }
    let s = WindowStreamer(maxWidth: maxWidth, fps: fps, quality: quality, creditMode: creditMode)
    Thread.detachNewThread {
        while let line = readLine() { DispatchQueue.main.async { s.command(line) } }
        exit(0)
    }
    Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { _ in Task { await s.retarget() } }
    Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { _ in s.health() }
    Task { await s.retarget() }
    RunLoop.main.run()
}


// ---------- H.264 推流（WebRTC 用）：窗口或虚拟扩展屏 ----------

// VideoToolbox 实时编码：Constrained Baseline（老 Safari 也能硬解）、无 B 帧、约 2 秒一个关键帧；输出 Annex-B，关键帧前带 SPS / PPS
final class H264Encoder: @unchecked Sendable {
    var session: VTCompressionSession?
    var width = 0, height = 0, fps = 30, bitrate = 4_000_000
    var forceKey = true
    let onOutput: (Data, Bool) -> Void
    init(onOutput: @escaping (Data, Bool) -> Void) { self.onOutput = onOutput }

    func ensure(_ w: Int, _ h: Int) {
        if session != nil && w == width && h == height { return }
        if let s = session { VTCompressionSessionInvalidate(s); session = nil }
        var s: VTCompressionSession?
        guard VTCompressionSessionCreate(allocator: nil, width: Int32(w), height: Int32(h), codecType: kCMVideoCodecType_H264,
                                         encoderSpecification: [kVTVideoEncoderSpecification_EnableLowLatencyRateControl: true] as CFDictionary,
                                         imageBufferAttributes: nil, compressedDataAllocator: nil, outputCallback: nil, refcon: nil,
                                         compressionSessionOut: &s) == noErr, let sess = s else { return }
        let props: [CFString: Any] = [
            kVTCompressionPropertyKey_RealTime: true,
            kVTCompressionPropertyKey_ProfileLevel: kVTProfileLevel_H264_ConstrainedBaseline_AutoLevel,
            kVTCompressionPropertyKey_AllowFrameReordering: false,
            kVTCompressionPropertyKey_MaxKeyFrameInterval: max(1, fps * 2),
            kVTCompressionPropertyKey_MaxKeyFrameIntervalDuration: 2,
            kVTCompressionPropertyKey_ExpectedFrameRate: fps,
            kVTCompressionPropertyKey_AverageBitRate: bitrate,
        ]
        for (k, v) in props { VTSessionSetProperty(sess, key: k, value: v as CFTypeRef) }
        VTCompressionSessionPrepareToEncodeFrames(sess)
        session = sess; width = w; height = h; forceKey = true
    }
    func setBitrate(_ b: Int) {
        bitrate = b
        if let s = session { VTSessionSetProperty(s, key: kVTCompressionPropertyKey_AverageBitRate, value: b as CFTypeRef) }
    }
    func encode(_ px: CVPixelBuffer, _ pts: CMTime) {
        ensure(CVPixelBufferGetWidth(px), CVPixelBufferGetHeight(px))
        guard let s = session else { return }
        let props: CFDictionary? = forceKey ? [kVTEncodeFrameOptionKey_ForceKeyFrame: true] as CFDictionary : nil
        forceKey = false
        VTCompressionSessionEncodeFrame(s, imageBuffer: px, presentationTimeStamp: pts, duration: .invalid,
                                        frameProperties: props, infoFlagsOut: nil) { [weak self] status, _, sb in
            guard status == noErr, let sb = sb, let self = self else { return }
            self.emit(sb)
        }
    }
    private func emit(_ sb: CMSampleBuffer) {
        let atts = CMSampleBufferGetSampleAttachmentsArray(sb, createIfNecessary: false) as? [[CFString: Any]]
        let key = !((atts?.first?[kCMSampleAttachmentKey_NotSync] as? Bool) ?? false)
        var out = Data()
        let start: [UInt8] = [0, 0, 0, 1]
        if key, let fmt = CMSampleBufferGetFormatDescription(sb) {
            var count = 0
            CMVideoFormatDescriptionGetH264ParameterSetAtIndex(fmt, parameterSetIndex: 0, parameterSetPointerOut: nil, parameterSetSizeOut: nil, parameterSetCountOut: &count, nalUnitHeaderLengthOut: nil)
            for i in 0..<count {
                var p: UnsafePointer<UInt8>?; var n = 0
                if CMVideoFormatDescriptionGetH264ParameterSetAtIndex(fmt, parameterSetIndex: i, parameterSetPointerOut: &p, parameterSetSizeOut: &n, parameterSetCountOut: nil, nalUnitHeaderLengthOut: nil) == noErr, let p = p {
                    out.append(contentsOf: start); out.append(p, count: n)
                }
            }
        }
        guard let bb = CMSampleBufferGetDataBuffer(sb) else { return }
        var total = 0; var ptr: UnsafeMutablePointer<CChar>?
        guard CMBlockBufferGetDataPointer(bb, atOffset: 0, lengthAtOffsetOut: nil, totalLengthOut: &total, dataPointerOut: &ptr) == noErr, let base = ptr else { return }
        var off = 0
        while off + 4 <= total {   // AVCC（4 字节长度）→ Annex-B（起始码）
            var len: UInt32 = 0
            memcpy(&len, base + off, 4); len = CFSwapInt32BigToHost(len); off += 4
            if off + Int(len) > total { break }
            out.append(contentsOf: start)
            base.advanced(by: off).withMemoryRebound(to: UInt8.self, capacity: Int(len)) { out.append($0, count: Int(len)) }
            off += Int(len)
        }
        onOutput(out, key)
    }
}

// 虚拟扩展屏：通过私有类 CGVirtualDisplay 创建（与 DeskPad / BetterDisplay / opendisplay 同一机制），进程退出即移除
final class VirtualDisplay {
    var display: AnyObject?
    var id: CGDirectDisplayID = 0
    init?(pointsW: Int, pointsH: Int, name: String) {
        guard let descCls = NSClassFromString("CGVirtualDisplayDescriptor") as? NSObject.Type,
              let dispCls = NSClassFromString("CGVirtualDisplay") as? NSObject.Type,
              let setCls = NSClassFromString("CGVirtualDisplaySettings") as? NSObject.Type,
              let modeCls = NSClassFromString("CGVirtualDisplayMode") as? NSObject.Type else { return nil }
        let pxW = pointsW * 2, pxH = pointsH * 2
        let desc = descCls.init()
        desc.setValue(DispatchQueue(label: "deck.vdisplay"), forKey: "queue") // 不能用主队列：显示器重配置会和 ScreenCaptureKit 互等
        desc.setValue(name, forKey: "name")
        desc.setValue(NSNumber(value: UInt32(pxW)), forKey: "maxPixelsWide")
        desc.setValue(NSNumber(value: UInt32(pxH)), forKey: "maxPixelsHigh")
        desc.setValue(NSValue(size: NSSize(width: Double(pxW) / 264 * 25.4, height: Double(pxH) / 264 * 25.4)), forKey: "sizeInMillimeters")
        desc.setValue(NSNumber(value: UInt32(0xD0)), forKey: "serialNum")
        desc.setValue(NSNumber(value: UInt32(0x1234)), forKey: "productID")
        desc.setValue(NSNumber(value: UInt32(0x3456)), forKey: "vendorID")
        desc.setValue(NSValue(point: NSPoint(x: 0.3125, y: 0.3291)), forKey: "whitePoint")
        desc.setValue(NSValue(point: NSPoint(x: 0.6797, y: 0.3203)), forKey: "redPrimary")
        desc.setValue(NSValue(point: NSPoint(x: 0.2559, y: 0.6983)), forKey: "greenPrimary")
        desc.setValue(NSValue(point: NSPoint(x: 0.1494, y: 0.0557)), forKey: "bluePrimary")
        guard let allocated = dispCls.perform(NSSelectorFromString("alloc"))?.takeUnretainedValue(),
              let disp = allocated.perform(NSSelectorFromString("initWithDescriptor:"), with: desc)?.takeUnretainedValue() else { return nil }
        // CGVirtualDisplayMode initWithWidth:height:refreshRate:（unsigned int, unsigned int, double）
        typealias InitMode = @convention(c) (AnyObject, Selector, UInt32, UInt32, Double) -> Unmanaged<AnyObject>
        let sel = NSSelectorFromString("initWithWidth:height:refreshRate:")
        guard let m = class_getInstanceMethod(modeCls, sel), let modeAlloc = modeCls.perform(NSSelectorFromString("alloc"))?.takeUnretainedValue() else { return nil }
        let mode = unsafeBitCast(method_getImplementation(m), to: InitMode.self)(modeAlloc, sel, UInt32(pointsW), UInt32(pointsH), 60).takeUnretainedValue()
        let settings = setCls.init()
        settings.setValue(NSNumber(value: UInt32(1)), forKey: "hiDPI")
        settings.setValue([mode], forKey: "modes")
        typealias Apply = @convention(c) (AnyObject, Selector, AnyObject) -> Bool
        let applySel = NSSelectorFromString("applySettings:")
        guard let am = class_getInstanceMethod(dispCls, applySel),
              unsafeBitCast(method_getImplementation(am), to: Apply.self)(disp, applySel, settings) else { return nil }
        display = disp
        id = (disp.value(forKey: "displayID") as? NSNumber)?.uint32Value ?? 0
        if id == 0 { return nil }
    }
}

final class H264Streamer: NSObject, SCStreamOutput, SCStreamDelegate, @unchecked Sendable {
    var maxWidth: CGFloat, fps: Int
    let encoder: H264Encoder
    let virtualSize: (Int, Int)?
    var vdisplay: VirtualDisplay?
    var stream: SCStream?
    var currentID: UInt32 = 0
    var currentBounds = CGRect.null
    var meta: [String: Any] = [:]
    var lastPixel: CVPixelBuffer?
    var paused = false, dirty = true, retargeting = false, missCount = 0
    let queue = DispatchQueue(label: "deck.h264")
    let out = FileHandle.standardOutput
    let t0 = CACurrentMediaTime()

    init(maxWidth: CGFloat, fps: Int, kbps: Int, virtualSize: (Int, Int)?) {
        self.maxWidth = maxWidth; self.fps = fps; self.virtualSize = virtualSize
        var me: H264Streamer?
        encoder = H264Encoder { data, key in me?.emit(data, key) }
        super.init()
        me = self
        encoder.fps = fps; encoder.bitrate = kbps * 1000
    }
    func write(_ header: [String: Any], _ body: Data? = nil) {
        var packet = (jsonString(header) + "\n").data(using: .utf8)!
        if let b = body { packet.append(b) }
        do { try out.write(contentsOf: packet) } catch { exit(0) }
    }
    func emit(_ data: Data, _ key: Bool) {
        queue.async {
            var h = self.meta
            h["ok"] = 1; h["h264"] = 1; h["key"] = key; h["bytes"] = data.count
            h["pw"] = self.encoder.width; h["ph"] = self.encoder.height
            h["pts"] = Int((CACurrentMediaTime() - self.t0) * 90000) & 0xFFFFFFFF
            self.write(h, data)
        }
    }
    // 扩展屏：把 Mac 前台应用的当前窗口移到 iPad 虚拟显示器（bring），或送回主显示器（home）。
    func moveFrontWindow(toVirtual: Bool) {
        guard let vd = vdisplay, let app = NSWorkspace.shared.frontmostApplication else { write(["ok": 1, "kind": "moved", "done": false]); return }
        let target = CGDisplayBounds(toVirtual ? vd.id : CGMainDisplayID())
        let el = AXUIElementCreateApplication(app.processIdentifier)
        var ref: CFTypeRef?
        guard AXUIElementCopyAttributeValue(el, kAXFocusedWindowAttribute as CFString, &ref) == .success, let win = ref else {
            write(["ok": 1, "kind": "moved", "done": false]); return
        }
        let w = win as! AXUIElement
        let top: CGFloat = toVirtual ? 0 : 30 // 主显示器留出菜单栏
        var origin = CGPoint(x: target.minX, y: target.minY + top)
        var size = CGSize(width: target.width, height: target.height - top)
        if let pv = AXValueCreate(.cgPoint, &origin) { AXUIElementSetAttributeValue(w, kAXPositionAttribute as CFString, pv) }
        if let sv = AXValueCreate(.cgSize, &size) { AXUIElementSetAttributeValue(w, kAXSizeAttribute as CFString, sv) }
        // 有的窗口先改尺寸才能完全放进目标显示器：再定位一次
        if let pv = AXValueCreate(.cgPoint, &origin) { AXUIElementSetAttributeValue(w, kAXPositionAttribute as CFString, pv) }
        write(["ok": 1, "kind": "moved", "done": true, "app": app.localizedName ?? ""])
    }
    func encodeLast() { if let px = lastPixel { encoder.encode(px, CMTime(seconds: CACurrentMediaTime() - t0, preferredTimescale: 90000)) } }
    func command(_ line: String) {
        let p = line.split(separator: " ").map(String.init)
        switch p.first {
        case "kf": queue.async { self.encoder.forceKey = true; self.encodeLast() }
        case "bitrate": if p.count > 1, let v = Int(p[1]) { queue.async { self.encoder.setBitrate(max(300, min(20000, v)) * 1000) } }
        case "profile":
            if p.count >= 4, let w = Double(p[1]), let f = Int(p[2]), let k = Int(p[3]) {
                maxWidth = CGFloat(max(480, min(2560, w))); fps = max(5, min(60, f)); dirty = true
                queue.async { self.encoder.fps = self.fps; self.encoder.setBitrate(max(300, min(20000, k)) * 1000) }
            }
        case "bring", "home": DispatchQueue.main.async { self.moveFrontWindow(toVirtual: p.first == "bring") }
        case "pause": queue.async { self.paused = true }
        case "resume": queue.async { self.paused = false; self.encoder.forceKey = true; self.encodeLast() }
        default: break
        }
    }
    @MainActor func retarget() async {
        guard !retargeting else { return }
        retargeting = true; defer { retargeting = false }
        do {
            let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
            var filter: SCContentFilter, bounds: CGRect, newID: UInt32, info: [String: Any]
            if let vd = vdisplay {
                guard let d = content.displays.first(where: { $0.displayID == vd.id }) else {
                    missCount += 1
                    if missCount % 8 == 1 { dbg("virtual \(vd.id) not in SCK displays \(content.displays.map { $0.displayID })") }
                    return
                }
                bounds = CGDisplayBounds(vd.id); newID = vd.id
                if newID == currentID && bounds == currentBounds && !dirty && stream != nil { return }
                filter = SCContentFilter(display: d, excludingWindows: [])
                info = ["wid": 0, "disp": vd.id, "x": bounds.minX, "y": bounds.minY, "w": bounds.width, "h": bounds.height, "app": "扩展屏", "bundle": ""]
            } else {
                guard let wid = frontWindowID(), let b = windowGeometry(wid) else { return }
                bounds = b; newID = wid
                if newID == currentID && bounds == currentBounds && !dirty && stream != nil { return }
                guard let w = content.windows.first(where: { $0.windowID == wid }) else { return }
                filter = SCContentFilter(desktopIndependentWindow: w)
                info = ["wid": wid, "x": b.minX, "y": b.minY, "w": b.width, "h": b.height,
                        "app": w.owningApplication?.applicationName ?? "", "bundle": w.owningApplication?.bundleIdentifier ?? ""]
            }
            let cfg = SCStreamConfiguration()
            let scale = CGFloat(filter.pointPixelScale)
            let pxW = min(maxWidth, bounds.width * scale)
            cfg.width = max(2, Int(pxW) & ~1)
            cfg.height = max(2, Int(pxW * bounds.height / bounds.width) & ~1)
            cfg.minimumFrameInterval = CMTime(value: 1, timescale: CMTimeScale(fps))
            cfg.queueDepth = 5; cfg.showsCursor = true
            cfg.pixelFormat = kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange
            cfg.ignoreShadowsSingleWindow = true
            let rebuild = newID != currentID || stream == nil
            if rebuild, let old = stream { stream = nil; try? await old.stopCapture() }
            queue.sync { self.meta = info; self.lastPixel = nil }
            if let s = stream { try await s.updateConfiguration(cfg) }
            else {
                let s = SCStream(filter: filter, configuration: cfg, delegate: self)
                try s.addStreamOutput(self, type: .screen, sampleHandlerQueue: queue)
                stream = s
                try await s.startCapture()
            }
            currentID = newID; currentBounds = bounds; dirty = false
            queue.async { self.encoder.forceKey = true; self.write(["ok": 1, "kind": "meta"].merging(info) { a, _ in a }) }
        } catch {
            write(["ok": 0, "err": error.localizedDescription])
        }
    }
    func stream(_ stream: SCStream, didOutputSampleBuffer sb: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .screen, !paused,
              let atts = CMSampleBufferGetSampleAttachmentsArray(sb, createIfNecessary: false) as? [[SCStreamFrameInfo: Any]],
              let raw = atts.first?[.status] as? Int, SCFrameStatus(rawValue: raw) == .complete,
              let px = CMSampleBufferGetImageBuffer(sb) else { return }
        lastPixel = px
        encoder.encode(px, CMTime(seconds: CACurrentMediaTime() - t0, preferredTimescale: 90000))
    }
    func stream(_ stream: SCStream, didStopWithError error: Error) {
        Task { @MainActor in if self.stream === stream { self.stream = nil; self.currentID = 0 } }
        write(["ok": 0, "err": error.localizedDescription])
    }
}

func dbg(_ m: String) { if ProcessInfo.processInfo.environment["DECK_DEBUG"] != nil { FileHandle.standardError.write((m + "\n").data(using: .utf8)!) } }

func h264Loop(_ args: [String]) {
    guard CGPreflightScreenCaptureAccess() else { print(jsonString(["ok": 0, "err": "screen-permission"])); exit(3) }
    let w = CGFloat(Double(args.count > 0 ? args[0] : "1600") ?? 1600)
    let fps = Int(args.count > 1 ? args[1] : "30") ?? 30
    let kbps = Int(args.count > 2 ? args[2] : "4000") ?? 4000
    var vsize: (Int, Int)? = nil
    if args.count > 4, args[3] == "virtual" {
        let d = args[4].split(separator: "x").compactMap { Int($0) }
        if d.count == 2, d[0] >= 320, d[1] >= 320, d[0] <= 2732, d[1] <= 2732 { vsize = (d[0], d[1]) }
    }
    let s = H264Streamer(maxWidth: w, fps: fps, kbps: kbps, virtualSize: vsize)
    if let v = vsize {
        guard let vd = VirtualDisplay(pointsW: v.0, pointsH: v.1, name: "iPadDuo") else {
            print(jsonString(["ok": 0, "err": "virtual-display-unavailable"])); exit(4)
        }
        s.vdisplay = vd
        s.write(["ok": 1, "kind": "virtual", "disp": vd.id])
    }
    Thread.detachNewThread {
        while let line = readLine() { DispatchQueue.main.async { s.command(line) } }
        exit(0)
    }
    Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { _ in Task { await s.retarget() } }
    Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { _ in s.queue.async { s.write(["ok": 1, "kind": "health"]) } }
    Task { await s.retarget() }
    RunLoop.main.run()
}

// ---------- 二维码 ----------

func makeQR(_ text: String, _ output: String) -> Bool {
    guard let f = CIFilter(name: "CIQRCodeGenerator") else { return false }
    f.setValue(text.data(using: .utf8), forKey: "inputMessage")
    f.setValue("M", forKey: "inputCorrectionLevel")
    guard let img = f.outputImage?.transformed(by: CGAffineTransform(scaleX: 12, y: 12)) else { return false }
    let rep = NSBitmapImageRep(ciImage: img)
    guard let png = rep.representation(using: .png, properties: [:]) else { return false }
    return (try? png.write(to: URL(fileURLWithPath: output))) != nil
}

// ---------- 触控板：常驻进程，逐行读取指令 ----------

func displayBounds() -> CGRect {
    var count: UInt32 = 0
    CGGetActiveDisplayList(0, nil, &count)
    var ids = [CGDirectDisplayID](repeating: 0, count: Int(count))
    CGGetActiveDisplayList(count, &ids, &count)
    return ids.reduce(CGRect.null) { $0.union(CGDisplayBounds($1)) }
}

func cursor() -> CGPoint { CGEvent(source: nil)?.location ?? .zero }

func frontmostBundle() -> String {
    // 用窗口列表找最前面的普通窗口（不需要屏幕录制权限，长驻进程里也不会过期）
    let list = (CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]]) ?? []
    for w in list where (w[kCGWindowLayer as String] as? Int) == 0 {
        if let pid = w[kCGWindowOwnerPID as String] as? pid_t,
           let app = NSRunningApplication(processIdentifier: pid), let b = app.bundleIdentifier {
            return b + "\t" + (app.localizedName ?? "")
        }
    }
    return ""
}

func serve() {
    var buttonDown: [CGMouseButton: Bool] = [:]
    var clickCounts: [CGMouseButton: Int64] = [:]
    var keysDown = Set<String>()
    let src = CGEventSource(stateID: .hidSystemState)
    func post(_ type: CGEventType, _ pt: CGPoint, _ button: CGMouseButton, clicks: Int64 = 1) {
        guard let e = CGEvent(mouseEventSource: src, mouseType: type, mouseCursorPosition: pt, mouseButton: button) else { return }
        e.setIntegerValueField(.mouseEventClickState, value: clicks)
        e.post(tap: .cghidEventTap)
    }
    func btn(_ s: String) -> CGMouseButton { s == "right" ? .right : .left }
    // 一次完整的点击：先让指针停稳，再按下、保持片刻后松开。
    // 三个事件在同一微秒内发出时，WebKit 等应用偶尔会把按下和松开当成噪声丢掉（实测约 1/4 的点击无效）。
    func clickSeq(_ p: CGPoint?, _ b: CGMouseButton, _ n: Int64) {
        let at = p ?? cursor()
        if p != nil { post(.mouseMoved, at, b); usleep(12_000) }
        post(b == .right ? .rightMouseDown : .leftMouseDown, at, b, clicks: n)
        usleep(35_000)
        post(b == .right ? .rightMouseUp : .leftMouseUp, at, b, clicks: n)
    }
    defer {
        for (b, down) in buttonDown where down { post(b == .right ? .rightMouseUp : .leftMouseUp, cursor(), b) }
        for k in keysDown { _ = postKeyState(k, down: false) }
    }
    setvbuf(stdout, nil, _IOLBF, 0)
    while let line = readLine() {
        let parts = line.split(separator: " ", maxSplits: 1).map(String.init)
        guard let cmd = parts.first else { continue }
        let rest = parts.count > 1 ? parts[1] : ""
        let nums = rest.split(separator: " ").compactMap { Double($0) }
        switch cmd {
        case "move":
            guard nums.count == 2 else { continue }
            let b = displayBounds()
            var p = cursor()
            p.x = min(max(p.x + nums[0], b.minX), b.maxX - 1)
            p.y = min(max(p.y + nums[1], b.minY), b.maxY - 1)
            let type: CGEventType = buttonDown[.left] == true ? .leftMouseDragged : (buttonDown[.right] == true ? .rightMouseDragged : .mouseMoved)
            post(type, p, buttonDown[.right] == true ? .right : .left)
        case "click":
            let sub = rest.split(separator: " ").map(String.init)
            let b = btn(sub.first ?? "left"), n = Int64(sub.count > 1 ? Int(sub[1]) ?? 1 : 1)
            for i in 1...max(1, n) { clickSeq(nil, b, i); if i < n { usleep(40_000) } }
        case "down", "up":
            let sub = rest.split(separator: " ").map(String.init)
            let b = btn(sub.first ?? "left")
            if cmd == "down" { clickCounts[b] = sub.count > 1 && sub[1] == "2" ? 2 : 1 }
            buttonDown[b] = cmd == "down"
            post(cmd == "down" ? (b == .right ? .rightMouseDown : .leftMouseDown) : (b == .right ? .rightMouseUp : .leftMouseUp), cursor(), b, clicks: clickCounts[b] ?? 1)
        case "clickwin", "downwin", "movewin", "scrollwin", "hoverwin":
            let a = rest.split(separator: " ").map(String.init)
            guard a.count == 12, let id = UInt32(a[0]), let x = Double(a[1]), let y = Double(a[2]),
                  let width = Double(a[3]), let height = Double(a[4]), let nx = Double(a[5]), let ny = Double(a[6]),
                  let sx = Double(a[9]), let sy = Double(a[10]), [x,y,width,height,nx,ny,sx,sy].allSatisfy({ $0.isFinite }),
                  width > 0, height > 0, (0...1).contains(nx), (0...1).contains(ny), abs(sx) <= 3000, abs(sy) <= 3000 else { continue }
            var bounds = CGRect(x: x, y: y, width: width, height: height)
            if id == 0 {
                // 扩展屏（整块虚拟显示器）：区域必须仍是一块在线显示器
                guard activeDisplayBounds().contains(where: { abs($0.minX - x) <= 1 && abs($0.minY - y) <= 1 && abs($0.width - width) <= 1 }) else {
                    print("inputerr\t" + a[11] + "\tstale-frame"); continue
                }
            } else {
                // 只要求「最前面的应用」就是这个窗口的应用：同一应用弹出的悬停卡片、提示框不会让点击失效
                guard let g = windowGeometry(id), let owner = windowOwnerPID(id), let fw = frontWindowID(), windowOwnerPID(fw) == owner,
                      abs(g.minX - x) <= 1, abs(g.minY - y) <= 1, abs(g.width - width) <= 1, abs(g.height - height) <= 1 else {
                    print("inputerr\t" + a[11] + "\tstale-frame"); continue
                }
                bounds = g
            }
            if cmd == "hoverwin" {
                if buttonDown[.left] != true { post(.mouseMoved, CGPoint(x: bounds.minX + nx * bounds.width, y: bounds.minY + ny * bounds.height), .left) }
                continue
            }
            let p = CGPoint(x: bounds.minX + nx * bounds.width, y: bounds.minY + ny * bounds.height)
            if (cmd == "clickwin" || cmd == "downwin"), id != 0, let owner = windowOwnerPID(id), let other = coveringWindow(at: p, owner: owner) {
                print("inputerr\t" + a[11] + "\tcovered:" + other); continue
            }
            let b = btn(a[7]), n: Int64 = a[8] == "2" ? 2 : 1
            if cmd == "clickwin" {
                clickSeq(p, b, n)
            } else if cmd == "downwin" {
                buttonDown[b] = true; clickCounts[b] = 1; post(.mouseMoved, p, b)
                post(b == .right ? .rightMouseDown : .leftMouseDown, p, b)
            } else if cmd == "movewin" {
                if buttonDown[.left] == true { post(.leftMouseDragged, p, .left) }
            } else {
                post(.mouseMoved, p, .left)
                CGEvent(scrollWheelEvent2Source: src, units: .pixel, wheelCount: 2, wheel1: Int32(sy), wheel2: Int32(sx), wheel3: 0)?.post(tap: .cghidEventTap)
            }
        case "scroll":
            guard nums.count == 2, let e = CGEvent(scrollWheelEvent2Source: src, units: .pixel, wheelCount: 2,
                                                   wheel1: Int32(nums[1]), wheel2: Int32(nums[0]), wheel3: 0) else { continue }
            e.post(tap: .cghidEventTap)
        case "moveto":
            guard nums.count == 2 else { continue }
            post(buttonDown[.left] == true ? .leftMouseDragged : .mouseMoved, CGPoint(x: nums[0], y: nums[1]), .left)
        case "clickat":
            // clickat x y button n：n 是本次点击的连击序号（第二下传 2 即构成双击）
            let sub = rest.split(separator: " ").map(String.init)
            guard sub.count >= 3, let x = Double(sub[0]), let y = Double(sub[1]) else { continue }
            let b = btn(sub[2]), n = Int64(sub.count > 3 ? Int(sub[3]) ?? 1 : 1)
            clickSeq(CGPoint(x: x, y: y), b, n)
        case "downat", "upat":
            let sub = rest.split(separator: " ").map(String.init)
            guard sub.count >= 3, let x = Double(sub[0]), let y = Double(sub[1]) else { continue }
            let b = btn(sub[2]), p = CGPoint(x: x, y: y), down = cmd == "downat"
            buttonDown[b] = down
            if down { post(.mouseMoved, p, b) }
            post(down ? (b == .right ? .rightMouseDown : .leftMouseDown) : (b == .right ? .rightMouseUp : .leftMouseUp), p, b)
        case "scrollat":
            guard nums.count == 4 else { continue }
            post(.mouseMoved, CGPoint(x: nums[0], y: nums[1]), .left)
            if let e = CGEvent(scrollWheelEvent2Source: src, units: .pixel, wheelCount: 2, wheel1: Int32(nums[3]), wheel2: Int32(nums[2]), wheel3: 0) {
                e.post(tap: .cghidEventTap)
            }
        case "key":
            _ = postKey(rest)
        case "keydown", "keyup":
            if cmd == "keydown" { keysDown.insert(rest) } else { keysDown.remove(rest) }
            _ = postKeyState(rest, down: cmd == "keydown")
        case "text":
            let utf16 = Array(rest.utf16)
            var i = 0
            while i < utf16.count {
                let chunk = Array(utf16[i..<min(i + 16, utf16.count)])
                for down in [true, false] {
                    guard let e = CGEvent(keyboardEventSource: src, virtualKey: 0, keyDown: down) else { continue }
                    chunk.withUnsafeBufferPointer { e.keyboardSetUnicodeString(stringLength: chunk.count, unicodeString: $0.baseAddress) }
                    e.post(tap: .cghidEventTap)
                }
                i += 16
            }
        case "front":
            print("front\t" + rest + "\t" + frontmostBundle())
        default:
            continue
        }
    }
}

// 只按下或只松开（按住说话类的语音输入键）。支持单独的修饰键：ropt / lopt / rcmd / rctrl / rshift / fn
let modifierKeyCodes: [String: (CGKeyCode, CGEventFlags)] = [
    "ropt": (61, .maskAlternate), "lopt": (58, .maskAlternate), "opt": (58, .maskAlternate),
    "rcmd": (54, .maskCommand), "cmd": (55, .maskCommand), "rctrl": (62, .maskControl), "ctrl": (59, .maskControl),
    "rshift": (60, .maskShift), "shift": (56, .maskShift), "fn": (63, .maskSecondaryFn),
]
func postKeyState(_ combo: String, down: Bool) -> Bool {
    let k = combo.lowercased().trimmingCharacters(in: .whitespaces)
    let src = CGEventSource(stateID: .hidSystemState)
    if let (code, flag) = modifierKeyCodes[k] {
        guard let e = CGEvent(keyboardEventSource: src, virtualKey: code, keyDown: down) else { return false }
        e.type = .flagsChanged
        e.flags = down ? flag : []
        e.post(tap: .cghidEventTap)
        return true
    }
    var flags: CGEventFlags = []
    var key: CGKeyCode?
    for part in k.split(separator: "+").map(String.init) {
        if let f = modifierFlags[part] { flags.insert(f) } else if let c = keyCodes[part] { key = c } else { return false }
    }
    guard let code = key, let e = CGEvent(keyboardEventSource: src, virtualKey: code, keyDown: down) else { return false }
    e.flags = flags
    e.post(tap: .cghidEventTap)
    return true
}

let args = CommandLine.arguments
guard args.count >= 2 else { print("usage: deckctl media|key|trusted"); exit(2) }

switch args[1] {
case "media":
    let codes: [String: Int32] = ["playpause": 16, "next": 17, "prev": 18]
    guard args.count > 2, let c = codes[args[2]] else { exit(2) }
    postMedia(c)
case "key":
    guard args.count > 2, postKey(args[2]) else { FileHandle.standardError.write("unknown key\n".data(using: .utf8)!); exit(3) }
case "trusted":
    print(AXIsProcessTrusted() ? "yes" : "no")
case "prompt":
    // 弹出系统授权对话框，并把调用方（运行服务的 node）自动加入「辅助功能」列表
    let opts = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
    print(AXIsProcessTrustedWithOptions(opts) ? "yes" : "no")
case "capture":
    captureLoop()
case "stream":
    streamLoop(CGFloat(Double(args.count > 2 ? args[2] : "1280") ?? 1280), Int(args.count > 3 ? args[3] : "15") ?? 15, Double(args.count > 4 ? args[4] : "0.6") ?? 0.6, args.count > 5 && args[5] == "credit")
case "h264":
    h264Loop(Array(args.dropFirst(2)))
case "screenperm":
    print(CGPreflightScreenCaptureAccess() ? "yes" : "no")
    exit(0)
case "screenprompt":
    print(CGRequestScreenCaptureAccess() ? "yes" : "no")
    exit(0)
case "sidecar":
    exit(sidecar(Array(args.dropFirst(2))))
case "qr":
    guard args.count > 3, makeQR(args[2], args[3]) else { exit(1) }
    exit(0)
case "serve":
    serve()
    exit(0)
case "menu":
    guard args.count > 3 else { exit(2) }
    exit(pressMenu(args[2], args[3]))
case "menupath":
    guard args.count > 3 else { exit(2) }
    exit(pressMenuPath(args[2], Array(args[3...])))
case "composer":
    guard args.count > 3 else { exit(2) }
    exit(composer(args[2], args[3], args.count > 4 ? args[4] : ""))
case "axfocus":
    guard args.count > 2 else { exit(2) }
    exit(focusComposer(args[2]))
case "axbutton":
    guard args.count > 3, let b = findButton(args[2], args[3]) else { exit(4) }
    print(axLabel(b))
    exit(0)
case "axpopup":
    guard args.count > 3, let m = popupMenu(args[2], args[3]) else { exit(4) }
    for it in menuEntries(m) { print((it.checked ? "✓" : "") + "\t" + (it.enabled ? "" : "(禁用)") + "\t" + it.title) }
    exit(0)
case "axmenu":
    guard args.count > 2, let m = openMenu(args[2]) else { exit(4) }
    for it in menuEntries(m) { print((it.checked ? "✓" : "") + "\t" + (it.enabled ? "" : "(禁用)") + "\t" + it.title) }
    exit(0)
case "axpick":
    guard args.count > 3, let m = openMenu(args[2]) else { exit(4) }
    guard let it = menuEntries(m).first(where: { $0.title == args[3] && $0.enabled }) else { exit(4) }
    _ = AXUIElementPerformAction(it.el, kAXPressAction as CFString)
    usleep(300_000)
    // 菜单还开着说明「按下」没生效，改为真实点击
    if visibleMenus(args[2]).contains(where: { CFEqual($0, m) }) { _ = clickElement(it.el) }
    exit(0)
case "axcancel":
    guard args.count > 2, let m = openMenu(args[2]) else { exit(4) }
    exit(AXUIElementPerformAction(m, kAXCancelAction as CFString) == .success ? 0 : 6)
case "axpress":
    guard args.count > 3 else { exit(2) }
    exit(pressButton(args[2], args[3]))
case "menus":
    guard args.count > 2, let app = appElement(args[2]) else { exit(5) }
    for m in menuItems(app) { print((m.enabled ? "" : "(禁用) ") + m.path) }
    exit(0)
case "texts":
    guard args.count > 2 else { exit(2) }
    windowTexts(args[2]).forEach { print($0) }
    exit(0)
case "running":
    guard args.count > 2 else { exit(2) }
    print(NSRunningApplication.runningApplications(withBundleIdentifier: args[2]).isEmpty ? "no" : "yes")
    exit(0)
case "blur":
    guard args.count > 3, blurArtwork(args[2], args[3]) else { exit(1) }
    exit(0)
case "color":
    guard args.count > 2 else { exit(2) }
    print(iconColor(args[2]))
    exit(0)
default:
    exit(2)
}
usleep(20000) // 给事件系统一点时间投递
