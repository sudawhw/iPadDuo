#!/usr/bin/env node
// iPadDuo — Mac 端服务。零依赖，Node >= 18。
// iPad 通过局域网访问本服务的网页，点击磁贴后由本机执行对应动作。
'use strict';

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile, spawn } = require('child_process');

const PORT = parseInt(process.env.PORT || '8780', 10);
const HOME = os.homedir();
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA = path.join(ROOT, 'data');
const CONFIG_FILE = path.join(DATA, 'config.json');
const ICON_CACHE = path.join(ROOT, 'cache', 'icons');

fs.mkdirSync(DATA, { recursive: true });
fs.mkdirSync(ICON_CACHE, { recursive: true });

// ---------- helpers ----------

function run(cmd, args, opts) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, Object.assign({ timeout: 15000, maxBuffer: 8 * 1024 * 1024 }, opts), (err, stdout, stderr) => {
      if (err) {
        err.message = (stderr && stderr.trim()) || err.message;
        return reject(err);
      }
      resolve(stdout);
    });
  });
}

function osa(script) {
  return run('/usr/bin/osascript', ['-e', script]);
}

function jxa(script, args) {
  return run('/usr/bin/osascript', ['-l', 'JavaScript', '-e', script].concat(args || []));
}

function expandHome(p) {
  if (!p) return p;
  if (p === '~') return HOME;
  if (p.startsWith('~/')) return path.join(HOME, p.slice(2));
  return p;
}

function uid() {
  return crypto.randomBytes(5).toString('hex');
}

function asStr(s) {
  return JSON.stringify(String(s)); // AppleScript 与 JSON 的字符串转义兼容（双引号 + 反斜杠）
}

// ---------- apps ----------

const APP_DIRS = [
  '/Applications',
  '/Applications/Utilities',
  '/System/Applications',
  '/System/Applications/Utilities',
  '/System/Library/CoreServices/Applications',
  path.join(HOME, 'Applications'),
];

let appCache = null;
let appCacheAt = 0;

function listApps() {
  if (appCache && Date.now() - appCacheAt < 60000) return appCache;
  const seen = new Map();
  const scan = (dir, depth) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      if (e.name.endsWith('.app')) {
        const name = e.name.slice(0, -4);
        if (!seen.has(name)) seen.set(name, full);
      } else if (depth > 0 && (e.isDirectory() || e.isSymbolicLink())) {
        scan(full, depth - 1);
      }
    }
  };
  APP_DIRS.forEach((d) => scan(d, 1));
  if (!seen.has('Finder')) seen.set('Finder', '/System/Library/CoreServices/Finder.app');
  appCache = Array.from(seen, ([name, p]) => ({ name, path: p })).sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  appCacheAt = Date.now();
  return appCache;
}

// 系统语言下的应用显示名（如 Calculator → 计算器），通过 Spotlight 一次性批量读取
async function listAppsLocalized() {
  const apps = listApps();
  if (apps.localized) return apps;
  const out = await run('/usr/bin/mdls', ['-name', 'kMDItemDisplayName', '-raw'].concat(apps.map((a) => a.path))).catch(() => '');
  const names = out.split('\0');
  if (names.length >= apps.length) {
    apps.forEach((a, i) => {
      const d = (names[i] || '').replace(/\.app$/, '').trim();
      if (d && d !== '(null)' && d !== a.name) a.display = d;
    });
  }
  apps.localized = true;
  return apps;
}

function resolveAppPath(target) {
  if (!target) return null;
  const t = expandHome(target);
  if (t.includes('/')) return fs.existsSync(t) ? t : null;
  const lower = t.toLowerCase().replace(/\.app$/, '');
  const hit = listApps().find((a) => a.name.toLowerCase() === lower);
  return hit ? hit.path : null;
}

function isBundleId(s) {
  return /^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+){2,}$/.test(s) && !s.includes(' ');
}

// ---------- config ----------

const DEFAULT_SETTINGS = {
  pin: '', showDock: true, columns: 0,
  keepAwake: true,        // iPad 屏幕常亮
  autoLyrics: true,       // 播放音乐时自动进入歌词页
  lyricsOnline: true,     // 联网查询歌词（会把歌名发给 QQ 音乐 / 网易云 / LRCLIB）
  nowPlaying: 'auto',     // 播放信息来源：auto（QQ 音乐 / Apple Music）| music | system | off
  voiceKey: 'fn',         // 面板「按住说话」按住的 Mac 键（豆包 / 微信输入法默认是 fn）
  autoStage: true,        // 点开磁贴后自动显示对应控件（半屏控件 / 网页的观看、阅读、浏览视图）
  folderBrowser: true,    // 点开文件夹磁贴：在 iPad 上分栏浏览（false = 直接在 Mac 上打开）
};

// 「Mac 状态」页：系统状态与小组件（v4 起的首页）
function statusPage() {
  const soon = new Date(Date.now() + 30 * 86400000);
  const ymd = soon.getFullYear() + '-' + String(soon.getMonth() + 1).padStart(2, '0') + '-' + String(soon.getDate()).padStart(2, '0');
  return {
    id: uid(), name: 'Mac 状态', tiles: [
      // 6 列 × 3 行正好排满：状态 2×2、AI 2×2、时钟 2×1、待办 1×2、倒计时、网络 2×1、内存、CPU、磁盘
      { id: uid(), type: 'widget', target: 'system', label: 'Mac 状态', color: 'auto', size: 'l' },
      { id: uid(), type: 'widget', target: 'ai', label: 'AI 用量', color: 'auto', size: 'l' },
      { id: uid(), type: 'widget', target: 'clock', label: '时钟', color: 'auto', size: 'w' },
      { id: uid(), type: 'widget', target: 'todo', label: '待办', color: 'auto', size: 't',
        items: [{ text: '点一下完成这一项', done: false }, { text: '长按磁贴编辑待办', done: false }] },
      { id: uid(), type: 'widget', target: 'countdown', label: '倒计时', date: ymd, color: 'auto', size: 's' },
      { id: uid(), type: 'widget', target: 'net', label: '网络', color: 'auto', size: 'w' },
      { id: uid(), type: 'widget', target: 'mem', label: '内存', color: 'auto', size: 's' },
      { id: uid(), type: 'widget', target: 'cpu', label: 'CPU', color: 'auto', size: 's' },
      { id: uid(), type: 'widget', target: 'disk', label: '磁盘', color: 'auto', size: 's' },
    ],
  };
}

function defaultConfig() {
  const has = (n) => !!resolveAppPath(n);
  const pick = (cands) => cands.find(has);
  const appTiles = [];
  const NICE = { WeChat: '微信', 'Visual Studio Code': 'VS Code', 'System Settings': '系统设置', 'System Preferences': '系统设置',
    Notes: '备忘录', Music: '音乐', Terminal: '终端', Finder: '访达', QQMusic: 'QQ音乐', NeteaseMusic: '网易云音乐' };
  const addApp = (cands, sub, color, size) => {
    const n = pick(cands);
    if (n) appTiles.push({ id: uid(), type: 'app', label: NICE[n] || n.replace(/^Google /, '').replace(/^Microsoft /, ''), sub, target: n, color, size: size || 's' });
  };
  addApp(['ChatGPT'], 'AI 工作台', 'auto', 'w');
  addApp(['Claude'], 'AI 助手', 'auto');
  addApp(['Google Chrome'], '浏览与工作', 'auto');
  addApp(['Microsoft Edge'], '浏览与搜索', 'auto');
  addApp(['Safari'], '浏览器', 'auto');
  addApp(['WeChat', '微信'], '消息与协作', 'auto');
  addApp(['Visual Studio Code', 'Cursor', 'Xcode'], '写代码', 'auto');
  addApp(['Terminal', 'iTerm', 'Ghostty', 'Warp'], '命令行', 'auto');
  addApp(['Finder'], '文件', 'auto');
  addApp(['Notes', '备忘录'], '随手记', 'auto');
  addApp(['Music', 'Spotify', 'QQMusic', 'NeteaseMusic'], '音乐', 'auto');
  addApp(['System Settings', 'System Preferences'], '系统设置', 'auto');

  return {
    version: 4,
    settings: Object.assign({}, DEFAULT_SETTINGS),
    pages: [
      statusPage(),
      { id: uid(), name: '常用应用', tiles: appTiles },
      {
        id: uid(), name: '网页', tiles: [
          { id: uid(), type: 'url', label: 'YouTube', sub: '视频', target: 'https://www.youtube.com', color: 'auto', size: 's' },
          { id: uid(), type: 'url', label: 'GitHub', sub: '代码托管', target: 'https://github.com', color: 'auto', size: 's' },
          { id: uid(), type: 'url', label: 'Gmail', sub: '邮件', target: 'https://mail.google.com', color: 'auto', size: 's' },
          { id: uid(), type: 'url', label: 'X', sub: 'Home', target: 'https://x.com/home', color: 'auto', size: 's' },
          { id: uid(), type: 'url', label: 'Claude', sub: 'claude.ai', target: 'https://claude.ai', color: 'auto', size: 'w' },
          { id: uid(), type: 'url', label: '本地开发', sub: 'localhost:3000', target: 'http://localhost:3000', color: 'auto', size: 's' },
        ],
      },
      {
        id: uid(), name: '文件夹', tiles: [
          { id: uid(), type: 'folder', label: '桌面', sub: '~/Desktop', target: '~/Desktop', color: 'auto', size: 's' },
          { id: uid(), type: 'folder', label: '下载', sub: '~/Downloads', target: '~/Downloads', color: 'auto', size: 's' },
          { id: uid(), type: 'folder', label: '文稿', sub: '~/Documents', target: '~/Documents', color: 'auto', size: 's' },
          { id: uid(), type: 'folder', label: '应用程序', sub: '/Applications', target: '/Applications', color: 'auto', size: 's' },
          { id: uid(), type: 'folder', label: '图片', sub: '~/Pictures', target: '~/Pictures', color: 'auto', size: 'w' },
        ],
      },
      {
        id: uid(), name: '快捷操作', tiles: [
          { id: uid(), type: 'system', label: '截图', sub: '框选截图到桌面', target: 'screenshot', color: 'auto', size: 's' },
          { id: uid(), type: 'system', label: '显示桌面', sub: 'Mission Control', target: 'desktop', color: 'auto', size: 's' },
          { id: uid(), type: 'system', label: '调度中心', sub: '所有窗口', target: 'missioncontrol', color: 'auto', size: 's' },
          { id: uid(), type: 'system', label: '深色模式', sub: '切换外观', target: 'darkmode', color: 'auto', size: 's' },
          { id: uid(), type: 'system', label: '锁屏', sub: '关闭显示器', target: 'lock', color: 'auto', size: 's' },
          { id: uid(), type: 'keys', label: '聚焦搜索', sub: '⌘ Space', target: 'cmd+space', color: 'auto', size: 's' },
          { id: uid(), type: 'keys', label: '复制', sub: '⌘ C', target: 'cmd+c', color: 'auto', size: 's' },
          { id: uid(), type: 'keys', label: '粘贴', sub: '⌘ V', target: 'cmd+v', color: 'auto', size: 's' },
        ],
      },
    ],
  };
}

let config;
function loadConfig() {
  try {
    config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch (e) {
    config = defaultConfig();
    saveConfig(config);
  }
  config.settings = Object.assign({}, DEFAULT_SETTINGS, config.settings || {});
  // v2：磁贴默认改为「自动取 logo 主色」
  if ((config.version || 1) < 2) {
    config.pages.forEach((p) => p.tiles.forEach((t) => { t.color = 'auto'; }));
    config.version = 2;
    saveConfig(config);
  }
  // v3：播放信息来源默认改为 auto
  if ((config.version || 1) < 3) {
    if (config.settings.nowPlaying === 'music') config.settings.nowPlaying = 'auto';
    config.version = 3;
    saveConfig(config);
  }
  // v4：首页加入「Mac 状态」（系统状态 + 小组件）；已经有小组件的配置不再添加
  if ((config.version || 1) < 4) {
    if (!config.pages.some((p) => p.tiles.some((t) => t.type === 'widget'))) config.pages.unshift(statusPage());
    config.version = 4;
    saveConfig(config);
  }
  return config;
}

function saveConfig(c) {
  const tmp = CONFIG_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(c, null, 2));
  fs.renameSync(tmp, CONFIG_FILE);
}

function validateConfig(c) {
  if (!c || !Array.isArray(c.pages)) throw new Error('配置格式错误');
  Object.keys(c).forEach((k) => { if (k.charAt(0) === '_') delete c[k]; });
  c.settings = Object.assign({}, DEFAULT_SETTINGS, c.settings || {});
  c.pages.forEach((p) => {
    if (!p.id) p.id = uid();
    if (!Array.isArray(p.tiles)) p.tiles = [];
    p.tiles.forEach((t) => {
      if (!t.id) t.id = uid();
      Object.keys(t).forEach((k) => { if (k.charAt(0) === '_') delete t[k]; });
      if (t.type === 'widget') {
        if (!/^(system|cpu|mem|disk|net|battery|ai|clock|countdown|todo)$/.test(String(t.target))) t.target = 'system';
        if (t.items !== undefined) t.items = (Array.isArray(t.items) ? t.items : []).slice(0, 50)
          .map((x) => ({ text: String((x && x.text) || '').slice(0, 200), done: !!(x && x.done) })).filter((x) => x.text);
        if (t.date !== undefined) t.date = String(t.date).slice(0, 40);
        if (t.tz !== undefined) t.tz = String(t.tz).slice(0, 60);
      }
    });
  });
  return c;
}

function findTile(id) {
  for (const p of config.pages) {
    for (const t of p.tiles) if (t.id === id) return t;
  }
  return null;
}

// ---------- actions ----------

// deckctl：Swift 小工具（媒体键 / 组合键 / 权限检测），比 osascript 快且更可靠。首次启动时自动编译。
const HELPER_SRC = path.join(ROOT, 'helper', 'deckctl.swift');
const HELPER_BIN = path.join(ROOT, 'helper', 'deckctl');
let helperReady = false;

function ensureHelper() {
  try {
    if (fs.statSync(HELPER_BIN).mtimeMs >= fs.statSync(HELPER_SRC).mtimeMs) { helperReady = true; requestAccessibility(); return; }
  } catch (e) { /* 需要编译 */ }
  console.log('  正在编译 deckctl 辅助工具…');
  // 先编译到临时文件再原子替换：原地覆盖正在使用的二进制会让 macOS 的签名校验失败（进程被 SIGKILL）
  const tmp = HELPER_BIN + '.tmp';
  run('/usr/bin/swiftc', ['-O', HELPER_SRC, '-o', tmp], { timeout: 180000 })
    .then(() => { fs.renameSync(tmp, HELPER_BIN); helperReady = true; console.log('  deckctl 编译完成'); requestAccessibility(); })
    .catch((e) => console.log('  deckctl 编译失败，将退回 AppleScript：' + e.message.split('\n')[0]));
}

let trustedCache = { at: 0, value: null };
async function accessibilityTrusted() {
  if (!helperReady) return null;
  if (Date.now() - trustedCache.at < 5000) return trustedCache.value;
  const out = await run(HELPER_BIN, ['trusted']).catch(() => '');
  trustedCache = { at: Date.now(), value: out.trim() === 'yes' };
  return trustedCache.value;
}

// 未授权时，启动后主动请求一次：系统会弹窗，并把 node 自动加入「辅助功能」列表
function requestAccessibility() {
  run(HELPER_BIN, ['trusted']).then((out) => {
    if (out.trim() === 'yes') return;
    console.log('  未获得辅助功能权限，已请求系统授权（node 会出现在「辅助功能」列表中，打开开关即可）');
    return run(HELPER_BIN, ['prompt']);
  }).catch(() => {});
}

const AX_HINT = '需要辅助功能权限：在 Mac「系统设置 → 隐私与安全性 → 辅助功能」中允许运行 iPadDuo 的程序（终端或 node），然后重启服务';

async function requireAccessibility() {
  if ((await accessibilityTrusted()) === false) throw new Error(AX_HINT);
}

// 媒体键（播放/暂停、上一首、下一首）。通过系统级事件发送，对浏览器、音乐、视频等通用。
// 需要在「系统设置 → 隐私与安全性 → 辅助功能」中允许运行本服务的程序（终端 / node）。
const MEDIA_KEY_JXA = `
ObjC.import('Cocoa');
function run(argv) {
  var code = parseInt(argv[0], 10);
  [true, false].forEach(function (down) {
    var ev = $.NSEvent.otherEventWithTypeLocationModifierFlagsTimestampWindowNumberContextSubtypeData1Data2(
      14, $.NSMakePoint(0, 0), down ? 0xa00 : 0xb00, 0, 0, $(), 8, (code << 16) | ((down ? 0xa : 0xb) << 8), -1);
    $.CGEventPost(0, ev.CGEvent);
  });
}`;
const MEDIA_CODES = { playpause: 16, next: 17, prev: 18 };

const KEY_CODES = {
  space: 49, return: 36, enter: 36, tab: 48, esc: 53, escape: 53, delete: 51, backspace: 51, fwddelete: 117,
  left: 123, right: 124, down: 125, up: 126, home: 115, end: 119, pageup: 116, pagedown: 121,
  f1: 122, f2: 120, f3: 99, f4: 118, f5: 96, f6: 97, f7: 98, f8: 100, f9: 101, f10: 109, f11: 103, f12: 111,
};
const MODS = { cmd: 'command down', command: 'command down', '⌘': 'command down', shift: 'shift down', '⇧': 'shift down',
  opt: 'option down', option: 'option down', alt: 'option down', '⌥': 'option down', ctrl: 'control down', control: 'control down', '⌃': 'control down' };

async function mediaKey(name) {
  await requireAccessibility();
  if (helperReady) return run(HELPER_BIN, ['media', name]);
  return jxa(MEDIA_KEY_JXA, [String(MEDIA_CODES[name])]);
}

async function sendKeys(combo) {
  await requireAccessibility();
  if (helperReady) {
    try { return await run(HELPER_BIN, ['key', combo]); } catch (e) { /* 未知按键时退回 AppleScript */ }
  }
  return sendKeysAppleScript(combo);
}

function sendKeysAppleScript(combo) {
  const parts = String(combo).toLowerCase().split(/\s*\+\s*/).filter(Boolean);
  const mods = [];
  let key = null;
  for (const p of parts) {
    if (MODS[p]) mods.push(MODS[p]);
    else key = p;
  }
  if (!key) throw new Error('快捷键缺少按键：' + combo);
  const using = mods.length ? ' using {' + mods.join(', ') + '}' : '';
  const action = KEY_CODES[key] !== undefined ? 'key code ' + KEY_CODES[key] : 'keystroke ' + asStr(key);
  return osa('tell application "System Events" to ' + action + using);
}

// ---------- 按应用控制播放 ----------
// 从磁贴打开的音乐类应用会成为「控制目标」，底栏的播放 / 上一首 / 下一首直接作用于它：
//   Apple Music / Spotify → AppleScript；QQ 音乐 / 网易云等 → 点击它们自己菜单栏里的「播放/暂停」「下一首」；
//   都不行时退回系统媒体键（交给 macOS 当前的「正在播放」应用）。
const MEDIA_APPS = {
  'com.apple.Music': { name: '音乐', script: 'Music' },
  'com.spotify.client': { name: 'Spotify', script: 'Spotify' },
  'com.tencent.QQMusicMac': { name: 'QQ音乐' },
  'com.netease.163music': { name: '网易云音乐' },
  'com.kugou.mac': { name: '酷狗音乐' },
  'com.apple.podcasts': { name: '播客' },
  'com.colliderli.iina': { name: 'IINA' },
  'org.videolan.vlc': { name: 'VLC' },
};
const SCRIPT_VERBS = { playpause: 'playpause', next: 'next track', prev: 'previous track' };

let mediaTarget = null; // { bundle, name }
const bundleCache = new Map();

async function bundleIdOf(appPath) {
  if (!appPath) return null;
  if (bundleCache.has(appPath)) return bundleCache.get(appPath);
  const id = (await run('/usr/bin/plutil', ['-extract', 'CFBundleIdentifier', 'raw', '-o', '-', path.join(appPath, 'Contents', 'Info.plist')]).catch(() => '')).trim() || null;
  bundleCache.set(appPath, id);
  return id;
}

async function noteLaunchedApp(target) {
  let bundle = isBundleId(target) ? target : await bundleIdOf(resolveAppPath(target));
  if (bundle && MEDIA_APPS[bundle]) mediaTarget = { bundle, name: MEDIA_APPS[bundle].name };
  return bundle;
}

async function mediaControl(action) {
  // 没有从磁贴指定目标时，控制当前正在播放的应用（如 QQ 音乐 / 音乐）
  let t = mediaTarget;
  if (!t) {
    const np = nowPlaying.state();
    if (np.app && MEDIA_APPS[np.app]) t = { bundle: np.app, name: MEDIA_APPS[np.app].name };
  }
  if (t && helperReady) {
    const running = (await run(HELPER_BIN, ['running', t.bundle]).catch(() => 'no')).trim() === 'yes';
    if (running) {
      const app = MEDIA_APPS[t.bundle];
      if (app && app.script) {
        return osa('tell application "' + app.script + '" to ' + SCRIPT_VERBS[action]);
      }
      await requireAccessibility();
      try { return await run(HELPER_BIN, ['menu', t.bundle, action]); } catch (e) { /* 没找到菜单项：退回媒体键 */ }
    }
  }
  return mediaKey(action);
}

// ---------- 音量（后台跟踪，供 /api/live 实时返回） ----------

let volumeState = { volume: 0, muted: false, at: 0 };
let lastClientAt = 0;
setInterval(() => {
  if (Date.now() - lastClientAt > 15000) return; // 没有 iPad 在看时不查询
  getVolume().then((v) => { volumeState = Object.assign(v, { at: Date.now() }); }, () => {});
}, 1500);

async function getVolume() {
  const out = await osa('set v to get volume settings\nreturn (output volume of v as text) & "," & (output muted of v as text)');
  const [vol, muted] = out.trim().split(',');
  return { volume: parseInt(vol, 10) || 0, muted: muted === 'true' };
}

const SYSTEM_ACTIONS = {
  playpause: () => mediaControl('playpause'),
  next: () => mediaControl('next'),
  prev: () => mediaControl('prev'),
  volup: () => osa('set volume output volume ((output volume of (get volume settings)) + 6) without output muted'),
  voldown: () => osa('set volume output volume ((output volume of (get volume settings)) - 6)'),
  mute: () => osa('set volume output muted (not (output muted of (get volume settings)))'),
  screenshot: () => {
    const f = path.join(HOME, 'Desktop', '截图 ' + new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19) + '.png');
    spawn('/usr/sbin/screencapture', ['-i', f], { detached: true, stdio: 'ignore' }).unref();
    return Promise.resolve();
  },
  screenshotfull: () => {
    const f = path.join(HOME, 'Desktop', '截图 ' + new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19) + '.png');
    return run('/usr/sbin/screencapture', ['-x', f]);
  },
  missioncontrol: () => run('/usr/bin/open', ['-a', 'Mission Control']),
  desktop: () => run('/usr/bin/open', ['-a', 'Mission Control', '--args', '1']),
  appexpose: () => run('/usr/bin/open', ['-a', 'Mission Control', '--args', '2']),
  lock: () => run('/usr/bin/pmset', ['displaysleepnow']),
  darkmode: () => osa('tell application "System Events" to tell appearance preferences to set dark mode to not dark mode'),
  sleep: () => osa('tell application "System Events" to sleep'),
};

async function runTile(t) {
  const target = (t.target || '').trim();
  switch (t.type) {
    case 'app':
      if (!target) throw new Error('未设置应用');
      noteLaunchedApp(target).catch(() => {});
      if (target.includes('/')) return run('/usr/bin/open', [expandHome(target)]);
      if (isBundleId(target)) return run('/usr/bin/open', ['-b', target]);
      return run('/usr/bin/open', ['-a', target]);
    case 'url': {
      let url = target;
      if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) url = 'https://' + url;
      // 已经开着这个网站（比如正在播放的视频）：切到那个标签页，不再新开页面
      if (/^https?:/i.test(url) && t.reuse !== false) {
        const hit = await remote.focusExisting(url, t.browser).catch(() => null);
        if (hit) return hit;
      }
      const args = t.browser ? ['-a', t.browser, url] : [url];
      return run('/usr/bin/open', args);
    }
    case 'folder':
    case 'file': {
      const p = expandHome(target);
      if (!fs.existsSync(p)) throw new Error('路径不存在：' + target);
      return run('/usr/bin/open', t.reveal ? ['-R', p] : [p]);
    }
    case 'shortcut':
      return run('/usr/bin/shortcuts', ['run', target], { timeout: 60000 });
    case 'system': {
      const fn = Object.prototype.hasOwnProperty.call(SYSTEM_ACTIONS, target) && SYSTEM_ACTIONS[target];
      if (!fn) throw new Error('未知系统动作：' + target);
      return fn();
    }
    case 'keys':
      return sendKeys(target);
    case 'widget': {
      // 点状态磁贴：打开 Mac 上对应的系统工具
      const open = { system: ['-a', 'Activity Monitor'], cpu: ['-a', 'Activity Monitor'], mem: ['-a', 'Activity Monitor'], net: ['-a', 'Activity Monitor'],
        disk: ['x-apple.systempreferences:com.apple.settings.Storage'], battery: ['x-apple.systempreferences:com.apple.Battery-Settings.extension'],
        clock: ['-a', 'Clock'], countdown: ['-a', 'Calendar'] }[target];
      return open ? run('/usr/bin/open', open) : null;
    }
    case 'script':
      if (t.lang === 'applescript') return osa(t.script || '');
      return run('/bin/zsh', ['-lc', t.script || ''], { timeout: 60000, cwd: HOME });
    default:
      throw new Error('未知类型：' + t.type);
  }
}

// ---------- icons ----------

const ICON_JXA = `
ObjC.import('AppKit');
function run(argv) {
  var p = argv[0], out = argv[1], s = parseInt(argv[2], 10);
  var img = $.NSWorkspace.sharedWorkspace.iconForFile(p);
  var rep = $.NSBitmapImageRep.alloc.initWithBitmapDataPlanesPixelsWidePixelsHighBitsPerSampleSamplesPerPixelHasAlphaIsPlanarColorSpaceNameBytesPerRowBitsPerPixel(
    null, s, s, 8, 4, true, false, $.NSCalibratedRGBColorSpace, 0, 0);
  $.NSGraphicsContext.saveGraphicsState;
  $.NSGraphicsContext.setCurrentContext($.NSGraphicsContext.graphicsContextWithBitmapImageRep(rep));
  img.drawInRectFromRectOperationFraction($.NSMakeRect(0, 0, s, s), $.NSZeroRect, $.NSCompositingOperationSourceOver, 1.0);
  $.NSGraphicsContext.restoreGraphicsState;
  rep.representationUsingTypeProperties($.NSBitmapImageFileTypePNG, $()).writeToFileAtomically(out, true);
}`;

const pendingIcons = new Map();

async function fileIcon(p, size) {
  try { p = fs.realpathSync(p); } catch (e) { /* 保留原路径 */ }
  const st = fs.statSync(p);
  const key = crypto.createHash('sha1').update(p + '|' + st.mtimeMs + '|' + size).digest('hex');
  const out = path.join(ICON_CACHE, key + '.png');
  if (fs.existsSync(out)) return { file: out, type: 'image/png' };
  if (!pendingIcons.has(out)) {
    pendingIcons.set(out, jxa(ICON_JXA, [p, out, String(size)]).finally(() => pendingIcons.delete(out)));
  }
  await pendingIcons.get(out);
  return { file: out, type: 'image/png' };
}

async function webIcon(rawUrl) {
  let u;
  try { u = new URL(/^[a-z]+:/i.test(rawUrl) ? rawUrl : 'https://' + rawUrl); } catch (e) { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const key = crypto.createHash('sha1').update('web2|' + u.origin).digest('hex');
  const metaFile = path.join(ICON_CACHE, key + '.json');
  try {
    const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
    if (!meta.none) return { file: path.join(ICON_CACHE, key + meta.ext), type: meta.type };
    if (Date.now() - meta.at < 86400000) return null; // 一天内不重复尝试
  } catch (e) { /* not cached */ }

  const get = async (url) => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 4000);
    try {
      const r = await fetch(url, { signal: ctl.signal, redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh) iPadDuo' } });
      return r.ok ? r : null;
    } catch (e) { return null; } finally { clearTimeout(timer); }
  };
  const tryImage = async (url) => {
    const r = await get(url);
    if (!r) return null;
    const type = (r.headers.get('content-type') || '').split(';')[0];
    if (!/^image\//.test(type)) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    return buf.length > 64 ? { buf, type } : null;
  };

  const candidates = [];
  const page = await get(u.origin + '/');
  if (page) {
    const html = (await page.text()).slice(0, 200000);
    const re = /<link\b[^>]*>/gi;
    let m;
    const found = [];
    while ((m = re.exec(html))) {
      const tag = m[0];
      const rel = (tag.match(/rel=["']([^"']+)["']/i) || [])[1] || '';
      const href = (tag.match(/href=["']([^"']+)["']/i) || [])[1];
      if (!href || !/icon/i.test(rel)) continue;
      const sizes = parseInt((tag.match(/sizes=["'](\d+)/i) || [])[1] || '0', 10);
      const score = (/apple-touch/i.test(rel) ? 1000 : 0) + Math.min(sizes, 512) - (/\.svg/i.test(href) ? 2000 : 0);
      try { found.push({ url: new URL(href, page.url).href, score }); } catch (e) {}
    }
    found.sort((a, b) => b.score - a.score).forEach((f) => candidates.push(f.url));
  }
  candidates.push(u.origin + '/apple-touch-icon.png', u.origin + '/favicon.ico');

  for (const c of candidates) {
    const img = await tryImage(c);
    if (!img || img.type.includes('svg')) continue;
    // 统一转成 128px PNG：ICO / WebP / 超大图片在老 Safari 上渲染不稳定，也更省流量
    const raw = path.join(ICON_CACHE, key + '.raw');
    const out = path.join(ICON_CACHE, key + '.png');
    fs.writeFileSync(raw, img.buf);
    try {
      await run('/usr/bin/sips', ['-s', 'format', 'png', '-Z', '128', raw, '--out', out]);
    } catch (e) {
      continue;
    } finally {
      fs.unlink(raw, () => {});
    }
    fs.writeFileSync(metaFile, JSON.stringify({ ext: '.png', type: 'image/png' }));
    return { file: out, type: 'image/png' };
  }
  fs.writeFileSync(metaFile, JSON.stringify({ none: true, at: Date.now() }));
  return null;
}

async function iconFor(type, target, size) {
  if (type === 'app') {
    let p = resolveAppPath(target);
    if (!p && isBundleId(target)) {
      const out = (await run('/usr/bin/mdfind', ['kMDItemCFBundleIdentifier == "' + target.replace(/"/g, '') + '"']).catch(() => '')).split('\n')[0];
      p = out || null;
    }
    return p ? fileIcon(p, size) : null;
  }
  if (type === 'folder' || type === 'file') {
    const p = expandHome(target);
    return fs.existsSync(p) ? fileIcon(p, size) : null;
  }
  if (type === 'url') return webIcon(target);
  if (type === 'shortcut') {
    const p = resolveAppPath('Shortcuts');
    return p ? fileIcon(p, size) : null;
  }
  return null;
}

// ---------- 主色 ----------

// 每个磁贴的底色取自图标主色，结果缓存在 cache/tints.json
const TINT_FILE = path.join(ROOT, 'cache', 'tints.json');
let tints = {};
try { tints = JSON.parse(fs.readFileSync(TINT_FILE, 'utf8')); } catch (e) { /* 首次运行 */ }
let tintSaveTimer = null;
const TINT_TYPES = { app: 1, url: 1, folder: 1, file: 1, shortcut: 1 };

async function tintFor(t) {
  if (!TINT_TYPES[t.type] || !t.target) return null;
  const key = t.type + '|' + t.target;
  if (tints[key]) return tints[key];
  if (!helperReady) return null;
  const icon = await iconFor(t.type, t.target, 128).catch(() => null);
  let info = { tint: null, plate: false };
  if (icon) {
    try { info = JSON.parse(await run(HELPER_BIN, ['color', icon.file])); } catch (e) { return null; }
  }
  tints[key] = info;
  clearTimeout(tintSaveTimer);
  tintSaveTimer = setTimeout(() => fs.writeFile(TINT_FILE, JSON.stringify(tints), () => {}), 500);
  return info;
}

// 返回给前端的配置：附带 _tint / _plate（不落盘）。
// 已缓存的主色立即附上；没算过的放进后台队列逐个计算，不阻塞页面加载（前端稍后再取）。
const tintQueue = [];
let tintBusy = false;

function queueTint(t) {
  const key = t.type + '|' + t.target;
  if (tintQueue.some((x) => x.type + '|' + x.target === key)) return;
  tintQueue.push({ type: t.type, target: t.target });
  if (!tintBusy) drainTints();
}

async function drainTints() {
  tintBusy = true;
  while (tintQueue.length) await tintFor(tintQueue.shift()).catch(() => null);
  tintBusy = false;
}

function configWithTints() {
  const c = JSON.parse(JSON.stringify(config));
  let pending = false;
  c.pages.forEach((p) => p.tiles.forEach((t) => {
    if (!TINT_TYPES[t.type] || !t.target) return;
    const info = tints[t.type + '|' + t.target];
    if (info) {
      t._tint = info.tint;
      t._plate = t.type === 'url' && info.plate;
    } else if (helperReady) {
      pending = true;
      queueTint(t);
    }
  }));
  if (pending) c._pendingTints = true;
  return c;
}

// ---------- 正在播放 ----------

const { createNowPlaying } = require('./nowplaying');
const nowPlaying = createNowPlaying({
  root: ROOT,
  cacheDir: path.join(ROOT, 'cache'),
  run,
  helperBin: HELPER_BIN,
  isHelperReady: () => helperReady,
  getSettings: () => (config && config.settings) || DEFAULT_SETTINGS,
  isActive: () => Date.now() - lastClientAt < 15000,
  log: (m) => console.log(m),
});

// ---------- 触控板 ----------

const { createInput } = require('./input');
const input = createInput({ helperBin: HELPER_BIN, isHelperReady: () => helperReady, log: (m) => console.log(m), cacheDir: path.join(ROOT, 'cache') });

// WebRTC + H.264 画面（iPadOS 11+）；没装 node-datachannel 时自动只用 JPEG 推流
const { createWebRTC } = require('./webrtc');
const rtc = createWebRTC({ helperBin: HELPER_BIN, isHelperReady: () => helperReady, log: (m) => console.log(m), registerMeta: input.registerMeta });
input.setRTC(rtc);

let screenPermCache = { at: 0, value: null };
async function screenPermission() {
  if (!helperReady) return null;
  if (Date.now() - screenPermCache.at < 5000) return screenPermCache.value;
  const out = await run(HELPER_BIN, ['screenperm']).catch(() => '');
  screenPermCache = { at: Date.now(), value: out.trim() === 'yes' };
  return screenPermCache.value;
}

// ---------- 应用交互面板 ----------

const panels = require('./panels');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 把应用切到前台，并确认它真的到了前台（最多等约 1.6 秒）
async function activateApp(bundle) {
  for (let i = 0; i < 8; i++) {
    const f = await input.front();
    if (f && f.bundle === bundle) { if (i > 0) await sleep(150); return true; }
    if (i === 0) await run('/usr/bin/open', ['-b', bundle]).catch(() => {});
    await sleep(200);
  }
  return false;
}

// 模拟按键会发给「当前最前面的应用」，所以按键前的最后一刻必须再确认一次前台就是目标应用
async function keyToApp(bundle, key) {
  const f = await input.front();
  if (!f || f.bundle !== bundle) throw new Error('「' + panels.PANELS[bundle].name + '」不在前台，为避免把按键发给别的应用，已取消');
  input.key(key);
}

// 按 menu → button → key 的顺序尝试执行一个动作
async function runPanelAction(bundle, def) {
  await requireAccessibility();
  await activateApp(bundle);
  if (def.menu) { try { await run(HELPER_BIN, ['menupath', bundle].concat(def.menu)); return 'menu'; } catch (e) { /* 试下一种 */ } }
  if (def.button) { try { await run(HELPER_BIN, ['axpress', bundle, def.button]); return 'button'; } catch (e) { /* 试下一种 */ } }
  if (def.key) { await keyToApp(bundle, def.key); return 'key'; }
  throw new Error('在 ' + panels.PANELS[bundle].name + ' 里没找到「' + (def.label || '听写') + '」');
}

// 面板刚打开过弹窗的应用（60 秒内）：只有这种情况下「取消」才允许发 Esc（Esc 在聊天应用里可能是「停止生成」）
const popupOpened = new Map();

async function popupLabels(bundle) {
  const p = panels.PANELS[bundle];
  const out = {};
  await Promise.all(p.popups.map((x) => run(HELPER_BIN, ['axbutton', bundle, x.button]).then((t) => { out[x.id] = t.trim(); }, () => {})));
  return out;
}

// ---------- 控制模式：按前台应用给出合适的大号控件 ----------

const { createRemote } = require('./remote');
const remote = createRemote({ run });
const { createFiles } = require('./files');
const { createStats } = require('./stats');
const { createUsage } = require('./usage');
const stats = createStats({ run });
const usage = createUsage({ home: HOME });
const files = createFiles({
  home: HOME, run, cacheDir: path.join(ROOT, 'cache'),
  // 已添加为磁贴的文件夹也允许浏览（可能在家目录之外，如外接硬盘）
  roots: () => [].concat(...config.pages.map((pg) => pg.tiles)).filter((t) => t.type === 'folder' && t.target).map((t) => expandHome(t.target)),
});

// ---------- 播放来源：音乐应用 + 各浏览器前台标签页里的视频（左下角播放器可切换） ----------
const { BROWSERS } = require('./remote');
let sourcesCache = { at: 0, list: [], pending: null };
function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } }
function mediaSources() {
  if (Date.now() - sourcesCache.at < 2500) return Promise.resolve(sourcesCache.list);
  if (sourcesCache.pending) return sourcesCache.pending;
  sourcesCache.pending = (async () => {
    const list = [];
    const np = nowPlaying.state();
    if (np.active) {
      list.push({ id: 'music:' + (np.app || ''), kind: 'music', bundle: np.app || '', name: (MEDIA_APPS[np.app] || {}).name || '音乐',
        title: np.title || '', sub: np.artist || '', playing: !!np.playing, art: np.art ? np.id : '' });
    }
    const browsers = Object.keys(BROWSERS);
    const running = helperReady
      ? await Promise.all(browsers.map((b) => run(HELPER_BIN, ['running', b]).then((o) => o.trim() === 'yes', () => false)))
      : browsers.map(() => false);
    await Promise.all(browsers.map(async (b, i) => {
      if (!running[i]) return;
      const v = await remote.video(b, 'state').catch(() => null); // 没开「Apple 事件中的 JavaScript」时拿不到，跳过
      if (!v || !v.ok) return;
      const tab = await remote.tabInfo(b).catch(() => null);
      list.push({ id: 'video:' + b, kind: 'video', bundle: b, name: BROWSERS[b].app, title: (tab && tab.title) || '网页视频',
        sub: tab ? hostOf(tab.url) : '', playing: !!v.p, t: v.t, d: v.d, muted: !!v.m });
    }));
    list.sort((x, y) => (y.playing - x.playing) || (x.kind === 'music' ? -1 : 1));
    sourcesCache = { at: Date.now(), list, pending: null };
    return list;
  })().catch(() => { sourcesCache.pending = null; return []; });
  return sourcesCache.pending;
}
// macOS 会定期（或在采集程序更新后）弹出「node 正在请求直接访问屏幕和音频」确认框；
// 在用户点「允许」之前采集时好时坏。采集失败时检查是否有这个弹窗，让 iPad 直接告诉用户该做什么（只读文字，不点击）。
let promptCache = { at: 0, value: false };
async function screenPromptPending() {
  if (Date.now() - promptCache.at < 4000) return promptCache.value;
  const out = helperReady ? await run(HELPER_BIN, ['texts', 'com.apple.UserNotificationCenter'], { timeout: 3000 }).catch(() => '') : '';
  promptCache = { at: Date.now(), value: /录制|屏幕|record|screen/i.test(out) };
  return promptCache.value;
}
const SCREEN_PROMPT_MSG = 'Mac 上弹出了屏幕录制确认窗口（“node”正在请求访问屏幕）：请在 Mac 上点「允许」，画面会自动恢复';

const thumbCache = new Map(); // bundle → { at, buf }
async function sourceThumb(bundle, w) {
  const c = thumbCache.get(bundle);
  if (c && Date.now() - c.at < 1500) return c.buf;
  const r = await input.thumb(bundle, w);
  if (r.error) throw new Error(r.error);
  thumbCache.set(bundle, { at: Date.now(), buf: r.jpg });
  return r.jpg;
}
const CONTROL_KINDS = {
  'com.colliderli.iina': 'player', 'org.videolan.vlc': 'player', 'com.apple.QuickTimePlayerX': 'player',
  'com.apple.iWork.Keynote': 'slides', 'com.microsoft.Powerpoint': 'slides', 'com.kingsoft.wpsoffice.mac': 'slides',
  'com.tencent.QQMusicMac': 'music', 'com.apple.Music': 'music', 'com.netease.163music': 'music', 'com.spotify.client': 'music',
};
function controlKind(bundle) {
  if (!bundle) return 'general';
  if (panels.PANELS[bundle]) return 'ai';
  if (remote.isBrowser(bundle)) return 'browser';
  return CONTROL_KINDS[bundle] || 'general';
}

async function appPathOf(bundle) {
  const hit = listApps().find((a) => bundleCache.get(a.path) === bundle);
  if (hit) return hit.path;
  const out = await run('/usr/bin/mdfind', ['kMDItemCFBundleIdentifier == "' + String(bundle).replace(/"/g, '') + '"']).catch(() => '');
  return out.split('\n')[0] || null;
}

// ---------- 音乐：喜欢 / 播放模式 ----------
// QQ 音乐、网易云：点它们菜单栏里的「喜欢 / 取消喜欢」「播放模式」；Apple Music：AppleScript 的 favorited。
const MUSIC_MENUS = {
  'com.tencent.QQMusicMac': {
    // 未收藏时叫「喜欢歌曲」（旧版本叫「喜欢」），已收藏时叫「取消喜欢」
    like: ['播放控制 > 喜欢歌曲', '播放控制 > 喜欢', '播放控制 > 取消喜欢', '播放控制 > 取消喜欢歌曲', 'Controls > Like', 'Controls > Unlike'],
    modes: { '单曲循环': ['播放控制 > 播放模式 > 单曲循环'], '顺序播放': ['播放控制 > 播放模式 > 顺序播放'], '列表循环': ['播放控制 > 播放模式 > 列表循环'], '随机播放': ['播放控制 > 播放模式 > 随机播放'] },
  },
  'com.netease.163music': {
    like: ['控制 > 喜欢', '控制 > 取消喜欢', '播放控制 > 喜欢', '播放控制 > 取消喜欢'],
    modes: {},
  },
};

async function musicInfo(bundle) {
  if (bundle === 'com.apple.Music') {
    const out = await osa('if application "Music" is running then tell application "Music" to return (favorited of current track) as text').catch(() => '');
    return { liked: out.trim() === 'true' ? true : out.trim() === 'false' ? false : null, modes: [] };
  }
  const m = MUSIC_MENUS[bundle];
  if (!m || !helperReady) return { liked: null, modes: [] };
  const menus = await run(HELPER_BIN, ['menus', bundle]).catch(() => '');
  const has = (t) => menus.split('\n').some((l) => l.replace(/^\(禁用\) /, '').replace(/\s/g, '') === t.replace(/\s/g, ''));
  let liked = null;
  if (m.like.some((p) => /取消喜欢|Unlike/.test(p) && has(p))) liked = true;
  else if (m.like.some((p) => !/取消喜欢|Unlike/.test(p) && has(p))) liked = false;
  const info = { liked, modes: Object.keys(m.modes).filter((k) => m.modes[k].some(has)) };
  // 待播列表（只读辅助功能文字；QQ 音乐的主窗口需要开着）
  if (bundle === 'com.tencent.QQMusicMac') {
    const texts = await run(HELPER_BIN, ['texts', bundle], { timeout: 4000 }).catch(() => '');
    info.queue = require('./nowplaying').parseQQQueue(texts);
  }
  return info;
}

async function musicAction(bundle, action, value) {
  await requireAccessibility();
  if (bundle === 'com.apple.Music') {
    if (action === 'like') return osa('tell application "Music" to set favorited of current track to not (favorited of current track)');
    throw new Error('Apple Music 暂不支持这个操作');
  }
  const m = MUSIC_MENUS[bundle];
  if (!m) throw new Error('这个应用不支持');
  if (action === 'play') {
    // 点 QQ 音乐待播列表里那一首的「播放 歌名」按钮（按完整名字精确匹配）
    const title = String(value || '').slice(0, 200);
    if (bundle !== 'com.tencent.QQMusicMac' || !title) throw new Error('不支持的操作');
    const re = '^播放 ' + title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$';
    await run(HELPER_BIN, ['axpress', bundle, re]).catch(() => { throw new Error('没有找到这首歌，待播列表可能已经变了'); });
    return;
  }
  const paths = action === 'like' ? m.like : (m.modes[value] || []);
  if (!paths.length) throw new Error('不支持的操作');
  await run(HELPER_BIN, ['menupath', bundle].concat(paths)).catch(() => { throw new Error('没有找到对应的菜单项'); });
}

// ---------- 随航 ----------

async function sidecarList() {
  const out = await run(HELPER_BIN, ['sidecar', 'list'], { timeout: 8000 }).catch(() => 'unavailable');
  if (out.trim() === 'unavailable') return { available: false, devices: [] };
  return {
    available: true,
    devices: out.split('\n').filter(Boolean).map((l) => { const [name, st] = l.split('\t'); return { name, connected: st === 'connected' }; }),
  };
}

// ---------- http ----------

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon' };

function isLan(addr) {
  const a = (addr || '').replace(/^::ffff:/, '');
  return a === '127.0.0.1' || a === '::1' || /^10\./.test(a) || /^192\.168\./.test(a) || /^172\.(1[6-9]|2\d|3[01])\./.test(a) ||
    /^169\.254\./.test(a) || /^f[cd][0-9a-f]{2}:/i.test(a) || /^fe80:/i.test(a);
}

// 防 DNS rebinding：只接受用 IP、localhost、*.local 或本机名访问
function hostAllowed(host) {
  if (!host) return false;
  const h = host.toLowerCase().replace(/:\d+$/, '').replace(/^\[(.*)\]$/, '$1');
  return h === 'localhost' || /^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.indexOf(':') >= 0 ||
    /\.local$/.test(h) || h === os.hostname().toLowerCase().replace(/\.local$/, '');
}

// 防跨站请求伪造：写入 / 执行类请求必须带自定义头（浏览器跨站发送时会先做 CORS 预检，本服务不放行），
// 并且如果带了 Origin，必须与当前访问地址同源
function writeAllowed(req) {
  if (req.headers['x-deck'] !== '1') return false;
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.host; } catch (e) { return false; }
}

function send(res, code, body, headers) {
  const isObj = typeof body === 'object' && !Buffer.isBuffer(body);
  res.writeHead(code, Object.assign({ 'Content-Type': isObj ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }, headers));
  res.end(isObj ? JSON.stringify(body) : body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 2 * 1024 * 1024) { reject(new Error('请求过大')); req.destroy(); }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (e) { reject(new Error('JSON 无效')); }
    });
    req.on('error', reject);
  });
}

function serveFile(res, file, type, cache, req) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'Not found');
    const headers = { 'Content-Type': type || MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': cache || 'no-cache', 'Accept-Ranges': 'bytes' };
    // iOS Safari 播放视频必须支持 Range 请求
    const range = req && req.headers.range && /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if (range) {
      const start = range[1] ? parseInt(range[1], 10) : Math.max(0, st.size - parseInt(range[2], 10));
      const end = range[1] && range[2] ? Math.min(parseInt(range[2], 10), st.size - 1) : st.size - 1;
      if (start > end || start >= st.size) { res.writeHead(416, { 'Content-Range': 'bytes */' + st.size }); return res.end(); }
      headers['Content-Range'] = 'bytes ' + start + '-' + end + '/' + st.size;
      headers['Content-Length'] = end - start + 1;
      res.writeHead(206, headers);
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    headers['Content-Length'] = st.size;
    res.writeHead(200, headers);
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  if (!isLan(req.socket.remoteAddress)) return send(res, 403, '仅允许局域网访问');
  if (!hostAllowed(req.headers.host)) return send(res, 403, '请用 IP 或 .local 地址访问');
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;

  if (!p.startsWith('/api/')) {
    const rel = p === '/' ? 'index.html' : decodeURIComponent(p).replace(/^\/+/, '');
    const file = path.normalize(path.join(PUBLIC, rel));
    if (!file.startsWith(PUBLIC)) return send(res, 403, 'Forbidden');
    return serveFile(res, file, null, null, req);
  }

  if (req.method !== 'GET' && !writeAllowed(req)) return send(res, 403, { error: '拒绝跨站请求' });

  // 设置了 PIN 后，除 ping 外的接口都需要校验
  const pin = config.settings && config.settings.pin;
  if (pin && p !== '/api/ping' && req.headers['x-deck-pin'] !== pin && url.searchParams.get('pin') !== pin) {
    return send(res, 401, { error: '需要 PIN' });
  }

  try {
    if (p === '/api/ping') {
      return send(res, 200, { ok: true, host: os.hostname().replace(/\.local$/, ''), pin: !!pin, accessibility: await accessibilityTrusted() });
    }

    if (p === '/api/config' && req.method === 'GET') return send(res, 200, configWithTints());
    if (p === '/api/config' && req.method === 'POST') {
      const c = validateConfig(await readBody(req));
      config = c;
      saveConfig(c);
      nowPlaying.sync();
      return send(res, 200, { ok: true });
    }

    if (p === '/api/run' && req.method === 'POST') {
      const body = await readBody(req);
      const t = body.id ? findTile(body.id) : body.tile;
      if (!t) return send(res, 404, { error: '磁贴不存在' });
      if (!body.id && t.type === 'script') return send(res, 400, { error: '脚本需先保存为磁贴' });
      const started = Date.now();
      const result = await runTile(t);
      // 告诉 iPad 打开的是哪个应用，用来决定默认显示哪种控件；reused = 切到了已打开的标签页
      const reused = !!(result && result.bundle);
      const bundle = t.type === 'app' ? await noteLaunchedApp((t.target || '').trim()).catch(() => null) : reused ? result.bundle : null;
      return send(res, 200, { ok: true, ms: Date.now() - started, bundle, reused, kind: bundle ? controlKind(bundle) : null });
    }

    if (p === '/api/system' && req.method === 'POST') {
      const body = await readBody(req);
      const fn = Object.prototype.hasOwnProperty.call(SYSTEM_ACTIONS, body.action) && SYSTEM_ACTIONS[body.action];
      if (!fn) return send(res, 400, { error: '未知动作' });
      await fn();
      if (/^(playpause|next|prev)$/.test(body.action)) nowPlaying.nudge();
      const v = await getVolume().catch(() => null);
      if (v) volumeState = Object.assign(v, { at: Date.now() });
      return send(res, 200, Object.assign({ ok: true }, v || {}));
    }

    if (p === '/api/volume' && req.method === 'POST') {
      const body = await readBody(req);
      const v = Math.max(0, Math.min(100, parseInt(body.volume, 10) || 0));
      await osa('set volume output volume ' + v + ' without output muted');
      volumeState = { volume: v, muted: false, at: Date.now() };
      return send(res, 200, { ok: true, volume: v, muted: false });
    }

    if (p === '/api/status') return send(res, 200, Object.assign({ ok: true }, await getVolume().catch(() => ({}))));

    if (p === '/api/live') {
      lastClientAt = Date.now();
      if (Date.now() - volumeState.at > 3000) {
        const v = await getVolume().catch(() => null);
        if (v) volumeState = Object.assign(v, { at: Date.now() });
      }
      return send(res, 200, { volume: volumeState.volume, muted: volumeState.muted, media: mediaTarget, np: nowPlaying.state() });
    }
    if (p === '/api/input' && req.method === 'POST') {
      const body = await readBody(req);
      const client = input.clientId(req.headers['x-deck-client']);
      const accepted = (Array.isArray(body) ? body : [body]).slice(0, 50).filter((m) => input.handle(m, client)).length;
      return send(res, 200, { ok: true, accepted });
    }
    if (p === '/api/remote/status') return send(res, 200, input.status());
    if (p === '/api/front') return send(res, 200, { front: await input.front() });

    // 控制模式：一次返回前台应用、控件类型、AI 面板 / 浏览器标签与视频状态
    if (p === '/api/control') {
      // ?bundle=…：固定看某个应用（从磁贴打开时），不跟随 Mac 前台
      let f = await input.front();
      const pin = url.searchParams.get('bundle');
      if (pin && /^[\w.-]+$/.test(pin) && (!f || f.bundle !== pin)) {
        const running = helperReady && (await run(HELPER_BIN, ['running', pin]).catch(() => 'no')).trim() === 'yes';
        if (running) f = { bundle: pin, name: (MEDIA_APPS[pin] && MEDIA_APPS[pin].name) || (panels.PANELS[pin] && panels.PANELS[pin].name) || (require('./remote').BROWSERS[pin] || {}).app || pin };
      }
      const bundle = (f && f.bundle) || '';
      const kind = controlKind(bundle);
      const out = { front: f, kind };
      if (kind === 'ai') {
        out.panel = panels.publicPanel(bundle);
        out.labels = helperReady ? await popupLabels(bundle) : {};
      } else if (kind === 'browser') {
        const [tab, vid] = await Promise.all([remote.tabInfo(bundle), remote.video(bundle, 'state')]);
        out.tab = tab;
        out.video = vid;
      } else if (kind === 'music') {
        out.music = await musicInfo(bundle);
      }
      return send(res, 200, out);
    }
    // 浏览器：标签页 / 书签
    if (p === '/api/browser/tabs') {
      const bundle = url.searchParams.get('bundle') || '';
      if (!remote.isBrowser(bundle)) return send(res, 400, { error: '不是支持的浏览器' });
      const [tabs, bookmarks] = await Promise.all([remote.tabs(bundle), remote.bookmarks(bundle)]);
      return send(res, 200, { tabs, bookmarks });
    }
    if (p === '/api/browser/do' && req.method === 'POST') {
      const body = await readBody(req);
      if (!remote.isBrowser(body.bundle)) return send(res, 400, { error: '不是支持的浏览器' });
      if (body.action === 'switch') await remote.switchTab(body.bundle, body.index);
      else if (body.action === 'close') await remote.closeTab(body.bundle, body.index);
      else if (body.action === 'open') {
        if (!/^https?:\/\//.test(String(body.url || ''))) return send(res, 400, { error: '只支持网页地址' });
        const app = require('./remote').BROWSERS[body.bundle].app;
        await run('/usr/bin/open', ['-a', app, body.url]);
      } else return send(res, 400, { error: '未知操作' });
      return send(res, 200, { ok: true, tabs: await remote.tabs(body.bundle) });
    }
    // 音乐：喜欢 / 播放模式
    if (p === '/api/music' && req.method === 'POST') {
      const body = await readBody(req);
      await musicAction(String(body.bundle || ''), String(body.action || ''), body.value);
      await sleep(250);
      return send(res, 200, Object.assign({ ok: true }, await musicInfo(body.bundle)));
    }
    if (p === '/api/control/video' && req.method === 'POST') {
      const body = await readBody(req);
      if (!remote.isBrowser(body.bundle)) return send(res, 400, { error: '前台不是支持的浏览器' });
      return send(res, 200, await remote.video(body.bundle, String(body.action || ''), body.value));
    }
    // 控制模式的按键：先切到前台，按键前再确认前台就是目标应用
    if (p === '/api/control/key' && req.method === 'POST') {
      const body = await readBody(req);
      await requireAccessibility();
      if (body.bundle) {
        await activateApp(body.bundle);
        const f = await input.front();
        if (!f || f.bundle !== body.bundle) return send(res, 409, { error: '目标应用不在前台，已取消' });
      }
      const times = Math.max(1, Math.min(30, parseInt(body.repeat, 10) || 1));
      for (let i = 0; i < times; i++) {
        if (!input.key(String(body.key || ''))) return send(res, 400, { error: '不支持的按键' });
        if (times > 1) await sleep(45);
      }
      return send(res, 200, { ok: true });
    }
    // 「添加当前应用 / 网页」
    if (p === '/api/frontinfo') {
      const f = await input.front();
      if (!f) return send(res, 200, { front: null });
      const tab = remote.isBrowser(f.bundle) ? await remote.tabInfo(f.bundle) : null;
      return send(res, 200, { front: f, path: await appPathOf(f.bundle), tab });
    }
    if (p === '/api/openapp' && req.method === 'POST') {
      const body = await readBody(req);
      if (!/^[\w.-]+$/.test(String(body.bundle || ''))) return send(res, 400, { error: 'bad bundle' });
      await run('/usr/bin/open', ['-b', body.bundle]);
      return send(res, 200, { ok: true });
    }

    // 应用交互面板
    if (p === '/api/panel') {
      const f = await input.front();
      const bundle = url.searchParams.get('bundle') || (f && f.bundle) || '';
      const panel = panels.publicPanel(bundle);
      return send(res, 200, { front: f, panel, labels: panel && helperReady ? await popupLabels(bundle) : {}, available: panels.list() });
    }
    if (p.indexOf('/api/panel/') === 0 && req.method === 'POST') {
      const body = await readBody(req);
      const def = panels.PANELS[body.bundle];
      if (!def) return send(res, 404, { error: '这个应用还没有交互面板' });
      if (p === '/api/panel/open') { await run('/usr/bin/open', ['-b', body.bundle]); return send(res, 200, { ok: true }); }
      // 语音输入前：切到前台、关掉弹窗、把焦点放进输入框（之后按下的语音键才会作用到这里）
      if (p === '/api/panel/focus') {
        await requireAccessibility();
        if (!(await activateApp(body.bundle))) return send(res, 409, { error: '没能把「' + def.name + '」切到前台' });
        await run(HELPER_BIN, ['axcancel', body.bundle]).catch(() => {});
        await run(HELPER_BIN, ['axfocus', body.bundle]).catch(() => {});
        return send(res, 200, { ok: true });
      }
      if (p === '/api/panel/do') {
        const a = body.id === 'dictate' ? def.dictate : def.actions.find((x) => x.id === body.id);
        if (!a) return send(res, 404, { error: '未知动作' });
        return send(res, 200, { ok: true, via: await runPanelAction(body.bundle, a) });
      }
      if (p === '/api/panel/popup') {
        const pop = def.popups.find((x) => x.id === body.id);
        if (!pop) return send(res, 404, { error: '未知菜单' });
        await requireAccessibility();
        // 可能需要真实点击，必须确认目标应用在前台
        if (!(await activateApp(body.bundle))) return send(res, 409, { error: '没能把「' + def.name + '」切到前台' });
        const out = await run(HELPER_BIN, ['axpopup', body.bundle, pop.button]).catch(() => null);
        popupOpened.set(body.bundle, Date.now());
        // 不是标准下拉菜单（自定义浮层）：已在 Mac 上打开，让 iPad 切到「画面」直接点
        if (out === null) return send(res, 200, { ok: true, items: [], screen: true, note: '「' + pop.label + '」是自定义弹窗，已在 Mac 上打开，切到画面直接点选' });
        const items = out.split('\n').filter(Boolean).map((l) => {
          const [checked, disabled, title] = l.split('\t');
          return { title, checked: !!checked, enabled: !disabled };
        }).filter((x) => x.title);
        if (!items.length) return send(res, 200, { ok: true, items: [], screen: true, note: '下拉菜单已在 Mac 上打开，切到画面直接点选' });
        return send(res, 200, { ok: true, items });
      }
      if (p === '/api/panel/pick') {
        if (!(await activateApp(body.bundle))) return send(res, 409, { error: '没能把「' + def.name + '」切到前台' });
        await run(HELPER_BIN, ['axpick', body.bundle, String(body.title || '')]).catch(() => { throw new Error('没有选中「' + body.title + '」'); });
        return send(res, 200, { ok: true, labels: await popupLabels(body.bundle) });
      }
      if (p === '/api/panel/cancel') {
        const closed = await run(HELPER_BIN, ['axcancel', body.bundle]).then(() => true, () => false);
        const recent = Date.now() - (popupOpened.get(body.bundle) || 0) < 60000;
        popupOpened.delete(body.bundle);
        if (!closed && recent) await keyToApp(body.bundle, 'esc').catch(() => {});
        return send(res, 200, { ok: true });
      }
      if (p === '/api/panel/send') {
        const text = String(body.text || '').replace(/\r\n?/g, '\n').slice(0, 20000);
        await requireAccessibility();
        await activateApp(body.bundle);                                   // 让用户在 Mac 上也看到
        await run(HELPER_BIN, ['axcancel', body.bundle]).catch(() => {});  // 关掉可能开着的下拉菜单
        let via = 'ax';
        if (text) {
          // 1) 直接写进目标应用的输入框（不经过键盘，不依赖前台），写完读回核对
          const before = await run(HELPER_BIN, ['composer', body.bundle, 'get']).catch(() => null);
          // 输入框原本为空就整体赋值，否则在光标处插入
          const op = before !== null && !before.trim() ? 'set' : 'insert';
          const ok = before !== null && await run(HELPER_BIN, ['composer', body.bundle, op, text]).then(() => true, () => false);
          const after = ok ? await run(HELPER_BIN, ['composer', body.bundle, 'get']).catch(() => '') : '';
          const norm = (s) => String(s).replace(/\s+/g, '');
          if (!ok || norm(after).indexOf(norm(text)) < 0) {
            // 2) 退路：模拟键盘输入——只有确认目标应用在前台才打字
            via = 'keys';
            await run(HELPER_BIN, ['axfocus', body.bundle]).catch(() => {});
            const f = await input.front();
            if (!f || f.bundle !== body.bundle) throw new Error('「' + def.name + '」不在前台，为避免把文字打进别的应用，已取消');
            input.typeText(text);
            await sleep(Math.min(1500, 60 + text.length * 2));
          }
        }
        if (body.submit) {
          // 优先点「发送」按钮；没有再按回车（同样先确认前台）
          const pressed = await run(HELPER_BIN, ['axpress', body.bundle, def.send || '^(发送|发送消息|Send|Send message|Send prompt|提交|Submit)$']).then(() => true, () => false);
          if (!pressed) await keyToApp(body.bundle, 'return');
        }
        return send(res, 200, { ok: true, via });
      }
      return send(res, 404, { error: 'Not found' });
    }

    // 随航
    if (p === '/api/sidecar') return send(res, 200, await sidecarList());
    if (p === '/api/sidecar/connect' && req.method === 'POST') {
      const body = await readBody(req);
      const out = await run(HELPER_BIN, ['sidecar', body.disconnect ? 'disconnect' : 'connect', String(body.name || '')], { timeout: 30000 })
        .catch((e) => 'error\t' + e.message);
      if (out.trim() !== 'ok') return send(res, 500, { error: '随航' + (body.disconnect ? '断开' : '连接') + '失败：' + out.trim().replace(/^error\t/, '') });
      return send(res, 200, { ok: true });
    }
    // 投屏：最前面窗口的一帧 JPEG；窗口位置等信息放在 X-Win 头里。
    // 要求自定义请求头，所以别的网页无法用 <img> 直接嵌入这张截图。
    if (p === '/api/screen/frame') {
      if (req.headers['x-deck'] !== '1') return send(res, 403, { error: '拒绝跨站请求' });
      lastClientAt = Date.now();
      const f = await input.frame(parseInt(url.searchParams.get('w') || '1280', 10), req.headers['x-deck-client']);
      if (f.error) {
        const prompt = f.error !== 'no-window' && await screenPromptPending();
        const msg = prompt ? SCREEN_PROMPT_MSG : f.error === 'screen-permission' ? '需要「屏幕录制」权限：在 Mac 上打开设置向导 http://localhost:' + PORT + '/setup.html 授权'
          : f.error === 'no-window' ? '没有可显示的窗口' : '截图失败：' + f.error;
        return send(res, 409, { error: msg, code: f.error });
      }
      const buf = f.jpg;
      res.writeHead(200, {
        'Content-Type': 'image/jpeg', 'Content-Length': buf.length, 'Cache-Control': 'no-store',
        'X-Win': encodeURIComponent(JSON.stringify(f.meta)),
      });
      return res.end(buf);
    }
    // 小组件数据：系统状态（按需采样）与 AI 用量（本机日志，只读数字）
    if (p === '/api/stats') { lastClientAt = Date.now(); return send(res, 200, await stats.get()); }
    if (p === '/api/usage') return send(res, 200, await usage.get());
    if (p === '/api/widget/todo' && req.method === 'POST') {
      const body = await readBody(req);
      const t = findTile(String(body.id || ''));
      if (!t || t.type !== 'widget' || t.target !== 'todo') return send(res, 404, { error: '待办磁贴不存在' });
      const items = Array.isArray(t.items) ? t.items : (t.items = []);
      const i = parseInt(body.index, 10);
      if (body.op === 'toggle' && items[i]) items[i].done = !items[i].done;
      else if (body.op === 'clear') t.items = items.filter((x) => !x.done);
      else return send(res, 400, { error: '未知操作' });
      saveConfig(config);
      return send(res, 200, { ok: true, items: t.items });
    }

    // 文件夹分栏浏览
    if (p === '/api/fs/list') {
      try { return send(res, 200, await files.list(url.searchParams.get('path'))); } catch (e) { return send(res, 400, { error: e.message }); }
    }
    if (p === '/api/fs/info') {
      try { return send(res, 200, await files.info(url.searchParams.get('path'))); } catch (e) { return send(res, 400, { error: e.message }); }
    }
    if (p === '/api/fs/thumb') {
      const file = await files.thumb(url.searchParams.get('path'), url.searchParams.get('s')).catch(() => null);
      if (!file) return send(res, 404, { error: '无法预览' });
      return serveFile(res, file, 'image/png', 'private, max-age=3600', req);
    }
    if (p === '/api/fs/open' && req.method === 'POST') {
      const body = await readBody(req);
      try { await files.open(body.path, !!body.reveal); return send(res, 200, { ok: true }); } catch (e) { return send(res, 400, { error: e.message }); }
    }
    if (p === '/api/screen/prompt') return send(res, 200, { pending: await screenPromptPending(), message: SCREEN_PROMPT_MSG });
    if (p === '/api/sources') { lastClientAt = Date.now(); return send(res, 200, { sources: await mediaSources() }); }
    if (p === '/api/sources/act' && req.method === 'POST') {
      const body = await readBody(req);
      const [kind, bundle] = String(body.id || '').split(':');
      const action = String(body.action || '');
      sourcesCache.at = 0; // 下次读取拿到新状态
      if (kind === 'video') {
        if (!remote.isBrowser(bundle)) return send(res, 400, { error: '不支持的来源' });
        const map = { playpause: ['toggle'], toggle: ['toggle'], prev: ['skip', -10], next: ['skip', 10], mute: ['mute'] };
        const m = map[action];
        if (!m) return send(res, 400, { error: '未知动作' });
        return send(res, 200, await remote.video(bundle, m[0], m[1]));
      }
      if (kind === 'music') {
        if (!/^(playpause|next|prev)$/.test(action)) return send(res, 400, { error: '未知动作' });
        await mediaControl(action);
        return send(res, 200, { ok: true });
      }
      return send(res, 400, { error: '不支持的来源' });
    }
    if (p === '/api/sources/thumb') {
      if (req.headers['x-deck'] !== '1') return send(res, 403, { error: '拒绝跨站请求' });
      const bundle = url.searchParams.get('bundle') || '';
      if (!remote.isBrowser(bundle) && !MEDIA_APPS[bundle]) return send(res, 400, { error: '不支持的来源' });
      if (!helperReady) return send(res, 503, { error: '辅助程序未就绪' });
      const w = Math.max(160, Math.min(640, parseInt(url.searchParams.get('w') || '360', 10) || 360));
      const buf = await sourceThumb(bundle, w).catch((e) => { if (e.message !== 'no-window') console.log('  缩略图失败：' + e.message); return null; });
      if (!buf) return send(res, 404, { error: '没有可见窗口' });
      res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': buf.length, 'Cache-Control': 'no-store' });
      return res.end(buf);
    }
    if (p === '/api/media/target' && req.method === 'POST') {
      const body = await readBody(req);
      mediaTarget = body.bundle && MEDIA_APPS[body.bundle] ? { bundle: body.bundle, name: MEDIA_APPS[body.bundle].name } : null;
      return send(res, 200, { ok: true, media: mediaTarget });
    }
    // 设置向导（Mac 上打开 /setup.html）
    if (p === '/api/setup') {
      const ips = [];
      Object.values(os.networkInterfaces()).forEach((list) => (list || []).forEach((i) => {
        if (i.family === 'IPv4' && !i.internal) ips.push(i.address);
      }));
      const host = os.hostname().replace(/\.local$/, '');
      return send(res, 200, {
        host,
        urls: ips.map((ip) => 'http://' + ip + ':' + PORT),
        bonjour: 'http://' + host + '.local:' + PORT,
        node: process.version,
        helper: helperReady,
        accessibility: await accessibilityTrusted(),
        screen: await screenPermission(),
        nowPlaying: config.settings.nowPlaying,
        pin: !!config.settings.pin,
      });
    }
    if (p === '/api/qr') {
      const text = url.searchParams.get('text') || '';
      if (!/^http:\/\/[\w.-]+:\d+\/?$/.test(text) || !helperReady) return send(res, 400, 'bad');
      const out = path.join(ROOT, 'cache', 'qr-' + crypto.createHash('sha1').update(text).digest('hex').slice(0, 12) + '.png');
      if (!fs.existsSync(out)) await run(HELPER_BIN, ['qr', text, out]);
      return serveFile(res, out, 'image/png', 'no-cache', req);
    }
    // 诊断：仅限本机访问
    if (p.indexOf('/api/debug/') === 0) {
      const ra = (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
      if (ra !== '127.0.0.1' && ra !== '::1') return send(res, 403, 'local only');
      const bundle = url.searchParams.get('bundle') || '';
      if (p === '/api/debug/menus') return send(res, 200, await run(HELPER_BIN, ['menus', bundle]).catch((e) => e.message));
      if (p === '/api/debug/texts') return send(res, 200, await run(HELPER_BIN, ['texts', bundle]).catch((e) => e.message));
      // 只查找、不按下：确认某个按钮能被正则唯一找到（例如 QQ 音乐待播列表里的「播放 歌名」）
      if (p === '/api/debug/findbutton') return send(res, 200, await run(HELPER_BIN, ['axbutton', bundle, url.searchParams.get('re') || '']).catch(() => 'not found'));
      if (p === '/api/debug/composer') {
        const op = url.searchParams.get('op') === 'clear' ? ['set', ''] : ['get'];
        return send(res, 200, await run(HELPER_BIN, ['composer', bundle].concat(op)).catch((e) => 'ERR ' + e.message));
      }
    }
    // 设置向导里的按钮：仅限本机
    if (p === '/api/setup/action' && req.method === 'POST') {
      const ra = (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
      if (ra !== '127.0.0.1' && ra !== '::1') return send(res, 403, 'local only');
      const body = await readBody(req);
      if (body.action === 'accessibility') {
        requestAccessibility();
        await run('/usr/bin/open', ['x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility']).catch(() => {});
      } else if (body.action === 'screen') {
        await run(HELPER_BIN, ['screenprompt']).catch(() => {});
        await run('/usr/bin/open', ['x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture']).catch(() => {});
      } else if (body.action === 'restart') {
        send(res, 200, { ok: true });
        setTimeout(() => process.exit(0), 300); // LaunchAgent 会自动拉起
        return;
      }
      return send(res, 200, { ok: true });
    }
    if (p === '/api/nowplaying') return send(res, 200, nowPlaying.state());
    if (p === '/api/lyrics') return send(res, 200, nowPlaying.lyrics(url.searchParams.get('id') || ''));
    if (p === '/api/np/art') {
      const f = nowPlaying.artPath(url.searchParams.get('id') || '', url.searchParams.get('blur') === '1');
      if (!f) return send(res, 404, 'no art');
      return serveFile(res, f, 'image/jpeg', 'public, max-age=86400', req);
    }

    if (p === '/api/apps') return send(res, 200, await listAppsLocalized());

    if (p === '/api/shortcuts') {
      const out = await run('/usr/bin/shortcuts', ['list']).catch(() => '');
      return send(res, 200, out.split('\n').map((s) => s.trim()).filter(Boolean));
    }

    if (p === '/api/icon') {
      const size = Math.max(32, Math.min(256, parseInt(url.searchParams.get('size') || '128', 10)));
      const icon = await iconFor(url.searchParams.get('type'), url.searchParams.get('target') || '', size).catch(() => null);
      if (!icon) return send(res, 404, 'no icon');
      return serveFile(res, icon.file, icon.type, 'public, max-age=86400', req);
    }

    return send(res, 404, { error: 'Not found' });
  } catch (e) {
    return send(res, 500, { error: e.message || String(e) });
  }
});

// WebSocket（触控板）：与普通请求同样的来源、Host、Origin、PIN 校验
server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname !== '/ws') { socket.destroy(); return; }
  input.upgrade(req, socket, (r) => {
    if (!isLan(r.socket.remoteAddress) || !hostAllowed(r.headers.host)) return false;
    const origin = r.headers.origin;
    if (origin) { try { if (new URL(origin).host !== r.headers.host) return false; } catch (e) { return false; } }
    const pin = config.settings && config.settings.pin;
    return !pin || url.searchParams.get('pin') === pin;
  }, head, url.searchParams.get('client'));
});

// 正常退出时结束捕获并释放该服务按住的输入；LaunchAgent 会按原有配置重启。
function shutdown() {
  input.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
}
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);

loadConfig();
ensureHelper();
nowPlaying.sync();
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.error('端口 ' + PORT + ' 已被占用，可用 PORT=xxxx node server.js 换一个端口');
  else console.error(e);
  process.exit(1);
});
server.listen(PORT, '0.0.0.0', () => {
  const ips = [];
  Object.values(os.networkInterfaces()).forEach((list) => (list || []).forEach((i) => {
    if (i.family === 'IPv4' && !i.internal) ips.push(i.address);
  }));
  console.log('iPadDuo 已启动');
  console.log('  设置向导: http://localhost:' + PORT + '/setup.html');
  console.log('  本机:   http://localhost:' + PORT);
  ips.forEach((ip) => console.log('  iPad:   http://' + ip + ':' + PORT));
});
