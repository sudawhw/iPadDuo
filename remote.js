// 浏览器视频遥控：通过 AppleScript 在浏览器当前标签页里执行固定的脚本，读取 / 控制页面上最大的那个 <video>。
// 只执行本文件里写死的脚本（查询状态、播放暂停、跳转、倍速、静音），iPad 端不能传入任意 JavaScript。
//
// 需要浏览器允许「来自 Apple 事件的 JavaScript」：
//   Chrome / Edge / Brave：菜单「查看 → 开发者 → 允许 Apple 事件中的 JavaScript」
//   Safari：设置 → 高级 → 勾选「显示网页开发者功能」，再在「开发」菜单里勾选「允许来自 Apple 事件的 JavaScript」
// 没开时自动退回按键模式（空格 / 方向键 / f / m），同样能用，只是没有真实进度。
'use strict';

const BROWSERS = {
  'com.google.Chrome': { app: 'Google Chrome', kind: 'chromium', setup: 'Chrome 菜单「查看 → 开发者 → 允许 Apple 事件中的 JavaScript」' },
  'com.microsoft.edgemac': { app: 'Microsoft Edge', kind: 'chromium', setup: 'Edge 菜单「查看 → 开发者 → 允许 Apple 事件中的 JavaScript」' },
  'com.brave.Browser': { app: 'Brave Browser', kind: 'chromium', setup: 'Brave 菜单「查看 → 开发者 → 允许 Apple 事件中的 JavaScript」' },
  'com.apple.Safari': { app: 'Safari', kind: 'safari', setup: 'Safari「设置 → 高级 → 显示网页开发者功能」，再勾选「开发 → 允许来自 Apple 事件的 JavaScript」' },
};

// 页面上最大的 video（多数视频站的主播放器）
const PICK = 'var vs=[].slice.call(document.querySelectorAll("video")).filter(function(v){return v.duration>0||v.readyState>0});' +
  'vs.sort(function(a,b){return b.clientWidth*b.clientHeight-a.clientWidth*a.clientHeight});var v=vs[0];';
const STATE = 'JSON.stringify(v?{ok:1,t:v.currentTime,d:isFinite(v.duration)?v.duration:0,p:!v.paused,m:v.muted,r:v.playbackRate}:{ok:0})';

const SCRIPTS = {
  state: () => '(function(){' + PICK + 'return ' + STATE + '})()',
  toggle: () => '(function(){' + PICK + 'if(v){v.paused?v.play():v.pause()}return ' + STATE + '})()',
  seek: (x) => '(function(){' + PICK + 'if(v){v.currentTime=Math.max(0,Math.min(v.duration||1e9,' + Number(x) + '))}return ' + STATE + '})()',
  skip: (x) => '(function(){' + PICK + 'if(v){v.currentTime=Math.max(0,Math.min(v.duration||1e9,v.currentTime+(' + Number(x) + ')))}return ' + STATE + '})()',
  rate: (x) => '(function(){' + PICK + 'if(v){v.playbackRate=' + Math.max(0.25, Math.min(4, Number(x) || 1)) + '}return ' + STATE + '})()',
  // 取消静音可能触发浏览器的自动播放限制而被暂停：自动恢复播放；不允许有声播放时退回静音继续播
  mute: () => '(function(){' + PICK + 'if(v){var was=!v.paused;v.muted=!v.muted;' +
    'if(was&&v.paused){var p=v.play();if(p&&p.catch)p.catch(function(){v.muted=true;v.play()})}}return ' + STATE + '})()',
};

function appleScriptFor(bundle, js) {
  const b = BROWSERS[bundle];
  const s = JSON.stringify(js); // 单行脚本：JSON 字符串转义与 AppleScript 兼容
  return b.kind === 'safari'
    ? 'tell application "' + b.app + '" to do JavaScript ' + s + ' in current tab of front window'
    : 'tell application "' + b.app + '" to execute active tab of front window javascript ' + s;
}

// 网址归一化：忽略协议、www.、末尾斜杠与 #锚点，便于判断「同一个网站 / 页面」
function normURL(u) {
  return String(u || '').trim().toLowerCase().replace(/^[a-z][a-z0-9+.-]*:\/\//, '').replace(/^www\./, '').replace(/#.*$/, '').replace(/\/+$/, '');
}
// 磁贴网址只有域名（如 youtube.com）时，同站任意页面都算已打开；带路径时要求路径一致或是其子页面。
// 完全一致的优先，其次取最先出现的。
function pickTab(tileURL, tabs) {
  const want = normURL(tileURL);
  if (!want) return null;
  const hostOnly = !/[/?]/.test(want);
  let best = null;
  for (const t of tabs) {
    const have = normURL(t.url);
    if (have === want) return t;
    if (!best && (have.startsWith(want + '/') || have.startsWith(want + '?') || (hostOnly && have.split(/[/?]/)[0] === want))) best = t;
  }
  return best;
}

function createRemote({ run }) {
  // 当前标签页的网址和标题（不需要开启 JavaScript 权限）
  async function tabInfo(bundle) {
    const b = BROWSERS[bundle];
    if (!b) return null;
    const script = b.kind === 'safari'
      ? 'tell application "Safari" to return (URL of current tab of front window) & "\\n" & (name of current tab of front window)'
      : 'tell application "' + b.app + '" to return (URL of active tab of front window) & "\\n" & (title of active tab of front window)';
    const out = await run('/usr/bin/osascript', ['-e', script]).catch(() => '');
    const [url, ...rest] = out.replace(/\n$/, '').split('\n');
    return url ? { url, title: rest.join('\n') } : null;
  }

  // 执行固定脚本；返回视频状态，或 { setup } 提示需要开启权限
  async function video(bundle, action, value) {
    const b = BROWSERS[bundle];
    if (!b || !SCRIPTS[action]) return { error: 'unsupported' };
    try {
      const out = await run('/usr/bin/osascript', ['-e', appleScriptFor(bundle, SCRIPTS[action](value))], { timeout: 4000 });
      return JSON.parse(out.trim() || '{"ok":0}');
    } catch (e) {
      const msg = String(e.message || e);
      if (/JavaScript|Apple 事件|Apple Events|AppleScript/i.test(msg) && !/-1743/.test(msg)) return { setup: b.setup };
      if (/-1743|not allowed|不允许/.test(msg)) return { setup: '在 Mac「系统设置 → 隐私与安全性 → 自动化」里允许 node 控制 ' + b.app };
      return { error: msg.split('\n')[0] };
    }
  }

  // 前台窗口的所有标签页（标题、网址、是否当前）。
  // 注意：AppleScript 变量名不区分大小写，制表符变量不能叫 T（会和 t 冲突）；批量读取属性，减少 Apple 事件次数
  async function tabs(bundle) {
    const b = BROWSERS[bundle];
    if (!b) return [];
    const safari = b.kind === 'safari';
    const script = [
      'set sep to character id 9',
      'tell application "' + b.app + '"',
      '  set w to front window',
      safari ? '  set cur to index of current tab of w' : '  set cur to active tab index of w',
      '  set us to URL of tabs of w',
      '  set ns to ' + (safari ? 'name' : 'title') + ' of tabs of w',
      'end tell',
      'set out to ""',
      'repeat with i from 1 to (count of us)',
      '  set out to out & i & sep & (i = cur) & sep & (item i of us) & sep & (item i of ns) & linefeed',
      'end repeat',
      'return out',
    ].join('\n');
    const out = await run('/usr/bin/osascript', ['-e', script]).catch((e) => { console.log('  标签页读取失败：' + e.message.split('\n')[0]); return ''; });
    return out.split('\n').filter(Boolean).map((l) => {
      const [i, cur, url, ...title] = l.split('\t');
      return { index: parseInt(i, 10), active: cur === 'true', url, title: title.join('\t') || url };
    });
  }

  async function switchTab(bundle, index) {
    const b = BROWSERS[bundle];
    const i = parseInt(index, 10);
    if (!b || !(i > 0)) return;
    const script = b.kind === 'safari'
      ? 'tell application "Safari" to set current tab of front window to tab ' + i + ' of front window'
      : 'tell application "' + b.app + '" to set active tab index of front window to ' + i;
    await run('/usr/bin/osascript', ['-e', script]);
  }

  async function closeTab(bundle, index) {
    const b = BROWSERS[bundle];
    const i = parseInt(index, 10);
    if (!b || !(i > 0)) return;
    await run('/usr/bin/osascript', ['-e', 'tell application "' + b.app + '" to close tab ' + i + ' of front window']);
  }

  // 书签栏：用浏览器自己的 AppleScript 读取（走已授权的「自动化」权限，不需要访问其他应用的数据目录）。
  // 批量取标题 / 网址；只展开一层文件夹；缓存 60 秒。Safari 的 AppleScript 不提供书签。
  const bmCache = {};
  async function bookmarks(bundle) {
    const b = BROWSERS[bundle];
    if (!b || b.kind === 'safari') return [];
    const c = bmCache[bundle];
    if (c && Date.now() - c.at < 60000) return c.list;
    const script = [
      'set sep to character id 9',
      'set out to ""',
      'tell application "' + b.app + '"',
      '  set bar to bookmarks bar',
      '  set ts to title of bookmark items of bar',
      '  set us to URL of bookmark items of bar',
      '  set fs to bookmark folders of bar',
      '  set fts to {}',
      '  set fus to {}',
      '  set fns to title of bookmark folders of bar',
      '  repeat with f in fs',
      '    set end of fts to (title of bookmark items of f)',
      '    set end of fus to (URL of bookmark items of f)',
      '  end repeat',
      'end tell',
      'repeat with i from 1 to (count of ts)',
      '  set out to out & "" & sep & (item i of ts) & sep & (item i of us) & linefeed',
      'end repeat',
      'repeat with j from 1 to (count of fns)',
      '  set a to item j of fts',
      '  set u to item j of fus',
      '  repeat with i from 1 to (count of a)',
      '    set out to out & (item j of fns) & sep & (item i of a) & sep & (item i of u) & linefeed',
      '  end repeat',
      'end repeat',
      'return out',
    ].join('\n');
    const out = await run('/usr/bin/osascript', ['-e', script], { timeout: 8000 }).catch((e) => { console.log('  书签读取失败：' + e.message.split('\n')[0]); return null; });
    if (out === null) return c ? c.list : [];
    const list = out.split('\n').filter(Boolean).slice(0, 80).map((l) => {
      const [folder, title, url] = l.split('\t');
      return { folder, title: title || url, url };
    }).filter((x) => /^https?:/.test(x.url || ''));
    bmCache[bundle] = { at: Date.now(), list };
    return list;
  }

  // 网页磁贴去重：在已运行的浏览器里找同一网站的标签页，找到就切过去并把窗口提到最前（不新开页面）。
  // 只查询正在运行的浏览器（is running 不会启动应用）；所有窗口的网址一次批量读取。
  async function focusExisting(url, preferApp) {
    const order = Object.keys(BROWSERS).filter((b) => !preferApp || BROWSERS[b].app === preferApp);
    for (const bundle of order) {
      const b = BROWSERS[bundle];
      const list = [
        'set sep to character id 9',
        'set out to ""',
        'if application "' + b.app + '" is running then',
        '  tell application "' + b.app + '"',
        '    set wi to 0',
        '    repeat with w in windows',
        '      set wi to wi + 1',
        '      set us to URL of tabs of w',
        '      repeat with ti from 1 to (count of us)',
        '        set out to out & wi & sep & ti & sep & (item ti of us) & linefeed',
        '      end repeat',
        '    end repeat',
        '  end tell',
        'end if',
        'return out',
      ].join('\n');
      const out = await run('/usr/bin/osascript', ['-e', list], { timeout: 4000 }).catch(() => '');
      const tabsFound = out.split('\n').filter(Boolean).map((l) => { const [w, t, ...u] = l.split('\t'); return { w: +w, t: +t, url: u.join('\t') }; });
      const hit = pickTab(url, tabsFound);
      if (!hit) continue;
      const focus = b.kind === 'safari'
        ? 'tell application "Safari"\n set current tab of window ' + hit.w + ' to tab ' + hit.t + ' of window ' + hit.w + '\n set index of window ' + hit.w + ' to 1\n activate\nend tell'
        : 'tell application "' + b.app + '"\n set active tab index of window ' + hit.w + ' to ' + hit.t + '\n set index of window ' + hit.w + ' to 1\n activate\nend tell';
      await run('/usr/bin/osascript', ['-e', focus], { timeout: 4000 });
      return { bundle, url: hit.url };
    }
    return null;
  }

  return { tabInfo, video, tabs, switchTab, closeTab, bookmarks, focusExisting, isBrowser: (b) => !!BROWSERS[b] };
}

module.exports = { createRemote, BROWSERS, normURL, pickTab };
