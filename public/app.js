/* iPadDuo 前端。
   刻意使用 ES5 语法（var / function / XHR），保证 iOS 12 Safari 无需编译即可运行；
   全部交互用事件委托，单次 innerHTML 渲染，避免老设备频繁重排。 */
(function () {
  'use strict';

  // ---------- 常量 ----------

  var TYPES = [
    { k: 'app', n: '应用' }, { k: 'url', n: '网页' }, { k: 'folder', n: '文件夹' }, { k: 'file', n: '文件' },
    { k: 'shortcut', n: '快捷指令' }, { k: 'system', n: '系统控制' }, { k: 'keys', n: '快捷键' }, { k: 'script', n: '脚本' }
  ];
  var TYPE_NAME = {};
  TYPES.forEach(function (t) { TYPE_NAME[t.k] = t.n; });

  var COLORS = ['auto', 'mint', 'teal', 'ocean', 'violet', 'rose', 'coral', 'amber', 'pearl', 'graphite', 'ink'];
  var SIZES = [{ k: 's', n: '小 1×1' }, { k: 'w', n: '宽 2×1' }, { k: 't', n: '高 1×2' }, { k: 'l', n: '大 2×2' }];

  var SYSTEM = [
    { k: 'playpause', n: '播放 / 暂停' }, { k: 'next', n: '下一首' }, { k: 'prev', n: '上一首' },
    { k: 'volup', n: '音量 +' }, { k: 'voldown', n: '音量 −' }, { k: 'mute', n: '静音切换' },
    { k: 'screenshot', n: '框选截图' }, { k: 'screenshotfull', n: '全屏截图' },
    { k: 'missioncontrol', n: '调度中心' }, { k: 'desktop', n: '显示桌面' }, { k: 'appexpose', n: '应用窗口' },
    { k: 'darkmode', n: '深色模式切换' }, { k: 'lock', n: '锁屏 / 熄屏' }, { k: 'sleep', n: '电脑睡眠' }
  ];
  var SYSTEM_NAME = {};
  SYSTEM.forEach(function (s) { SYSTEM_NAME[s.k] = s.n; });

  var BROWSERS = [
    { k: '', n: '默认浏览器' }, { k: 'Safari', n: 'Safari' }, { k: 'Google Chrome', n: 'Chrome' },
    { k: 'Microsoft Edge', n: 'Edge' }, { k: 'Arc', n: 'Arc' }, { k: 'Firefox', n: 'Firefox' }
  ];

  var FOLDER_CHIPS = [
    ['桌面', '~/Desktop'], ['下载', '~/Downloads'], ['文稿', '~/Documents'], ['个人', '~'],
    ['应用程序', '/Applications'], ['图片', '~/Pictures'], ['影片', '~/Movies'],
    ['iCloud 云盘', '~/Library/Mobile Documents/com~apple~CloudDocs']
  ];

  // 线性图标（系统控制 / 快捷键 / 脚本 磁贴使用）
  var P = 'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';
  var SYM = {
    playpause: '<path d="M5 5v14l8-7zM15 5v14M19 5v14"/>',
    next: '<path d="M5 5v14l9-7zM18 5v14"/>',
    prev: '<path d="M19 5v14l-9-7zM6 5v14"/>',
    volup: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9v6M14 12h6"/>',
    voldown: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M15 12h6"/>',
    mute: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9l5 6M21 9l-5 6"/>',
    screenshot: '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><circle cx="12" cy="12" r="3"/>',
    screenshotfull: '<rect x="3" y="5" width="18" height="13" rx="2"/><circle cx="12" cy="11.5" r="3"/><path d="M8 21h8"/>',
    missioncontrol: '<rect x="3" y="4" width="8" height="7" rx="1.5"/><rect x="13" y="4" width="8" height="7" rx="1.5"/><rect x="3" y="13" width="8" height="7" rx="1.5"/><rect x="13" y="13" width="8" height="7" rx="1.5"/>',
    desktop: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
    appexpose: '<rect x="3" y="7" width="12" height="10" rx="1.5"/><path d="M7 4h12a2 2 0 0 1 2 2v9"/>',
    darkmode: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    sleep: '<path d="M4 6h6l-6 7h6M14 4h6l-6 7h6"/>',
    keys: '<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6 10h1M10 10h1M14 10h1M18 10h0M7 14h10"/>',
    script: '<path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 6l-3 12"/>',
    shortcut: '<path d="M7 3h7l7 7v7a4 4 0 0 1-4 4h-7l-7-7V7a4 4 0 0 1 4-4z"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    file: '<path d="M6 3h8l5 5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h5"/>',
    url: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'
  };
  function svg(name) {
    return '<svg viewBox="0 0 24 24" ' + P + '>' + (SYM[name] || SYM.script) + '</svg>';
  }

  // ---------- 工具 ----------

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function uid() { return Math.random().toString(16).slice(2, 12); }
  function store(k, v) {
    try {
      if (v === undefined) return localStorage.getItem(k);
      localStorage.setItem(k, v);
    } catch (e) { return null; }
  }
  function closest(el, sel) {
    while (el && el.nodeType === 1) {
      if (el.matches ? el.matches(sel) : el.webkitMatchesSelector(sel)) return el;
      el = el.parentNode;
    }
    return null;
  }
  function hostOf(u) {
    var m = String(u || '').match(/^(?:[a-z][a-z0-9+.-]*:\/\/)?([^\/?#]+)/i);
    return m ? m[1].replace(/^www\./, '') : '';
  }

  var toastTimer;
  function toast(msg, isErr) {
    var t = $('toast');
    t.textContent = msg;
    t.className = 'toast show' + (isErr ? ' err' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = 'toast' + (isErr ? ' err' : ''); }, isErr ? 3200 : 1600);
  }

  var clientID = uid() + uid();

  function api(method, url, body, timeout) {
    return new Promise(function (resolve, reject) {
      var x = new XMLHttpRequest();
      x.open(method, url, true);
      x.timeout = timeout || 20000;
      x.setRequestHeader('Content-Type', 'application/json');
      x.setRequestHeader('X-Deck', '1');
      x.setRequestHeader('X-Deck-Client', clientID);
      var pin = store('deck-pin');
      if (pin) x.setRequestHeader('X-Deck-Pin', pin);
      x.onload = function () {
        var data = null;
        try { data = JSON.parse(x.responseText); } catch (e) { data = { error: x.responseText }; }
        if (x.status === 401) {
          var p = window.prompt('请输入 iPadDuo 的 PIN');
          if (p) {
            store('deck-pin', p);
            api(method, url, body).then(resolve, reject);
            return;
          }
        }
        if (x.status >= 200 && x.status < 300) resolve(data);
        else reject(new Error((data && data.error) || ('HTTP ' + x.status)));
      };
      x.onerror = function () { setConn(false); reject(new Error('无法连接到 Mac')); };
      x.onloadend = function () { if (x.status) setConn(true); };
      x.ontimeout = function () { reject(new Error('请求超时')); };
      x.send(body ? JSON.stringify(body) : null);
    });
  }

  function iconUrl(type, target, size) {
    var pin = store('deck-pin');
    return '/api/icon?type=' + encodeURIComponent(type) + '&target=' + encodeURIComponent(target) +
      '&size=' + size + '&v=13' + (pin ? '&pin=' + encodeURIComponent(pin) : '');
  }

  // ---------- 状态 ----------

  var config = null;
  var macInfo = {};
  var pageIndex = parseInt(store('deck-page') || '0', 10) || 0;
  var editing = false;

  function page() { return config.pages[pageIndex]; }

  var saveTimer;
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      api('POST', '/api/config', config).catch(function (e) { toast('保存失败：' + e.message, true); });
    }, 250);
  }

  // ---------- 配色 ----------

  // 手动配色（color 不为 auto 时）
  var PALETTE = {
    mint: '#2fd27a', teal: '#22b8b0', ocean: '#2f7bff', violet: '#8257ff', rose: '#f0569c',
    coral: '#ff6a55', amber: '#f5a524', pearl: '#aab4c0', graphite: '', ink: '#101215'
  };
  // 没有 logo 的磁贴（系统控制 / 快捷键 / 脚本）的默认主色
  var SYS_TINT = {
    playpause: '#e0475b', next: '#e0475b', prev: '#e0475b', volup: '#4f7cff', voldown: '#4f7cff', mute: '#4f7cff',
    missioncontrol: '#7a5cff', desktop: '#2f8cff', appexpose: '#5b6cff', lock: '#ff6a55', sleep: '#5a4fcf'
  };
  var TYPE_TINT = { keys: '#d98a1c', script: '#22a892' };

  function hexRgb(h) {
    h = String(h).replace('#', '');
    return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)];
  }
  function mix(c, to, k) {
    return [c[0] + (to[0] - c[0]) * k, c[1] + (to[1] - c[1]) * k, c[2] + (to[2] - c[2]) * k];
  }
  function rgb(c) { return 'rgb(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ')'; }

  function tintOf(t) {
    if (t.color && t.color !== 'auto') return PALETTE[t.color] || '';
    if (t.type === 'system') return SYS_TINT[t.target] || '';
    if (TYPE_TINT[t.type]) return TYPE_TINT[t.type];
    return t._tint || '';
  }

  // 主色 → 磁贴背景：先向深灰收一点饱和度，再做上亮下暗的渐变，避免品牌色过于刺眼
  function tileBg(t) {
    var hex = tintOf(t);
    if (!hex) return '';
    var c = mix(hexRgb(hex), [26, 29, 34], 0.2);
    return 'background:linear-gradient(160deg,' + rgb(mix(c, [255, 255, 255], 0.06)) + ',' + rgb(mix(c, [0, 0, 0], 0.52)) + ')';
  }

  // ---------- 渲染 ----------
  // 所有页面并排放在一条横向轨道（#track）里，翻页 = 平移轨道，手指拖动时 1:1 跟随。

  function renderTabs() {
    var html = '';
    config.pages.forEach(function (p, i) {
      html += '<button type="button" class="tab' + (i === pageIndex ? ' on' : '') + '" data-page="' + i + '">' + esc(p.name) + '</button>';
    });
    $('tabs').innerHTML = html;
  }

  function renderDots() {
    var html = '';
    if (config.pages.length > 1) {
      for (var i = 0; i < config.pages.length; i++) html += '<i class="' + (i === pageIndex ? 'on' : '') + '"></i>';
    }
    $('dots').innerHTML = html;
  }

  function subtitle(t) {
    if (t.sub) return t.sub;
    switch (t.type) {
      case 'url': return hostOf(t.target);
      case 'folder': case 'file': return t.target;
      case 'system': return SYSTEM_NAME[t.target] || '';
      case 'keys': return t.target;
      default: return TYPE_NAME[t.type] || '';
    }
  }

  // 放大的 logo + 背景里的超大淡 logo（仅宽/大/高磁贴）
  function artHtml(t) {
    var big = t.size && t.size !== 's';
    if (t.icon) return '<div class="art mono">' + esc(t.icon) + '</div>';
    var fb = esc((t.label || '?').charAt(0).toUpperCase()).replace(/'/g, '');
    var onerr = ' onerror="this.parentNode.className=\'art mono\';this.parentNode.innerHTML=\'' + fb + '\'"';
    var src;
    switch (t.type) {
      case 'app': case 'folder': case 'file': case 'shortcut': case 'url':
        src = esc(iconUrl(t.type, t.target, big ? 256 : 160));
        return (big ? '<img class="ghost-art" src="' + src + '" alt="" onerror="this.style.display=\'none\'">' : '') +
          '<div class="art' + (t.type === 'url' ? ' web' : '') + (t._plate ? ' plate' : '') + '"><img src="' + src + '" alt=""' + onerr + '></div>';
      case 'system':
        return '<div class="art glyph">' + svg(t.target) + '</div>';
      default:
        return '<div class="art glyph">' + svg(t.type) + '</div>';
    }
  }

  function tileHtml(t) {
    return '<div class="tile s-' + esc(t.size || 's') + '" data-id="' + esc(t.id) + '" style="' + tileBg(t) + '">' +
      artHtml(t) +
      '<div class="shade"></div>' +
      '<div class="txt"><b>' + esc(t.label || '未命名') + '</b><small>' + esc(subtitle(t)) + '</small></div>' +
      '<div class="tile-flash"></div><span class="badge">✎</span></div>';
  }

  function gridOf(i) {
    var sec = $('track').children[i];
    return sec ? sec.firstChild : null;
  }

  function renderPage(i) {
    var grid = gridOf(i);
    if (!grid) return;
    var p = config.pages[i];
    var html = '';
    if (!p.tiles.length && !editing) html = '<div class="empty">这个页面还是空的，点右上角「编辑」添加磁贴</div>';
    p.tiles.forEach(function (t) { html += tileHtml(t); });
    html += '<div class="tile add" data-add="1"><div class="plus">＋<small>添加磁贴</small></div></div>';
    grid.innerHTML = html;
    layoutPage(i);
  }

  // 只重绘当前页（编辑磁贴后）
  function renderGrid() { renderPage(pageIndex); }

  function renderPages() {
    var html = '';
    for (var i = 0; i < config.pages.length; i++) html += '<section class="page"><div class="grid"></div></section>';
    $('track').innerHTML = html;
    for (var j = 0; j < config.pages.length; j++) renderPage(j);
  }

  function render() {
    if (pageIndex >= config.pages.length) pageIndex = 0;
    // 保留运行中的状态类（外观、分屏），只重算与配置相关的类
    var keep = (' ' + document.body.className + ' ').match(/ (theme-light|stage-split|stage-min)(?= )/g) || [];
    document.body.className = (editing ? 'editing' : '') + (config.settings.showDock === false ? ' no-dock' : '') +
      (window.navigator.standalone ? ' standalone' : '') + ' tier-' + PERF.uiTier + (DEVICE.reducedMotion ? ' motion-reduced' : '') + keep.join('');
    renderTabs();
    renderDots();
    layout(); // 先算尺寸，再渲染各页
    renderPages();
    positionTrack(false);
  }

  // 布局：横屏 3 行 × 6 列、竖屏 5 行 × 4 列；磁贴尽量接近正方形；
  // 一行放不满时按实际数量收窄并居中，内容不足一屏时垂直居中（见 CSS .grid margin:auto）
  var GAP = 16;
  var metrics = { W: 0, cols: 6, colW: 150, rh: 150 };

  function layout() {
    if (!config) return;
    var stage = $('stage');
    var W = stage.clientWidth, H = stage.clientHeight - 16;
    // 主页区域的实际宽度（分屏时只有一半）：窄时 Dock 收起音量条与文字，避免挤出屏幕
    var appW = $('app').clientWidth || W;
    setClass(document.body, 'app-narrow', appW < 820); setClass(document.body, 'app-tiny', appW < 600);
    var inner = W - (W < 700 ? 28 : 44); // 减去页面左右内边距
    var landscape = window.innerWidth > window.innerHeight;
    var cols = config.settings.columns || (inner < 600 ? 3 : landscape ? 6 : 4);
    var rows = landscape ? 3 : 5;
    var colW = Math.floor((inner - GAP * (cols - 1)) / cols);
    var rh = Math.floor((H - GAP * (rows - 1)) / rows);
    rh = Math.max(96, Math.min(rh, Math.round(colW * 1.04), 230));
    metrics = { W: W, cols: cols, colW: colW, rh: rh, H: H, rows: rows };
    var track = $('track');
    track.style.setProperty('--rh', rh + 'px');
    track.className = 'track' + (rh < 128 ? ' compact' : '');
    var secs = track.children;
    for (var i = 0; i < secs.length; i++) {
      secs[i].style.width = W + 'px';
      layoutPage(i);
    }
    positionTrack(false);
  }

  function layoutPage(i) {
    var sec = $('track').children[i];
    if (!sec || !config.pages[i]) return;
    sec.style.width = metrics.W + 'px';
    var used = editing ? 1 : 0;
    config.pages[i].tiles.forEach(function (t) { used += (t.size === 'w' || t.size === 'l') ? 2 : 1; });
    var c = used > 0 && used < metrics.cols ? used : metrics.cols;
    sec.firstChild.style.gridTemplateColumns = 'repeat(' + c + ', ' + metrics.colW + 'px)';
    // 磁贴多于一屏时先压缩行高（不低于 104px），尽量一页看全；还放不下才在页内上下滚动
    var cells = editing ? 1 : 0;
    config.pages[i].tiles.forEach(function (t) { cells += t.size === 'l' ? 4 : (t.size === 'w' || t.size === 't') ? 2 : 1; });
    var need = Math.ceil(cells / metrics.cols), rh = metrics.rh;
    if (need > metrics.rows) rh = Math.max(104, Math.floor((metrics.H - GAP * (need - 1)) / need));
    sec.style.setProperty('--rh', rh + 'px');
    setClass(sec, 'compact', rh < 128);
  }

  // ---------- 翻页（平滑跟手） ----------

  var trackX = 0;

  function positionTrack(animate, dx) {
    var track = $('track');
    trackX = -pageIndex * metrics.W + (dx || 0);
    track.className = track.className.replace(/ ?anim/g, '') + (animate ? ' anim' : '');
    track.style.webkitTransform = track.style.transform = 'translate3d(' + trackX + 'px,0,0)';
  }

  var animEndTimer = null;
  function goPage(i) {
    clearTimeout(animEndTimer);
    animEndTimer = setTimeout(function () { positionTrack(false); }, 460); // 动画结束后去掉过渡，避免误判
    if (i < 0 || i >= config.pages.length) return positionTrack(true);
    pageIndex = i;
    store('deck-page', String(i));
    renderTabs();
    renderDots();
    positionTrack(true);
  }

  function swipeMove(dx) {
    var atEdge = (dx > 0 && pageIndex === 0) || (dx < 0 && pageIndex === config.pages.length - 1);
    positionTrack(false, atEdge ? dx * 0.32 : dx);
  }

  // 翻页动画进行中再次触摸：停在当前实际位置，返回相对目标页的偏移，让手指从这里接着拖
  function freezeTrack() {
    clearTimeout(animEndTimer);
    var track = $('track');
    if (track.className.indexOf('anim') < 0) return 0;
    var m = (getComputedStyle(track).webkitTransform || getComputedStyle(track).transform || '').match(/matrix(?:3d)?\(([^)]+)\)/);
    if (!m) return 0;
    var v = m[1].split(',');
    var x = parseFloat(v.length > 6 ? v[12] : v[4]) || 0;
    var offset = x + pageIndex * metrics.W;
    positionTrack(false, offset);
    return Math.abs(offset) < 1 ? 0 : offset;
  }

  // 滑过 1/4 屏，或松手时还在快速轻扫（方向与位移一致），即翻页
  function swipeEnd(dx, v) {
    var dir = 0;
    var flick = Math.abs(v) > 0.35 && Math.abs(dx) > 20;
    if (flick && (v < 0) === (dx < 0)) dir = dx < 0 ? 1 : -1;
    else if (!flick && Math.abs(dx) > metrics.W * 0.25) dir = dx < 0 ? 1 : -1;
    goPage(pageIndex + dir);
  }

  // 从服务端取回最新的图标主色（新应用 / 新网址；服务端在后台计算，可能要取几次）
  var tintTries = 0;
  function refreshTints() {
    api('GET', '/api/config').then(function (c) {
      var map = {};
      c.pages.forEach(function (p) { p.tiles.forEach(function (t) { map[t.id] = t; }); });
      var changed = false;
      config.pages.forEach(function (p) {
        p.tiles.forEach(function (t) {
          var n = map[t.id];
          if (n && (n._tint !== t._tint || n._plate !== t._plate)) { t._tint = n._tint; t._plate = n._plate; changed = true; }
        });
      });
      if (changed && $('sheet').className.indexOf('open') < 0) {
        for (var i = 0; i < config.pages.length; i++) renderPage(i);
      }
      if (c._pendingTints && ++tintTries < 8) setTimeout(refreshTints, 2500);
      else tintTries = 0;
    }, function () {});
  }

  // ---------- 屏幕常亮 ----------
  // iOS 12 的网页无法直接阻止自动锁屏；播放一段静音循环小视频可以让屏幕保持常亮。
  // 视频必须在用户触摸后才能开始播放，所以每次触摸时检查一下。

  var keepVideo = null, wakeLock = null, wakePending = false, wakeRetryAt = 0;
  function keepAwakeKick() {
    if (document.hidden) return;
    if (!config || config.settings.keepAwake === false) {
      if (keepVideo && !keepVideo.paused) keepVideo.pause();
      if (wakeLock) { wakeLock.release().catch(function () {}); wakeLock = null; }
      return;
    }
    if (wakeLock) return;
    if (navigator.wakeLock && window.isSecureContext && Date.now() > wakeRetryAt) {
      if (!wakePending) {
        wakePending = true;
        navigator.wakeLock.request('screen').then(function (lock) {
          wakePending = false;
          if (document.hidden || !config || config.settings.keepAwake === false) { lock.release().catch(function () {}); return; }
          wakeLock = lock;
          if (keepVideo) keepVideo.pause();
          lock.addEventListener('release', function () { if (wakeLock === lock) wakeLock = null; });
        }, function () { wakePending = false; wakeRetryAt = Date.now() + 30000; keepAwakeKick(); });
      }
      return;
    }
    if (!keepVideo) {
      keepVideo = document.createElement('video');
      keepVideo.setAttribute('playsinline', '');
      keepVideo.setAttribute('webkit-playsinline', '');
      keepVideo.setAttribute('muted', '');
      keepVideo.muted = true;
      keepVideo.loop = true;
      keepVideo.src = 'keepawake.mp4';
      keepVideo.className = 'keep-awake';
      document.body.appendChild(keepVideo);
    }
    if (keepVideo.paused) {
      var p = keepVideo.play();
      if (p && p.catch) p.catch(function () {});
    }
  }
  document.addEventListener('touchend', keepAwakeKick, false);
  document.addEventListener('click', keepAwakeKick, false);

  // ---------- 正在播放 / 歌词 ----------

  var np = {
    state: null,       // 最近一次 /api/live 里的 np
    base: 0, at: 0,    // 播放位置基准（秒）与取到它的本地时间
    trackId: null,
    lines: [],
    lyricsStatus: '',
    active: -1,        // 当前高亮的歌词行
    fillKey: '',       // 当前行填色动画的状态（行号 + 播放状态），变化时才重设
    visible: false,
    dismissed: null,   // 用户手动关闭时的曲目 id：同一首歌不再自动弹出
    pausedAt: 0,
    ticker: null,
    idleTimer: null,
    layout: store('deck-np-layout') || 'split'
  };

  function fmtTime(s) {
    s = Math.max(0, Math.floor(s || 0));
    var m = Math.floor(s / 60), r = s % 60;
    return m + ':' + (r < 10 ? '0' : '') + r;
  }

  function npPos() {
    var s = np.state;
    if (!s || !s.active) return 0;
    var p = np.base + (s.playing ? (Date.now() - np.at) / 1000 : 0);
    return s.duration ? Math.min(p, s.duration) : p;
  }

  function npArtUrl(id, blur) {
    var pin = store('deck-pin');
    return '/api/np/art?id=' + id + (blur ? '&blur=1' : '') + (pin ? '&pin=' + encodeURIComponent(pin) : '');
  }

  function setClass(el, cls, on) {
    if (!el) return;
    var has = (' ' + el.className + ' ').indexOf(' ' + cls + ' ') >= 0;
    if (on && !has) el.className += ' ' + cls;
    else if (!on && has) el.className = (' ' + el.className + ' ').replace(' ' + cls + ' ', ' ').replace(/^\s+|\s+$/g, '');
  }

  // ---------- 实时状态：音量 / 静音 / 正在播放 / 控制目标，一个接口一起取 ----------

  var liveTimer = null;
  function livePoll() {
    clearTimeout(liveTimer);
    if (document.hidden || !config) { liveTimer = setTimeout(livePoll, 4000); return; }
    api('GET', '/api/live').then(function (s) {
      setConn(true);
      if (!volDragging) showVolume(s.volume, s.muted);
      npUpdate(s.np || { active: false }, s.media);
      srcMini();
      liveTimer = setTimeout(livePoll, (s.np && s.np.playing) || np.visible ? 1500 : 2500);
    }, function () {
      setConn(false);
      liveTimer = setTimeout(livePoll, 4000);
    });
  }
  // ---------- 播放来源：左下角播放器可在「音乐」与各浏览器里的视频之间切换 ----------
  // 选中视频来源后，迷你播放器显示该视频窗口的实时缩略图，Dock 的播放 / 上一首 / 下一首改为控制这个视频（±10 秒）。
  var src = { list: [], sel: store('deck-src') || '', timer: null, open: false, thumbs: {}, thumbTimer: null };
  function srcFind(id) { for (var i = 0; i < src.list.length; i++) if (src.list[i].id === id) return src.list[i]; return null; }
  function srcVideo() { var c = srcFind(src.sel); return c && c.kind === 'video' ? c : null; }
  function srcPoll() {
    clearTimeout(src.timer);
    if (document.hidden || !config) { src.timer = setTimeout(srcPoll, 6000); return; }
    api('GET', '/api/sources').then(function (r) { srcApply(r.sources || []); }, function () {}).then(function () {
      src.timer = setTimeout(srcPoll, src.open ? 2000 : tp.visible || PERF.uiTier === 'lite' ? 8000 : 4000);
    });
  }
  function srcApply(list) {
    src.list = list;
    var videos = 0;
    for (var i = 0; i < list.length; i++) if (list[i].kind === 'video') videos++;
    setClass($('srcBtn'), 'on', videos > 0 || list.length > 1);
    $('srcCount').textContent = list.length > 1 ? String(list.length) : '';
    if (src.sel && !srcFind(src.sel) && src.sel.indexOf('video:') === 0) src.sel = ''; // 视频标签关掉了：回到音乐
    srcMini();
    if (src.open) srcRender();
  }
  function srcThumb(bundle, w, cb) {
    var x = new XMLHttpRequest();
    x.open('GET', '/api/sources/thumb?bundle=' + encodeURIComponent(bundle) + '&w=' + w + '&_=' + Date.now(), true);
    x.responseType = 'blob'; x.timeout = 6000;
    x.setRequestHeader('X-Deck', '1');
    var pin = store('deck-pin'); if (pin) x.setRequestHeader('X-Deck-Pin', pin);
    x.onload = function () {
      if (x.status !== 200) return cb(null);
      var URLs = window.URL || window.webkitURL, old = src.thumbs[bundle];
      src.thumbs[bundle] = URLs.createObjectURL(x.response);
      if (old) setTimeout(function () { URLs.revokeObjectURL(old); }, 1000);
      cb(src.thumbs[bundle]);
    };
    x.onerror = x.ontimeout = function () { cb(null); };
    x.send();
  }
  // 迷你播放器：选中视频时显示视频信息与实时缩略图（主页可见时每 3 秒刷新）
  function srcMini() {
    var v = srcVideo(), mini = $('mini');
    clearTimeout(src.thumbTimer);
    if (!v) { if (/ video/.test(mini.className)) { setClass(mini, 'video', false); $('miniArt').style.backgroundImage = ''; npUpdate(np.state || { active: false }); } return; }
    mini.className = 'mini on video' + (v.playing ? ' playing' : '');
    $('miniTitle').textContent = v.title;
    $('miniSub').textContent = (v.sub ? v.sub + ' · ' : '') + v.name;
    setPlayIcons(v.playing);
    if (src.thumbs[v.bundle]) $('miniArt').style.backgroundImage = 'url("' + src.thumbs[v.bundle] + '")';
    if (document.hidden || tp.visible) return;
    var refresh = function () {
      srcThumb(v.bundle, 160, function (u) {
        if (u && srcVideo() === v) $('miniArt').style.backgroundImage = 'url("' + u + '")';
        if (srcVideo() && !document.hidden && !tp.visible) src.thumbTimer = setTimeout(srcMini, PERF.uiTier === 'lite' ? 6000 : 3000);
      });
    };
    refresh();
  }
  function srcOpen(on) {
    src.open = on;
    setClass($('srcSheet'), 'on', on);
    if (on) { srcRender(); srcPoll(); srcThumbsLoop(); } else clearTimeout(src.sheetThumbs);
  }
  function srcThumbsLoop() {
    clearTimeout(src.sheetThumbs);
    if (!src.open || document.hidden) return;
    var pending = 0;
    src.list.forEach(function (c) {
      if (c.kind !== 'video') return;
      pending++;
      srcThumb(c.bundle, 360, function (u) {
        var el = document.querySelector('.src-card[data-sid="' + c.id + '"] .src-thumb');
        if (u && el) el.style.backgroundImage = 'url("' + u + '")';
        if (--pending === 0) src.sheetThumbs = setTimeout(srcThumbsLoop, PERF.uiTier === 'lite' ? 4000 : 2000);
      });
    });
    if (!pending) src.sheetThumbs = setTimeout(srcThumbsLoop, 2000);
  }
  function srcRender() {
    var box = $('srcList');
    if (!src.list.length) { box.innerHTML = '<div class="src-empty">没有正在播放的内容<br>在 Mac 上播放音乐，或在浏览器里打开视频（需开启浏览器的「Apple 事件中的 JavaScript」）</div>'; return; }
    var cur = srcFind(src.sel) ? src.sel : '';
    if (!cur) for (var i = 0; i < src.list.length; i++) if (src.list[i].kind === 'music') { cur = src.list[i].id; break; } // 未选择时迷你播放器显示音乐
    box.innerHTML = src.list.map(function (c) {
      var art = c.kind === 'video' ? src.thumbs[c.bundle] : c.art ? npArtUrl(c.art) : '';
      var pct = c.d ? Math.max(0, Math.min(100, c.t / c.d * 100)) : 0;
      return '<div class="src-card ' + c.kind + (c.id === cur ? ' sel' : '') + '" data-src="pick" data-sid="' + esc(c.id) + '">' +
        '<div class="src-thumb"' + (art ? ' style="background-image:url(&quot;' + art + '&quot;)"' : '') + '><i>' + (c.kind === 'video' ? '视频' : '音乐') + '</i></div>' +
        '<div class="src-meta"><b>' + esc(c.title || '未知') + '</b><small>' + esc((c.sub ? c.sub + ' · ' : '') + c.name) + '</small>' +
        (c.kind === 'video' && c.d ? '<div class="src-bar"><u style="width:' + pct.toFixed(1) + '%"></u></div>' : '') + '</div>' +
        '<div class="src-acts"><button class="pill" type="button" data-src="toggle" data-sid="' + esc(c.id) + '">' + (c.playing ? '暂停' : '播放') + '</button>' +
        (c.kind === 'video' ? '<button class="pill" type="button" data-src="watch" data-sid="' + esc(c.id) + '">观看</button>' : '') + '</div></div>';
    }).join('');
  }
  function srcAct(id, action) {
    return api('POST', '/api/sources/act', { id: id, action: action }).then(function (r) {
      var c = srcFind(id);
      if (c && r && r.ok && c.kind === 'video') { c.playing = !!r.p; c.t = r.t; c.d = r.d; }
      else if (c && action === 'playpause') c.playing = !c.playing;
      srcMini(); if (src.open) srcRender();
      if (r && r.setup) toast('需要开启浏览器权限：' + r.setup, true);
      return r;
    }, function (e) { toast(e.message, true); });
  }
  function srcTap(el) {
    var a = el.getAttribute('data-src');
    if (a === 'open') return srcOpen(!src.open);
    if (a === 'close') return srcOpen(false);
    if (a === 'pick') {
      src.sel = el.getAttribute('data-sid'); store('deck-src', src.sel);
      srcRender(); srcMini();
      if (src.sel.indexOf('music:') === 0) npUpdate(np.state || { active: false });
      return setTimeout(function () { srcOpen(false); }, 160);
    }
    var id = el.getAttribute('data-sid'), c = srcFind(id);
    if (!c) return;
    if (a === 'toggle') return srcAct(id, 'playpause');
    if (a === 'watch') {
      srcOpen(false);
      // 把这个浏览器切到前台，再进入副屏的观看视图
      return api('POST', '/api/openapp', { bundle: c.bundle }).then(function () {
        ctl.pin = c.bundle; tpOpen('screen', 'full', 'watch');
      }, function (e) { toast(e.message, true); });
    }
  }

  function liveSoon(ms) { clearTimeout(liveTimer); liveTimer = setTimeout(livePoll, ms || 500); }

  function npUpdate(s, media) {
    var prev = np.state;
    if (media) lastMedia = media;
    else if (s.app && !lastMedia) lastMedia = { bundle: s.app, name: s.app === 'com.apple.Music' ? '音乐' : 'QQ音乐' };
    np.state = s;
    var mini = $('mini');
    var appName = (media && media.name) || '';
    if (!s.active) {
      mini.className = 'mini';
      $('miniTitle').textContent = '未在播放';
      $('miniSub').textContent = appName ? '点按打开 ' + appName : '打开音乐类磁贴开始';
      $('miniArt').style.backgroundImage = '';
      setPlayIcons(false);
      if (np.visible) npHide();
      return;
    }
    // 位置：差得不多就不重设，避免进度条和填色抖动
    var predicted = npPos();
    if (!prev || prev.id !== s.id || prev.playing !== s.playing || Math.abs(predicted - s.position) > 1.2) {
      np.base = s.position;
      np.at = Date.now();
    }
    mini.className = 'mini on' + (s.playing ? ' playing' : '');
    $('miniTitle').textContent = s.title;
    $('miniSub').textContent = (s.artist || '') + (appName ? ' · ' + appName : '');
    setPlayIcons(s.playing);

    // 换歌：更新标题、封面，重新取歌词
    if (s.id !== np.trackId) {
      np.trackId = s.id;
      np.lines = [];
      np.lyricsStatus = '';
      np.active = -1;
      $('npTitle').textContent = s.title;
      $('npArtist').textContent = [s.artist, s.album].filter(Boolean).join(' — ');
      $('npDur').textContent = fmtTime(s.duration);
      $('npArt').style.backgroundImage = '';
      $('npBg').style.backgroundImage = '';
      $('miniArt').style.backgroundImage = '';
      setClass($('np'), 'has-art', false);
      $('np').style.cssText = '';
      renderLyrics();
    }
    if (s.art && !$('npArt').style.backgroundImage) {
      $('npArt').style.backgroundImage = $('miniArt').style.backgroundImage = 'url("' + npArtUrl(s.id) + '")';
      $('npBg').style.backgroundImage = 'url("' + npArtUrl(s.id, true) + '")';
      setClass($('np'), 'has-art', true);
    }
    if (s.tint && !$('np').style.cssText) $('np').style.cssText = 'color:inherit;--np-accent:' + s.tint;
    if (s.lyrics !== np.lyricsStatus) {
      np.lyricsStatus = s.lyrics;
      if (s.lyrics === 'ok') {
        api('GET', '/api/lyrics?id=' + s.id).then(function (r) {
          if (np.trackId !== s.id) return;
          np.lines = r.lines || [];
          renderLyrics();
        }, function () {});
      } else {
        renderLyrics();
      }
    }
    if (np.visible && prev && prev.playing !== s.playing) npTick(true);

    // 自动显示 / 隐藏：开始播放时弹出；用户手动关掉后同一首歌不再弹；暂停超过 12 秒自动回到桌面
    if (prev && prev.id !== s.id) np.dismissed = null;
    if (s.playing) np.pausedAt = 0;
    else if (!np.pausedAt) np.pausedAt = Date.now();
    var sheetOpen = $('sheet').className.indexOf('open') >= 0 || $('picker').className.indexOf('open') >= 0;
    if (!np.visible && s.playing && config.settings.autoLyrics !== false && !editing && !sheetOpen && !tp.visible &&
        np.dismissed !== s.id && Date.now() - lastTouchAt > 20000) npShow(false);
    if (np.visible && np.auto && !s.playing && Date.now() - np.pausedAt > 12000) npHide();
  }

  var lastMedia = null;
  function openMediaApp() {
    var b = lastMedia && lastMedia.bundle;
    if (!b) return toast('先从磁贴打开一个音乐应用');
    api('POST', '/api/openapp', { bundle: b }).then(function () { toast('已打开 ' + lastMedia.name); }, function (e) { toast(e.message, true); });
  }

  function setPlayIcons(playing) {
    var cls = 'ic ' + (playing ? 'ic-pause' : 'ic-play');
    $('npPlayIc').className = cls;
    $('dockPlayIc').className = cls;
  }

  function renderLyrics() {
    var box = $('npLines');
    var html = '';
    if (np.lines.length) {
      np.lines.forEach(function (l, i) {
        html += '<p data-i="' + i + '"><span class="lt">' + esc(l.text) + '</span>' + (l.tr ? '<small>' + esc(l.tr) + '</small>' : '') + '</p>';
      });
      setClass($('np'), 'no-lyrics', false);
    } else {
      var msg = np.lyricsStatus === 'none' ? '暂无歌词' : np.lyricsStatus === 'loading' || !np.lyricsStatus ? '正在查找歌词…' : '';
      html = '<p class="np-msg">' + msg + '</p>';
      setClass($('np'), 'no-lyrics', true);
    }
    box.innerHTML = html;
    np.active = -1;
    np.fillKey = '';
    npTick(true);
  }

  // 当前行的卡拉 OK 式填色：按这一句的时长从左到右点亮；暂停时停在当前进度
  function fillLine(p, idx, pos) {
    var span = p && p.firstChild;
    if (!span || !span.style) return;
    if (PERF.uiTier === 'lite' || DEVICE.reducedMotion) return;
    var l = np.lines[idx], next = np.lines[idx + 1];
    var dur = Math.max(0.6, Math.min(12, (next ? next.t : l.t + 5) - l.t));
    var done = Math.max(0, Math.min(1, (pos - l.t) / dur));
    var playing = np.state && np.state.playing;
    span.style.webkitTransition = span.style.transition = 'none';
    span.style.backgroundPosition = (100 - done * 100) + '% 0';
    if (!playing || done >= 1) return;
    void span.offsetWidth;
    var t = 'background-position ' + ((1 - done) * dur).toFixed(2) + 's linear';
    span.style.webkitTransition = span.style.transition = t;
    span.style.backgroundPosition = '0% 0';
  }

  function clearFill(p) {
    var span = p && p.firstChild;
    if (!span || !span.style) return;
    span.style.webkitTransition = span.style.transition = 'none';
    span.style.backgroundPosition = '';
  }

  // 每 250ms：计算当前歌词行，行号或播放状态变化时才动 DOM
  function npTick(force) {
    var pos = npPos();
    var s = np.state;
    if (s && s.duration) {
      var f = $('npFill');
      f.style.webkitTransform = f.style.transform = 'scaleX(' + Math.min(1, pos / s.duration) + ')';
      $('npCur').textContent = fmtTime(pos);
    }
    if (!np.lines.length) return;
    var lead = pos + 0.2; // 略微提前，视觉上更跟拍
    var idx = -1;
    for (var i = 0; i < np.lines.length; i++) {
      if (np.lines[i].t <= lead) idx = i;
      else break;
    }
    var key = idx + (s && s.playing ? 'p' : 's');
    if (key === np.fillKey && !force) return;
    var ps = $('npLines').children;
    if (idx !== np.active || force) {
      if (np.active >= 0 && ps[np.active]) { ps[np.active].className = ''; clearFill(ps[np.active]); }
      np.active = idx;
      var cur = ps[Math.max(0, idx)];
      if (idx >= 0 && cur) cur.className = 'on';
      if (cur) {
        var h = $('npLyrics').clientHeight;
        var y = Math.round(h * (np.layout === 'focus' ? 0.5 : 0.42) - (cur.offsetTop + cur.offsetHeight / 2));
        var box = $('npLines');
        box.style.webkitTransform = box.style.transform = 'translate3d(0,' + y + 'px,0)';
      }
    }
    np.fillKey = key;
    if (idx >= 0) fillLine(ps[idx], idx, pos);
  }

  function npApplyLayout() {
    setClass($('np'), 'focus', np.layout === 'focus');
    $('npLayoutBtn').textContent = np.layout === 'focus' ? '封面' : '大字';
  }

  // 沉浸模式：7 秒没碰屏幕就淡出控件，只留封面和歌词
  function npWake() {
    setClass($('np'), 'calm', false);
    clearTimeout(np.idleTimer);
    np.idleTimer = setTimeout(function () { if (np.visible) setClass($('np'), 'calm', true); }, 7000);
  }

  // manual = 用户主动打开（点迷你播放器 / 上滑）：不会因为暂停而被自动关掉
  function npShow(manual) {
    if (np.visible || !np.state || !np.state.active) return;
    np.visible = true;
    np.auto = !manual;
    var el = $('np');
    npApplyLayout();
    setClass(el, 'open', true);
    void el.offsetWidth;
    setClass(el, 'shown', true);
    np.active = -1;
    npTick(true);
    clearInterval(np.ticker);
    np.ticker = setInterval(npTick, 250);
    npWake();
    liveSoon(300);
  }

  function npHide(byUser) {
    if (!np.visible) return;
    np.visible = false;
    if (byUser && np.state) np.dismissed = np.state.id;
    clearInterval(np.ticker);
    clearTimeout(np.idleTimer);
    var el = $('np');
    setClass(el, 'shown', false);
    setTimeout(function () { if (!np.visible) { setClass(el, 'open', false); setClass(el, 'calm', false); } }, 380);
  }


  // ---------- 设备识别 ----------
  // 网页拿不到准确型号，这里按「屏幕逻辑尺寸 + 系统版本」推断，再决定性能档：
  //   lite —— iOS 12 及更早（A7 / A8，如 iPad mini 2）：省电优先，画面模式降分辨率与帧率，关掉持续动画
  //   balanced —— 较早的 iPadOS：均衡起步；full —— 较新系统：运行稳定后提高画面预算。
  var DEVICE = (function () {
    var ua = navigator.userAgent;
    var isIPad = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    var m = ua.match(/OS (\d+)_(\d+)/) || ua.match(/Version\/(\d+)\.(\d+)/);
    var os = m ? parseInt(m[1], 10) : 0;
    var s = Math.min(window.screen.width, window.screen.height), l = Math.max(window.screen.width, window.screen.height);
    var key = s + 'x' + l;
    var MODELS = {
      '768x1024': os && os <= 12 ? 'iPad mini 2 / 3 / 4 或 iPad Air（9.7 英寸）' : 'iPad mini 5 / iPad（9.7 英寸）',
      '744x1133': 'iPad mini 6 / 7',
      '834x1112': 'iPad Pro 10.5 / iPad Air 3',
      '810x1080': 'iPad（10.2 英寸）',
      '820x1180': 'iPad Air 4 / 5 / iPad 10',
      '834x1194': 'iPad Pro 11',
      '1024x1366': 'iPad Pro 12.9'
    };
    var name = isIPad ? (MODELS[key] || 'iPad（' + key + '）') : (navigator.maxTouchPoints > 0 ? '触屏设备' : '电脑浏览器');
    var autoTier = isIPad && os && os <= 12 ? 'lite' : isIPad && os < 16 ? 'balanced' : 'full';
    var forced = store('deck-tier');
    var tier = forced === 'lite' || forced === 'balanced' || forced === 'full' ? forced : autoTier;
    return {
      isIPad: isIPad, os: os, name: name, key: key, autoTier: autoTier, tier: tier,
      // 随航需要 iPadOS 13+；iPad mini 2 这类 iOS 12 设备不支持
      sidecar: isIPad && os >= 13,
      reducedMotion: !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches),
      screenW: tier === 'lite' ? 1024 : tier === 'balanced' ? 1280 : 1600,
      frameMs: tier === 'lite' ? 125 : tier === 'balanced' ? 67 : 42
    };
  })();


  // 界面动效与远程图像独立调节；所有接口均可在 iOS 12 缺省。
  var STREAM_PROFILES = [
    { w: 640, fps: 6, q: 0.45 }, { w: 1024, fps: 8, q: 0.55 },
    { w: 1280, fps: 15, q: 0.60 }, { w: 1600, fps: 24, q: 0.65 }
  ];
  var PERF = { max: DEVICE.tier === 'lite' ? 1 : DEVICE.tier === 'balanced' ? 2 : 3,
    level: DEVICE.tier === 'lite' ? 1 : 2, uiTier: DEVICE.tier, rtt: 0, samples: [], since: 0, changedAt: 0,
    uiUntil: 0, uiLast: 0, uiSamples: [], uiFrame: null };
  function monotonic() { return window.performance && window.performance.now ? window.performance.now() : Date.now(); }
  function nextFrame(fn) { return window.requestAnimationFrame ? window.requestAnimationFrame(fn) : setTimeout(function () { fn(monotonic()); }, 16); }
  function cancelFrame(id) { if (window.cancelAnimationFrame) window.cancelAnimationFrame(id); else clearTimeout(id); }
  // 外观：dark / light / auto（跟随 iPad 系统，iOS 13 起支持；更早的系统按深色）
  function themeApply() {
    var t = store('deck-theme') || 'dark', mq = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)');
    var light = t === 'light' || (t === 'auto' && mq && mq.matches);
    setClass(document.body, 'theme-light', !!light);
    var meta = document.querySelector && document.querySelector('meta[name="theme-color"]'); if (meta) meta.setAttribute('content', light ? '#eceef2' : '#0a0b0d');
    if (mq && !themeApply.bound && mq.addListener) { themeApply.bound = true; mq.addListener(function () { if ((store('deck-theme') || 'dark') === 'auto') themeApply(); }); }
  }
  function perfApplyUI() {
    ['lite', 'balanced', 'full'].forEach(function (t) { setClass(document.body, 'tier-' + t, PERF.uiTier === t); });
    setClass(document.body, 'motion-reduced', DEVICE.reducedMotion);
  }
  function perfProfile() {
    var p = STREAM_PROFILES[PERF.level], r = $('tpPad').getBoundingClientRect();
    var visibleW = r.width > 0 ? r.width : Math.max(window.screen.width, window.screen.height);
    return { w: Math.max(320, Math.min(p.w, Math.round(visibleW * Math.min(window.devicePixelRatio || 1, 2)))), fps: p.fps, q: p.q };
  }
  function perfSample(decodeMs, cycleMs) {
    var now = monotonic(), p = STREAM_PROFILES[PERF.level], budget = 1000 / p.fps;
    if (!PERF.since) PERF.since = now;
    // 静止内容不出帧属于正常现象；较长的内容间隔不作为掉帧样本。
    var dynamic = cycleMs > 0 && cycleMs < 500;
    PERF.samples.push({ bad: decodeMs > Math.max(28, budget * 0.65) || (dynamic && cycleMs > budget * 1.8) || PERF.rtt > 140,
      good: decodeMs < Math.max(18, budget * 0.4) && (!dynamic || cycleMs < budget * 1.5) && PERF.rtt < 70 });
    if (PERF.samples.length > 100) PERF.samples.shift();
    if (now - PERF.since < 4000 || PERF.samples.length < 8 || now - PERF.changedAt < 5000) return;
    var bad = 0, good = 0;
    PERF.samples.forEach(function (s) { if (s.bad) bad++; if (s.good) good++; });
    var level = PERF.level;
    if (bad / PERF.samples.length > 0.3 && level > 0) level--;
    else if (good / PERF.samples.length > 0.9 && now - PERF.changedAt > 20000 && level < PERF.max) level++;
    if (level !== PERF.level) {
      PERF.level = level; PERF.changedAt = now;
      // 当前帧确认后再切订阅，避免旧 fack 解锁新订阅。
      scr.reprofile = true;
    }
    PERF.samples = []; PERF.since = now;
  }
  function perfTouch() {
    PERF.uiUntil = monotonic() + 350;
    if (PERF.uiFrame || document.hidden) return;
    PERF.uiLast = 0;
    var step = function (at) {
      PERF.uiFrame = null;
      if (document.hidden || at > PERF.uiUntil) return;
      if (PERF.uiLast) {
        PERF.uiSamples.push(at - PERF.uiLast); if (PERF.uiSamples.length > 45) PERF.uiSamples.shift();
        if (PERF.uiSamples.length === 45) {
          var bad = PERF.uiSamples.filter(function (dt) { return dt > 40; }).length;
          if (bad > 10 && PERF.uiTier !== 'lite') { PERF.uiTier = PERF.uiTier === 'full' ? 'balanced' : 'lite'; perfApplyUI(); PERF.uiSamples = []; }
        }
      }
      PERF.uiLast = at; PERF.uiFrame = nextFrame(step);
    };
    PERF.uiFrame = nextFrame(step);
  }

  var PICONS = {
    plus: '<path d="M12 5v14M5 12h14"/>', search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/>',
    up: '<path d="M6 14l6-6 6 6"/>', down: '<path d="M6 10l6 6 6-6"/>',
    sidebar: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M9 4v16"/>',
    split: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M13 4v16"/>',
    cmd: '<path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z"/>',
    code: '<path d="M8 8l-4 4 4 4M16 8l4 4-4 4"/>', stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
    ghost: '<path d="M6 20V11a6 6 0 0 1 12 0v9l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5z"/><circle cx="10" cy="11" r=".6"/><circle cx="14" cy="11" r=".6"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    speaker: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/>',
    wave: '<path d="M4 12h2M8 8v8M12 5v14M16 8v8M20 12h0"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>'
  };
  function picon(n) { return '<svg viewBox="0 0 24 24" ' + P + '>' + (PICONS[n] || PICONS.cmd) + '</svg>'; }

  // ---------- 触控：控制 / 触控板 / 画面 ----------
  // 控制：按 Mac 最前面的应用给出整屏的大号控件（视频、音乐、演示、AI 应用、通用快捷键）；
  // 触控板：单指移动、轻点单击、双指滚动（带惯性）、双指轻点右键、轻点后按住拖动；
  // 画面：把 Mac 最前面的窗口投到 iPad 上直接点，双指捏合放大。
  // 所有浮层统一：左上角大号「‹ 桌面」返回，或在顶栏向下滑动关闭。

  // 每次页面加载独立的输入会话，HTTP 回退与 WebSocket 使用相同的顺序编号。
  var tp = { visible: false, ws: null, ready: false, g: null, lastTap: null, composing: false, mode: '', inertia: null, echoTimer: null, size: 'full', view: 'plain', viewUrl: '', inputSeq: 0, inputQueue: [], inputTimer: null, httpBusy: false, reconnect: null };

  function tpConnect() {
    if (tp.ws || !window.WebSocket || document.hidden || !tp.visible) return;
    clearTimeout(tp.reconnect);
    var pin = store('deck-pin');
    var ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws?client=' + clientID + (pin ? '&pin=' + encodeURIComponent(pin) : ''));
    tp.ws = ws;
    ws.onopen = function () {
      if (tp.ws !== ws) return;
      tp.ready = true; tp.lastPong = Date.now(); setClass($('tp'), 'live', true); tpPing(); tpFlush();
      if (scr.on && !document.hidden) scrSubscribe();
    };
    ws.onmessage = function (e) {
      if (tp.ws !== ws) return;
      if (typeof e.data !== 'string') return scrOnFrame(e.data);
      var m; try { m = JSON.parse(e.data); } catch (err) { return; }
      if (m.subscription && m.subscription !== scr.subscription) { if (m.t === 'frame') scr.pendingMeta = null; return; }
      if (m.t === 'frame') { scr.pendingMeta = m.meta; scr.pendingBytes = m.bytes || 0; }
      else if (m.t === 'pong') { PERF.rtt = Math.max(0, Date.now() - m.id); tp.lastPong = Date.now(); tpShowRtt(PERF.rtt); }
      else if (m.t === 'screenhealth') {
        scr.healthAt = Date.now();
        if (scr.on && scr.lastDisplayAt && Date.now() - scr.lastDisplayAt > 2500) $('tpFps').textContent = '静止画面 · 已连接';
      }
      else if (m.t === 'screenerr') scrFallback(m.err);
      else if (m.t === 'rtc-offer') rtcOffer(m.sdp);
      else if (m.t === 'rtc-meta') rtcMeta(m.meta);
      else if (m.t === 'rtc-error') rtcFail(m.err);
      else if (m.t === 'rtc-moved') toast(m.done ? (m.app ? m.app + ' 已移动' : '窗口已移动') : '没有可移动的窗口：先在 Mac 上点一下要移动的窗口', !m.done);
      else if (m.t === 'rtc-state' && (m.state === 'failed' || m.state === 'closed') && scr.rtc) rtcFail('rtc-' + m.state);
      else if (m.t === 'inputerr') {
        tpCancel();
        if (Date.now() - (tp.errorAt || 0) > 1800) {
          tp.errorAt = Date.now();
          toast(m.err === 'stale-frame' ? '窗口已变化，正在刷新画面，请重试' : m.err === 'input-busy' ? '另一台设备正在操作，请稍候' : '输入连接正在恢复…', true);
        }
      }
    };
    var disconnected = function () {
      if (tp.ws !== ws) return;
      tp.ready = false; tp.ws = null; clearTimeout(pingTimer); tpShowRtt(null); setClass($('tp'), 'live', false);
      tpCancel();
      scr.streaming = false; scr.pendingMeta = null; rtcTeardown();
      if (scr.on) { scrAbortLoad(); scrNext(); }
      try { ws.close(); } catch (e) { /* 已关闭 */ }
      if (tp.visible && !document.hidden) tp.reconnect = setTimeout(tpConnect, 1200);
    };
    ws.onclose = disconnected; ws.onerror = disconnected;
  }

  var pingTimer = null;
  function tpPing() {
    clearTimeout(pingTimer);
    if (!tp.visible || document.hidden) return;
    if (tp.ready) {
      if (tp.lastPong && Date.now() - tp.lastPong > 8000) { tp.ws.close(); return; }
      tpSend({ t: 'ping', id: Date.now() });
    } else tpSend({ t: 'hb' });
    pingTimer = setTimeout(tpPing, 2000);
  }
  function tpShowRtt(ms) {
    var el = $('tpRtt');
    if (ms === null) { el.textContent = ''; return; }
    el.textContent = '网络 ' + ms + ' ms';
    el.className = 'tp-rtt ' + (ms < 30 ? 'good' : ms < 80 ? 'ok' : 'bad');
  }
  function tpSend(o) {
    var control = /^(ping|screen|fack|f|rtc|rtc-answer|rtc-cmd)$/.test(o.t);
    if (!control) {
      o.seq = ++tp.inputSeq;
      if (/^(tap|pd|pm|sa|hv)$/.test(o.t)) {
        if (!scr.meta || !scr.meta.frameId) return;
        o.frameId = scr.meta.frameId;
      }
    }
    if (control) {
      if (tp.ready && tp.ws) { try { tp.ws.send(JSON.stringify(o)); } catch (e) { tp.ws.close(); } }
      return;
    }
    // HTTP 请求在途时继续排队，不让重连后的新输入越过旧请求。
    if (tp.ready && tp.ws && !tp.httpBusy && !tp.inputQueue.length && (tp.ws.bufferedAmount || 0) < 65536) {
      try { tp.ws.send(JSON.stringify(o)); return; } catch (e) { /* 使用有序 HTTP 回退 */ }
    }
    var q = tp.inputQueue, last = q[q.length - 1];
    if (o.t === 'release') q.length = 0;
    if (last && /^(m|s|sa|pm)$/.test(o.t) && last.t === o.t && last.frameId === o.frameId &&
        (o.t === 'pm' || (Math.abs(last.x + o.x) <= 2000 && Math.abs(last.y + o.y) <= 2000))) {
      if (o.t === 'pm') q[q.length - 1] = o;
      else { last.x += o.x; last.y += o.y; last.seq = o.seq; if (o.t === 'sa') { last.nx = o.nx; last.ny = o.ny; } }
    } else q.push(o);
    clearTimeout(tp.inputTimer);
    if (/^(m|s|sa|pm)$/.test(o.t)) tp.inputTimer = setTimeout(tpFlush, 25); else tpFlush();
  }
  function tpFlush() {
    clearTimeout(tp.inputTimer);
    if (tp.httpBusy || !tp.inputQueue.length) return;
    var batch = tp.inputQueue.splice(0, 50);
    if (tp.ready && tp.ws && (tp.ws.bufferedAmount || 0) < 65536) {
      try { batch.forEach(function (o) { tp.ws.send(JSON.stringify(o)); }); if (tp.inputQueue.length) tpFlush(); return; }
      catch (e) { /* 不重放结果未知的离散动作；释放按键并恢复 */ tp.inputQueue.length = 0; batch = [{ t: 'release', seq: ++tp.inputSeq }]; }
    }
    tp.httpBusy = true;
    api('POST', '/api/input', batch, 2500).then(function () { tp.httpBusy = false; tpFlush(); }, function () {
      tp.inputQueue.length = 0;
      // 仅重试幂等的释放；点击/发送等动作不重试，避免重复执行。
      var release = { t: 'release', seq: ++tp.inputSeq };
      if (tp.ready && tp.ws) {
        try { tp.ws.send(JSON.stringify(release)); tp.httpBusy = false; tpFlush(); return; } catch (e) { /* HTTP 释放完成前继续阻止新输入越过它 */ }
      }
      api('POST', '/api/input', release, 2500).then(function () { tp.httpBusy = false; tpFlush(); }, function () {
        tp.httpBusy = false; tp.inputQueue.length = 0;
      });
    });
  }
  function tpCancel() {
    tpStopInertia();
    clearTimeout(scr.g && scr.g.timer);
    tp.g = null; scr.g = null; tp.lastTap = null; scr.lastTap = null;
    dragFeedback(false);
    pn.voiceEpoch = (pn.voiceEpoch || 0) + 1;
    if (pn.voiceDown) { pn.voiceDown = false; var b = $('pnVoice'); setClass(b, 'on', false); if (b) b.lastChild.textContent = '按住说话'; }
    if (ctl.scrub) { ctl.scrub = null; setClass($('cvScrub'), 'active', false); }
    tpSend({ t: 'release' });
  }

  // mode：ctrl / pad / screen；size：split（半屏）/ full（全屏）；view：画面模式下的网页视图（watch / read / browse）
  function tpOpen(mode, size, view, url) {
    if (np.visible) npHide(true);
    if (!tp.visible) {
      tp.visible = true;
      tpConnect();
      tpPing();
      if (macInfo.accessibility === false) toast('Mac 尚未授予辅助功能权限，部分操作不可用', true);
    }
    tpSetSize(size || (tp.size === 'min' ? 'split' : tp.size) || 'full');
    tpSetView(mode === 'screen' ? (view || 'plain') : 'plain', url);
    tpSetMode(mode || store('deck-tp-mode') || 'ctrl');
  }

  function tpClose() {
    if (!tp.visible) return;
    tpCancel();
    clearTimeout(tp.reconnect); clearTimeout(pingTimer); clearTimeout(stageTimer); stageIntent++;
    tp.visible = false;
    ctl.pin = '';
    scrStop();
    ctlStop();
    tpStopInertia();
    $('tpInput').blur();
    var ta = $('pnText');
    if (ta) ta.blur();
    var el = $('tp');
    setClass(el, 'shown', false);
    setClass(document.body, 'stage-split', false);
    setClass(document.body, 'stage-min', false);
    tp.size = 'full';
    setTimeout(function () { if (!tp.visible) { setClass(el, 'open', false); setClass(el, 'split', false); } layout(); }, 300);
  }

  // 两种模式：ctrl（控制面板）/ screen（副屏：Mac 画面 + 直接触控）。
  // 触控板不再是单独页面，而是副屏里的一个开关（tp.relative）：打开后手指相对移动指针，画面仍然可见，
  // 适合点小按钮；旧的 'pad' 模式等价于「副屏 + 触控板开关」。
  function scrDirect() { return tp.mode === 'screen' && !tp.relative; }
  function tpSetRelative(on) {
    tpCancel();
    tp.relative = !!on; store('deck-tp-relative', on ? '1' : '');
    setClass($('tp'), 'relative', tp.relative);
    var b = $('tpPointer'); if (b) setClass(b, 'on', tp.relative);
  }
  function tpSetMode(mode) {
    if (mode === 'pad') { mode = 'screen'; tpSetRelative(true); }
    if (mode !== 'screen') mode = 'ctrl';
    tpCancel();
    tp.mode = mode;
    store('deck-tp-mode', mode);
    setClass($('tp'), 'm-ctrl', mode === 'ctrl');
    setClass($('tp'), 'm-pad', false);
    if (mode === 'screen' && tp.relative === undefined) tpSetRelative(store('deck-tp-relative') === '1');
    setClass($('tp'), 'm-screen', mode === 'screen');
    var bs = $('tpMode').children;
    for (var i = 0; i < bs.length; i++) bs[i].className = bs[i].getAttribute('data-tp') === 'mode-' + mode ? 'on' : '';
    if (mode !== 'screen') tpSetView('plain');
    ctl.bundle = ''; // 控件的渲染位置可能变了（控制区 / 观看浮层），重新渲染
    if (mode === 'screen') scrStart(); else scrStop();
    if (mode === 'ctrl' || (mode === 'screen' && tp.view === 'watch')) ctlStart(); else ctlStop();
  }

  // 统一的「处理中 → 完成 / 失败」反馈；处理中按钮禁用，避免连点
  function busy(btn, work) {
    if (btn && btn._deckPromise) return btn._deckPromise;
    if (btn) { btn.setAttribute('data-busy', '1'); btn.disabled = true; setClass(btn, 'is-busy', true); }
    function done(ok) {
      if (!btn) return;
      btn.removeAttribute('data-busy'); btn.disabled = false; btn._deckPromise = null;
      setClass(btn, 'is-busy', false); setClass(btn, ok ? 'is-ok' : 'is-err', true);
      setTimeout(function () { setClass(btn, 'is-ok', false); setClass(btn, 'is-err', false); }, ok ? 450 : 900);
    }
    var promise = Promise.resolve().then(work).then(function (r) { done(true); return r; }, function (e) {
      done(false); toast(e.message || '操作失败', true); return null;
    });
    if (btn) btn._deckPromise = promise;
    return promise;
  }

  // ---------- 舞台：分屏 / 全屏 / 收起 ----------
  // 点开应用磁贴后，控件默认占半屏（另一半仍是磁贴）；点控件顶栏空白处 = 全屏 / 退回分屏；
  // 点磁贴区空白处 = 收起控件（右侧留一个「‹ 控件」把手，点它回到分屏）。

  // 控件按「实际可用区域」排版（分屏时只有半个屏幕），而不是按屏幕方向：
  // cw-s / cw-m / cw-l = 宽度 <560 / <860 / 更宽；ch-s = 高度 <560；c-port = 竖长区域
  function ctlFit() {
    var el = $('tp'), box = $('tpCtrl');
    if (!el || !tp.visible) return;
    var w = box.clientWidth || el.clientWidth, h = box.clientHeight || el.clientHeight;
    if (!w || !h) return;
    setClass(el, 'cw-s', w < 560); setClass(el, 'cw-m', w >= 560 && w < 860); setClass(el, 'cw-l', w >= 860);
    setClass(el, 'ch-s', h < 560); setClass(el, 'c-port', h > w * 1.08);
  }
  function tpSetSize(size) {
    if (size === 'min') { tpCancel(); scrStop(); ctlStop(); }
    var wasMin = tp.size === 'min';
    tp.size = size;
    var b = document.body;
    setClass(b, 'stage-split', size === 'split');
    setClass(b, 'stage-min', size === 'min');
    setClass($('tp'), 'split', size === 'split');
    $('tpSize').innerHTML = size === 'split' ? '⤢ 全屏' : '⤡ 分屏';
    if (size === 'min') { setClass($('tp'), 'shown', false); setTimeout(function () { if (tp.size === 'min') setClass($('tp'), 'open', false); }, 300); }
    else { setClass($('tp'), 'open', true); void $('tp').offsetWidth; setClass($('tp'), 'shown', true); }
    if (wasMin && size !== 'min') {
      tpConnect(); tp.lastPong = Date.now(); tpPing();
      if (tp.mode === 'screen') scrStart(); if (tp.mode === 'ctrl' || tp.view === 'watch') ctlStart();
    }
    ctlFit();
    setTimeout(function () { layout(); ctlFit(); if (scr.on) { scrZoom(1, 0, 0); if (scr.streaming) scr.reprofile = true; } }, 240); // 磁贴区宽度变了，重新排版
  }

  // ---------- 网页视图：观看（视频）/ 阅读（信息流）/ 浏览（普通网页） ----------

  var VIDEO_HOSTS = /(^|\.)(youtube\.com|youtu\.be|bilibili\.com|v\.qq\.com|iqiyi\.com|youku\.com|mgtv\.com|netflix\.com|douyin\.com|ixigua\.com|twitch\.tv|vimeo\.com)$/;
  var FEED_HOSTS = /(^|\.)(x\.com|twitter\.com|weibo\.com|reddit\.com|zhihu\.com|xiaohongshu\.com|v2ex\.com|douban\.com|news\.ycombinator\.com|threads\.net)$/;

  function hostKind(url) {
    var h = hostOf(url).replace(/:\d+$/, '');
    if (VIDEO_HOSTS.test(h)) return 'watch';
    if (FEED_HOSTS.test(h)) return 'read';
    return 'browse';
  }

  // 信息流右侧大按钮：X 有原生快捷键（j / k 切换帖子，l 点赞，r 回复，t 转发）；其它站点用翻页键
  function railFor(url) {
    var h = hostOf(url);
    if (/(^|\.)(x|twitter)\.com/.test(h)) {
      return [['上一条', 'k'], ['下一条', 'j'], ['点赞', 'l'], ['回复', 'r'], ['转发', 't'], ['打开', 'return'], ['返回', 'cmd+['], ['刷新', 'cmd+r']];
    }
    return [['上一屏', 'shift+space'], ['下一屏', 'space'], ['回到顶部', 'cmd+up'], ['返回', 'cmd+['], ['前进', 'cmd+]'], ['刷新', 'cmd+r']];
  }

  function tpSetView(view, url) {
    tp.view = view || 'plain';
    tp.viewUrl = url || '';
    setClass($('tp'), 'v-watch', tp.view === 'watch');
    setClass($('tp'), 'v-read', tp.view === 'read');
    setClass($('tp'), 'v-browse', tp.view === 'browse');
    if (tp.view !== 'watch') setClass($('tp'), 'ov-hidden', false);
    var rail = '';
    if (tp.view === 'read') {
      railFor(url).forEach(function (r) { rail += '<button type="button" class="rbtn" data-vkey="' + r[1] + '">' + r[0] + '</button>'; });
    } else if (tp.view === 'browse') {
      rail = '<button type="button" class="rbtn" data-vkey="cmd+[">‹ 后退</button><button type="button" class="rbtn" data-vkey="cmd+]">前进 ›</button>' +
        '<button type="button" class="rbtn" data-vkey="cmd+r">刷新</button><button type="button" class="rbtn" data-vtabs="1">标签页</button>' +
        '<button type="button" class="rbtn" data-vkey="cmd+t">新标签</button>';
    }
    $('tpRail').innerHTML = rail;
    $('tpOverlay').innerHTML = '';
    ctl.bundle = ''; // 观看视图的控件条需要重新渲染
    if (tp.view === 'watch') ovShow(true);
  }

  // 观看视图：底部控件条，点画面显示 / 隐藏，4 秒没操作自动隐藏
  var ovTimer = null;
  function ovShow(on) {
    setClass($('tp'), 'ov-hidden', !on);
    clearTimeout(ovTimer);
    if (on) ovTimer = setTimeout(function () { if (tp.view === 'watch' && !ctl.scrub) setClass($('tp'), 'ov-hidden', true); }, 4000);
  }
  function ovVisible() { return $('tp').className.indexOf('ov-hidden') < 0; }

  // 当前浏览器（画面里的应用；没有就用控件里的）
  function viewBundle() { return (scr.meta && scr.meta.bundle) || ctl.bundle || 'com.google.Chrome'; }

  $('tpRail').addEventListener('click', function (e) {
    var b = closest(e.target, 'button');
    if (!b) return;
    if (b.getAttribute('data-vtabs')) { tpSetView('plain'); ctl.browserView = 'tabs'; return tpSetMode('ctrl'); }
    var k = b.getAttribute('data-vkey');
    if (k) busy(b, function () { return api('POST', '/api/control/key', { bundle: viewBundle(), key: k }); });
  }, false);

  // 点开磁贴后自动进入对应的控件
  var stageTimer = null, stageIntent = 0;
  function stageForTile(t, res, intent) {
    if (intent !== undefined && intent !== stageIntent) return;
    clearTimeout(stageTimer);
    if (!config || config.settings.autoStage === false || t.stage === 'none') return;
    if (t.type === 'app' && res && res.kind && /^(music|browser|ai|slides|player)$/.test(res.kind)) {
      ctl.browserView = res.kind === 'browser' ? 'tabs' : '';
      ctl.pin = res.bundle; // 固定显示这个应用的控件，不随 Mac 前台变化
      stageTimer = setTimeout(function () { tpOpen('ctrl', 'split'); }, 180);
    } else if (t.type === 'url' && /^(https?:\/\/|[^:/]+\.)/.test(t.target || '')) {
      ctl.pin = '';
      var view = hostKind(t.target);
      // 等网页打开再开始投屏
      stageTimer = setTimeout(function () { tpOpen('screen', 'full', view, t.target); }, 250);
    } else if (t.thenTp) {
      stageTimer = setTimeout(function () { tpOpen('ctrl', 'split'); }, 180);
    }
  }

  // ---------- 文件夹分栏浏览（Miller columns） ----------
  // 点文件夹：在右侧展开下一栏并滚过去；点文件：最右栏显示 QuickLook 预览与「在 Mac 上打开 / 在 Finder 中显示」。
  var fb = { open: false, cols: [], file: null, seq: 0 };
  function fbQS(p) { var pin = store('deck-pin'); return 'path=' + encodeURIComponent(p) + (pin ? '&pin=' + encodeURIComponent(pin) : ''); }
  function fmtSize(n) { return n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(0) + ' KB' : n < 1073741824 ? (n / 1048576).toFixed(1) + ' MB' : (n / 1073741824).toFixed(2) + ' GB'; }
  function fmtDate(ms) { var d = new Date(ms); return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate() + ' ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  var FB_KIND = { folder: '文件夹', image: '图片', video: '视频', audio: '音频', doc: '文稿', code: '代码', archive: '压缩包 / 安装包', app: '应用', file: '文件' };
  function fbOpen(dir, label) {
    var el = $('fb');
    fb.open = true; fb.cols = []; fb.file = null; fb.label = label || '';
    $('fbCols').innerHTML = ''; $('fbPath').innerHTML = '';
    setClass(el, 'open', true);
    nextFrame(function () { nextFrame(function () { setClass(el, 'shown', true); }); });
    fbLoad(0, dir);
  }
  function fbClose() {
    var el = $('fb');
    fb.open = false; fb.seq++;
    setClass(el, 'shown', false);
    setTimeout(function () { if (!fb.open) { setClass(el, 'open', false); $('fbCols').innerHTML = ''; } }, 320);
  }
  function fbLoad(i, dir) {
    var seq = ++fb.seq;
    api('GET', '/api/fs/list?' + fbQS(dir)).then(function (r) {
      if (seq !== fb.seq || !fb.open) return;
      fb.cols.length = i; fb.file = null;
      fb.cols[i] = { data: r, sel: -1 };
      fbRenderFrom(i);
    }, function (e) { toast(e.message, true); if (!fb.cols.length) fbClose(); });
  }
  function fbColHTML(i) {
    var c = fb.cols[i], r = c.data;
    var rows = r.entries.map(function (e, j) {
      return '<div class="fb-row k-' + e.kind + (j === c.sel ? ' sel' : '') + '" data-fb="item" data-col="' + i + '" data-idx="' + j + '"><i class="fb-ic"></i><span>' + esc(e.name) + '</span>' + (e.dir ? '<b>›</b>' : '') + '</div>';
    }).join('');
    var title = i === 0 && fb.label ? fb.label : r.name;
    return '<div class="fb-col-h">' + esc(title) + (r.total > r.entries.length ? ' · 仅显示前 ' + r.entries.length + ' 项' : '') + '</div>' +
      '<div class="fb-list">' + (rows || '<div class="fb-empty">空文件夹</div>') + '</div>';
  }
  function fbPreviewHTML(e) {
    var thumb = /^(image|video|doc|code|audio|app|archive|file)$/.test(e.kind)
      ? '<div class="fb-thumb" style="background-image:url(&quot;/api/fs/thumb?s=' + (PERF.uiTier === 'lite' ? 384 : 768) + '&amp;' + esc(fbQS(e.path)) + '&quot;)"></div>' : '';
    return '<div class="fb-col-h">预览</div><div class="fb-list">' + thumb +
      '<h3>' + esc(e.name) + '</h3><small>' + FB_KIND[e.kind] + (e.dir ? '' : ' · ' + fmtSize(e.size)) + '<br>修改于 ' + fmtDate(e.mtime) + '</small>' +
      '<div class="fb-acts"><button class="pill primary" type="button" data-fb="open">在 Mac 上打开</button><button class="pill" type="button" data-fb="reveal">在 Finder 中显示</button></div></div>';
  }
  // 只重建第 i 栏及之后的栏：前面各栏保留原有的滚动位置
  function fbRenderFrom(i) {
    var box = $('fbCols'), cols = box.children;
    while (cols.length > i) box.removeChild(cols[cols.length - 1]);
    for (var k = i; k < fb.cols.length; k++) {
      var d = document.createElement('div'); d.className = 'fb-col'; d.innerHTML = fbColHTML(k); box.appendChild(d);
    }
    if (fb.file) {
      var p = document.createElement('div'); p.className = 'fb-col fb-prev'; p.innerHTML = fbPreviewHTML(fb.file); box.appendChild(p);
      var th = p.querySelector('.fb-thumb');
      if (th) { var img = new Image(); img.onerror = function () { th.className = 'fb-thumb none k-' + fb.file.kind; th.style.backgroundImage = ''; th.innerHTML = '<i class="fb-ic"></i>'; }; img.src = th.style.backgroundImage.replace(/^url\(["']?|["']?\)$/g, ''); }
    }
    fbPath(); fbScrollEnd();
  }
  function fbPath() {
    var names = fb.cols.map(function (c, i) { return i === 0 && fb.label ? fb.label : c.data.name; });
    if (fb.file) names.push(fb.file.name);
    $('fbPath').innerHTML = '<span>' + esc(names.join('  ›  ')) + '</span>';
  }
  // 平滑滚到最右（新展开的一栏）；省电档直接跳过去
  function fbScrollEnd() {
    var box = $('fbCols'), from = box.scrollLeft, to = Math.max(0, box.scrollWidth - box.clientWidth);
    if (to <= from + 1) return;
    if (PERF.uiTier === 'lite' || DEVICE.reducedMotion) { box.scrollLeft = to; return; }
    var t0 = monotonic(), seq = fb.seq;
    var step = function (now) {
      if (seq !== fb.seq) return;
      var k = Math.min(1, (now - t0) / 320), e = 1 - Math.pow(1 - k, 3);
      box.scrollLeft = from + (to - from) * e;
      if (k < 1) nextFrame(step);
    };
    nextFrame(step);
  }
  function fbTap(el) {
    var a = el.getAttribute('data-fb');
    if (a === 'close') return fbClose();
    var cur = fb.file ? fb.file.path : fb.cols.length ? fb.cols[fb.cols.length - 1].data.path : '';
    if (a === 'finder') return api('POST', '/api/fs/open', { path: fb.cols.length ? fb.cols[fb.cols.length - 1].data.path : '' }).then(function () { toast('已在 Mac 上打开'); }, function (e) { toast(e.message, true); });
    if (a === 'open' || a === 'reveal') return api('POST', '/api/fs/open', { path: cur, reveal: a === 'reveal' }).then(function () { toast(a === 'open' ? '已在 Mac 上打开' : '已在 Finder 中显示'); }, function (e) { toast(e.message, true); });
    if (a !== 'item') return;
    var i = parseInt(el.getAttribute('data-col'), 10), j = parseInt(el.getAttribute('data-idx'), 10), c = fb.cols[i];
    if (!c) return;
    var entry = c.data.entries[j];
    var old = el.parentNode.querySelector('.fb-row.sel'); if (old) setClass(old, 'sel', false);
    setClass(el, 'sel', true); c.sel = j;
    fb.seq++;
    if (entry.dir) { fb.file = null; fbLoad(i + 1, entry.path); }
    else { fb.cols.length = i + 1; fb.file = entry; fbRenderFrom(i + 1); }
  }
  // 自己处理点按：允许各栏自由滚动，移动超过 10px 不算点按
  (function () {
    var box = $('fb'), down = null;
    function target(e) { return closest(e.target, '[data-fb]'); }
    box.addEventListener('touchstart', function (e) {
      var t = e.touches[0], el = target(e);
      down = el ? { el: el, x: t.clientX, y: t.clientY } : null;
      if (el && el.className.indexOf('fb-row') >= 0) setClass(el, 'down', true);
    }, { passive: true });
    box.addEventListener('touchmove', function (e) {
      if (!down) return;
      var t = e.touches[0];
      if (Math.abs(t.clientX - down.x) + Math.abs(t.clientY - down.y) > 10) { setClass(down.el, 'down', false); down = null; }
    }, { passive: true });
    box.addEventListener('touchend', function (e) {
      if (!down) return;
      var el = down.el; down = null; setClass(el, 'down', false);
      e.preventDefault(); lastTouch = Date.now(); fbTap(el);
    }, false);
    box.addEventListener('touchcancel', function () { if (down) setClass(down.el, 'down', false); down = null; }, false);
    box.addEventListener('click', function (e) { if (Date.now() - lastTouch < 800) return; var el = target(e); if (el) fbTap(el); }, false);
  })();

  // ---------- 控制模式 ----------

  var ctl = { timer: null, kind: '', bundle: '', name: '', data: null, scrub: null, pendingFront: null, surface: '', browserView: 'auto', tabsAt: 0, epoch: 0, busyEpoch: null };

  function ctlTarget() { return tp.mode === 'screen' && tp.view === 'watch' ? $('tpOverlay') : $('tpCtrl'); }

  // 视频站的按键方案（没开浏览器 JavaScript 权限时使用）
  function siteKeys(url) {
    if (/youtube\.com|youtu\.be/.test(url || '')) return { toggle: 'k', back: 'j', fwd: 'l', step: 10, left: 'left', right: 'right', full: 'f', mute: 'm', next: 'shift+n' };
    return { toggle: 'space', back: 'left', fwd: 'right', step: 5, left: 'left', right: 'right', full: 'f', mute: 'm', next: '' };
  }
  var PLAYER_KEYS = {
    'com.colliderli.iina': { toggle: 'space', back: 'left', fwd: 'right', step: 5, left: 'left', right: 'right', full: 'cmd+ctrl+f', mute: 'cmd+opt+down', next: 'cmd+right' },
    'org.videolan.vlc': { toggle: 'space', back: 'cmd+opt+left', fwd: 'cmd+opt+right', step: 10, left: 'cmd+opt+left', right: 'cmd+opt+right', full: 'cmd+f', mute: 'cmd+opt+down', next: 'cmd+right' },
    'com.apple.QuickTimePlayerX': { toggle: 'space', back: 'left', fwd: 'right', step: 10, left: 'left', right: 'right', full: 'cmd+ctrl+f', mute: '', next: '' }
  };

  function ctlActive() { return tp.visible && tp.size !== 'min' && !document.hidden && (tp.mode === 'ctrl' || (tp.mode === 'screen' && tp.view === 'watch')); }
  function ctlStart() { ctlStop(); ctlPoll(); }
  function ctlStop() { clearTimeout(ctl.timer); ctl.epoch = (ctl.epoch || 0) + 1; ctl.scrub = null; }
  function ctlPoll() {
    clearTimeout(ctl.timer);
    if (!ctlActive() || ctl.busyEpoch === ctl.epoch) return;
    var epoch = ctl.epoch;
    ctl.busyEpoch = epoch;
    var target = tp.mode === 'screen' ? ((scr.meta && scr.meta.bundle) || '') : ctl.pin;
    api('GET', '/api/control' + (target ? '?bundle=' + encodeURIComponent(target) : '')).then(function (r) {
      if (epoch === ctl.epoch && ctlActive()) ctlApply(r);
    }).catch(function (e) {
      if (window.console && console.warn) console.warn('iPadDuo 控件更新：' + e.message);
    }).then(function () {
      if (ctl.busyEpoch === epoch) ctl.busyEpoch = null;
      if (epoch === ctl.epoch && ctlActive()) ctl.timer = setTimeout(ctlPoll, ctl.kind === 'browser' ? 1000 : ctl.kind === 'ai' ? 3000 : 2000);
    });
  }

  function ctlKey(key, btn, repeat) {
    if (!key) return Promise.resolve();
    return busy(btn, function () { return api('POST', '/api/control/key', { bundle: ctl.bundle, key: key, repeat: repeat || 1 }); });
  }

  function ctlApply(r) {
    var bundle = r.front && r.front.bundle || '';
    var name = r.front && r.front.name || '';
    // AI 面板里正在写字时，不因为 Mac 前台变化而切走，只给提示
    var ta = $('pnText');
    if (ctl.kind === 'ai' && bundle !== ctl.bundle && ta && (ta.value.trim() || document.activeElement === ta)) {
      ctl.pendingFront = r;
      $('ctlNote').innerHTML = 'Mac 前台已切换到「' + esc(name) + '」 <button type="button" data-ctl-switch="1">切换过去</button>';
      setClass($('ctlNote'), 'on', true);
      return;
    }
    // 浏览器：有视频且没指定看标签页 → 视频遥控；否则 → 标签页与书签（观看浮层里始终是视频控件）
    var surface = r.kind;
    if (r.kind === 'browser') {
      var hasVideo = !!(r.video && r.video.ok);
      surface = ctlTarget() === $('tpOverlay') ? 'video' : (ctl.browserView === 'tabs' || (ctl.browserView === 'auto' && !hasVideo) ? 'tabs' : 'video');
    }
    if (bundle !== ctl.bundle || r.kind !== ctl.kind || surface !== ctl.surface) {
      ctl.bundle = bundle;
      ctl.kind = r.kind;
      ctl.surface = surface;
      ctl.name = name;
      ctl.scrub = null;
      if (tp.mode === 'ctrl') $('tpApp').textContent = name || '控制';
      ctlRender(r);
    }
    ctl.data = r;
    if (surface === 'video' && $('cvScrub')) videoApply(r);
    if (surface === 'tabs' && Date.now() - ctl.tabsAt > 4000) loadTabs();
    if (r.kind === 'ai') { pn.labels = r.labels || {}; pnLabels(); }
    if (r.kind === 'music') musicApply(r.music);
  }

  function cbtn(attrs, label, cls) {
    return '<button type="button" class="cbtn ' + (cls || '') + '" ' + attrs + '>' + label + '</button>';
  }

  function ctlRender(r) {
    ctlFit();
    var target = ctlTarget();
    var k = r.kind;
    if (target === $('tpOverlay')) {
      // 同一组控件 ID 只能存在于一个容器；隐藏的旧面板也会被 getElementById 命中。
      $('tpCtrl').innerHTML = '';
      // 观看视图：精简的视频控件条
      target.innerHTML = k !== 'browser' ? '' :
        '<div class="ov-bar"><b id="cvTitle" class="hide"></b><small id="cvSite" class="hide"></small>' +
        '<div class="cv-scrub ov-scrub" id="cvScrub"><div class="cv-fill" id="cvFill"></div><div class="cv-label"><span id="cvCur">--:--</span><b id="cvHint"></b><span id="cvDur">--:--</span></div></div>' +
        '<div class="ov-row">' +
          cbtn('data-cv="back"', '↺ <small id="cvBackLbl">10 秒</small>') +
          cbtn('data-cv="toggle"', '<i class="ic ic-play" id="cvPlayIc"></i>', 'ov-play') +
          cbtn('data-cv="fwd"', '<small id="cvFwdLbl">10 秒</small> ↻') +
          cbtn('data-sys="voldown"', '音量 −') + cbtn('data-sys="volup"', '音量 +') +
          cbtn('data-cv="rate"', '<span id="cvRate">1×</span>') + cbtn('data-cv="full"', '全屏') +
        '</div><div class="cv-setup hide" id="cvSetup"></div></div>';
      return;
    }
    $('tpOverlay').innerHTML = '';
    var h = '<div class="ctl-note" id="ctlNote"></div>';
    if (k === 'browser' && ctl.surface === 'tabs') {
      h += '<div class="cs cs-tabs">' +
        '<div class="bt-nav">' + cbtn('data-ckey="cmd+["', '‹ 后退') + cbtn('data-ckey="cmd+]"', '前进 ›') + cbtn('data-ckey="cmd+r"', '刷新') +
          cbtn('data-ckey="cmd+t"', '＋ 新标签') + cbtn('data-bview="video"', '视频遥控') + cbtn('data-bwatch="1"', '看画面') + '</div>' +
        '<div class="bt-cols"><div class="bt-col"><h4>标签页</h4><div class="bt-list" id="btTabs"><p class="hint">读取中…</p></div></div>' +
        '<div class="bt-col"><h4>书签栏</h4><div class="bt-list" id="btMarks"></div></div></div></div>';
      $('tpCtrl').innerHTML = h;
      ctl.tabsAt = 0;
      loadTabs();
      return;
    }
    if (k === 'ai') {
      pn.bundle = ctl.bundle;
      pn.panel = r.panel;
      h += pnHtml(r);
    } else if (k === 'browser' || k === 'player') {
      h += '<div class="cs cs-video">' +
        '<div class="cv-title"><b id="cvTitle">' + esc(ctl.name) + '</b><small id="cvSite"></small></div>' +
        '<div class="cv-scrub" id="cvScrub"><div class="cv-fill" id="cvFill"></div><div class="cv-label"><span id="cvCur">--:--</span><b id="cvHint">左右拖动调整进度</b><span id="cvDur">--:--</span></div></div>' +
        '<div class="cv-main">' +
          cbtn('data-cv="back"', '<span class="cv-ic">↺</span><small id="cvBackLbl">后退</small>') +
          cbtn('data-cv="toggle"', '<i class="ic ic-play" id="cvPlayIc"></i>', 'cbig') +
          cbtn('data-cv="fwd"', '<span class="cv-ic">↻</span><small id="cvFwdLbl">前进</small>') +
        '</div>' +
        '<div class="cv-row">' +
          cbtn('data-sys="voldown"', '音量 −') + cbtn('data-cv="mute"', '静音') + cbtn('data-sys="volup"', '音量 +') +
          (k === 'browser' ? cbtn('data-cv="rate"', '<span id="cvRate">1×</span> 倍速') : '') +
          cbtn('data-cv="full"', '全屏') + cbtn('data-cv="next"', '下一个', 'cv-next') +
        '</div>' +
        '<div class="cv-row cv-row2">' + (k === 'browser' ? cbtn('data-bview="tabs"', '标签页与书签') + cbtn('data-bwatch="1"', '看画面（带控件）') : '') + '</div>' +
        '<div class="cv-setup" id="cvSetup"></div>' +
      '</div>';
    } else if (k === 'music') {
      h += '<div class="cs cs-music">' +
        '<div class="cm-art" id="cmArt"></div>' +
        '<div class="cm-side"><div class="cm-meta"><b id="cmTitle">' + esc(ctl.name) + '</b><small id="cmArtist"></small></div>' +
          '<div class="cm-main">' + cbtn('data-sys="prev"', '<i class="ic ic-prev"></i>') + cbtn('data-sys="playpause"', '<i class="ic ic-play" id="cmPlayIc"></i>', 'cbig') + cbtn('data-sys="next"', '<i class="ic ic-next"></i>') + '</div>' +
          '<div class="cv-row">' + cbtn('data-music="like"', '<span id="cmLike">♡</span> 喜欢', 'cm-like') + cbtn('data-sys="voldown"', '音量 −') + cbtn('data-sys="volup"', '音量 +') + cbtn('data-np="open"', '歌词') + '</div>' +
          '<div class="cv-row cm-modes" id="cmModes"></div>' +
        '</div></div>';
    } else if (k === 'slides') {
      h += '<div class="cs cs-slides">' +
        '<div class="sl-main">' + cbtn('data-ckey="left"', '◀<small>上一页</small>', 'sl-btn') + cbtn('data-ckey="right"', '▶<small>下一页</small>', 'sl-btn') + '</div>' +
        '<div class="cv-row">' + cbtn('data-ckey="' + (ctl.bundle === 'com.apple.iWork.Keynote' ? 'cmd+opt+p' : 'cmd+shift+return') + '"', '开始放映') +
          cbtn('data-ckey="b"', '黑屏') + cbtn('data-ckey="esc"', '退出放映') + '</div>' +
      '</div>';
    } else {
      var G = [['复制', 'cmd+c'], ['粘贴', 'cmd+v'], ['撤销', 'cmd+z'], ['重做', 'cmd+shift+z'], ['全选', 'cmd+a'], ['保存', 'cmd+s'],
        ['查找', 'cmd+f'], ['新建', 'cmd+n'], ['新标签', 'cmd+t'], ['关闭窗口', 'cmd+w'], ['切换应用', 'cmd+tab'], ['调度中心', 'ctrl+up']];
      h += '<div class="cs cs-general"><div class="cg-grid">';
      G.forEach(function (g) { h += cbtn('data-ckey="' + g[1] + '"', '<b>' + g[0] + '</b><small>' + keyLabel(g[1]) + '</small>'); });
      h += '</div></div>';
    }
    $('tpCtrl').innerHTML = h;
    if (k === 'music') musicApply(r.music);
  }

  // 浏览器标签页与书签
  function loadTabs() {
    ctl.tabsAt = Date.now();
    var b = ctl.bundle;
    api('GET', '/api/browser/tabs?bundle=' + encodeURIComponent(b)).then(function (r) { if (ctl.bundle === b) renderTabs2(r); }, function () {});
  }
  function renderTabs2(r) {
    if (!$('btTabs')) return;
    var h = '';
    (r.tabs || []).forEach(function (t) {
      h += '<div class="bt-row' + (t.active ? ' on' : '') + '"><button type="button" class="bt-main" data-tab="' + t.index + '"><b>' + esc(t.title) + '</b><small>' + esc(hostOf(t.url)) + '</small></button>' +
        '<button type="button" class="bt-x" data-tabx="' + t.index + '">✕</button></div>';
    });
    $('btTabs').innerHTML = h || '<p class="hint">没有读到标签页</p>';
    var m = '';
    (r.bookmarks || []).forEach(function (x) {
      m += '<button type="button" class="bt-mark" data-mark="' + esc(x.url) + '"><b>' + esc(x.title) + '</b><small>' + esc(x.folder || hostOf(x.url)) + '</small></button>';
    });
    $('btMarks').innerHTML = m || '<p class="hint">书签栏是空的（Safari 暂不支持读取书签）</p>';
  }

  function keyLabel(k) {
    return k.replace(/cmd/g, '⌘').replace(/shift/g, '⇧').replace(/opt/g, '⌥').replace(/ctrl/g, '⌃').replace(/return/g, '↩')
      .replace(/up/g, '↑').replace(/\+/g, ' ').toUpperCase();
  }

  // —— 视频 ——

  function videoKeys() {
    var r = ctl.data || {};
    return ctl.kind === 'player' ? (PLAYER_KEYS[ctl.bundle] || PLAYER_KEYS['com.apple.QuickTimePlayerX']) : siteKeys(r.tab && r.tab.url);
  }

  function videoApply(r) {
    var v = r.video || {}, tab = r.tab || {};
    var keys = videoKeys();
    var bridge = !!(v.ok && v.d > 0);
    ctl.bridge = bridge;
    $('cvTitle').textContent = tab.title || ctl.name;
    $('cvSite').textContent = hostOf(tab.url || '');
    $('cvBackLbl').textContent = '后退 ' + (bridge ? 10 : keys.step) + ' 秒';
    $('cvFwdLbl').textContent = '前进 ' + (bridge ? 10 : keys.step) + ' 秒';
    var target = ctlTarget();
    setClass(target.querySelector('.cv-next'), 'hide', !keys.next);
    var rateBtn = target.querySelector('[data-cv="rate"]');
    if (rateBtn) setClass(rateBtn, 'hide', !bridge); // 倍速只有开启浏览器 JavaScript 权限后才能用
    $('cvSetup').innerHTML = v.setup ? '想要真实的进度条和精确拖动？在 Mac 上开启：' + esc(v.setup) : (r.kind === 'browser' && !bridge && !v.setup ? '当前页面没有找到视频，按键仍会发给浏览器' : '');
    if (ctl.scrub) return; // 拖动中不覆盖
    if (bridge) {
      $('cvCur').textContent = fmtTime(v.t);
      $('cvDur').textContent = fmtTime(v.d);
      $('cvHint').textContent = '拖动调整进度';
      var f = $('cvFill');
      f.style.webkitTransform = f.style.transform = 'scaleX(' + Math.min(1, v.t / v.d) + ')';
      $('cvPlayIc').className = 'ic ' + (v.p ? 'ic-pause' : 'ic-play');
      $('cvRate') && ($('cvRate').textContent = (v.r || 1) + '×');
    } else {
      $('cvCur').textContent = '';
      $('cvDur').textContent = '';
      $('cvHint').textContent = '左右拖动快进 / 快退';
      $('cvFill').style.webkitTransform = $('cvFill').style.transform = 'scaleX(0)';
      $('cvPlayIc').className = 'ic ic-play';
    }
  }

  function videoAct(action, btn) {
    var keys = videoKeys();
    var r = ctl.data || {};
    var v = r.video || {};
    if (action === 'full') return ctlKey(keys.full, btn);
    if (action === 'next') return ctlKey(keys.next, btn);
    if (ctl.bridge && ctl.kind === 'browser') {
      var map = { toggle: ['toggle'], back: ['skip', -10], fwd: ['skip', 10], mute: ['mute'] };
      if (action === 'rate') {
        var rates = [1, 1.25, 1.5, 2, 0.75];
        var cur = v.r || 1, i = rates.indexOf(cur);
        map.rate = ['rate', rates[(i + 1) % rates.length]];
      }
      var m = map[action];
      if (!m) return;
      return busy(btn, function () { return api('POST', '/api/control/video', { bundle: ctl.bundle, action: m[0], value: m[1] }); }).then(function (s) {
        if (s && s.ok) { r.video = s; videoApply(r); }
      });
    }
    if (action === 'rate') return toast('倍速需要开启浏览器的 JavaScript 权限');
    return ctlKey(keys[action], btn);
  }

  // 进度条拖动：有真实进度时按位置跳转；没有时按拖动距离快进 / 快退（每 40px 一步）
  function scrubStart(e) {
    var bar = closest(e.target, '#cvScrub');
    if (!bar) return false;
    e.preventDefault();
    var pt = pointFrom(e);
    ctl.scrub = { x0: pt.x, rect: bar.getBoundingClientRect(), value: null, steps: 0 };
    setClass(bar, 'active', true);
    scrubMove(e);
    return true;
  }

  function scrubMove(e) {
    var s = ctl.scrub;
    if (!s) return;
    e.preventDefault();
    var pt = pointFrom(e);
    var v = (ctl.data && ctl.data.video) || {};
    if (ctl.bridge) {
      var k = Math.max(0, Math.min(1, (pt.x - s.rect.left) / s.rect.width));
      s.value = k * v.d;
      $('cvFill').style.webkitTransform = $('cvFill').style.transform = 'scaleX(' + k + ')';
      $('cvCur').textContent = fmtTime(s.value);
      $('cvHint').textContent = '松手跳到 ' + fmtTime(s.value);
    } else {
      s.steps = Math.max(-30, Math.min(30, Math.round((pt.x - s.x0) / 40)));
      var sec = s.steps * videoKeys().step;
      $('cvHint').textContent = s.steps ? (sec > 0 ? '快进 ' : '快退 ') + Math.abs(sec) + ' 秒' : '左右拖动快进 / 快退';
      $('cvFill').style.webkitTransform = $('cvFill').style.transform = 'scaleX(' + (0.5 + s.steps / 60) + ')';
    }
  }

  function scrubEnd() {
    var s = ctl.scrub;
    if (!s) return;
    ctl.scrub = null;
    setClass($('cvScrub'), 'active', false);
    if (ctl.bridge && s.value !== null) {
      api('POST', '/api/control/video', { bundle: ctl.bundle, action: 'seek', value: s.value }).then(function (st) {
        if (st && st.ok) { ctl.data.video = st; videoApply(ctl.data); }
      }, function (err) { toast(err.message, true); });
    } else if (s.steps) {
      var keys = videoKeys();
      ctlKey(s.steps > 0 ? keys.right : keys.left, null, Math.abs(s.steps)).then(function () { videoApply(ctl.data || {}); });
    } else {
      videoApply(ctl.data || {});
    }
  }

  // —— 音乐（与底栏 / 歌词页共用正在播放的状态） ——
  function musicApply(m) {
    if (ctl.kind !== 'music' || !$('cmTitle')) return;
    if (m) {
      $('cmLike').textContent = m.liked ? '♥' : '♡';
      setClass($('tpCtrl').querySelector('.cm-like'), 'liked', !!m.liked);
      setClass($('tpCtrl').querySelector('.cm-like'), 'hide', m.liked === null);
      var mh = '';
      (m.modes || []).forEach(function (x) { mh += cbtn('data-music-mode="' + esc(x) + '"', esc(x)); });
      if ($('cmModes').innerHTML !== mh && !$('cmModes').querySelector('.is-busy')) $('cmModes').innerHTML = mh;
    }
    var s = np.state;
    if (s && s.active) {
      $('cmTitle').textContent = s.title;
      $('cmArtist').textContent = [s.artist, s.album].filter(Boolean).join(' — ');
      $('cmPlayIc').className = 'ic ' + (s.playing ? 'ic-pause' : 'ic-play');
      if (s.art) $('cmArt').style.backgroundImage = 'url("' + npArtUrl(s.id) + '")';
    } else {
      $('cmTitle').textContent = ctl.name;
      $('cmArtist').textContent = '没有在播放';
    }
  }

  // —— 控制区 / 观看浮层的点击 ——
  function ctlClick(e) {
    var b = closest(e.target, 'button');
    if (!b || b.disabled || b.getAttribute('data-busy')) return;
    if (tp.mode === 'screen' && scr.meta && ctl.bundle !== scr.meta.bundle) return toast('控件正在跟随当前窗口更新，请稍候');
    if (b.getAttribute('data-ctl-switch')) {
      setClass($('ctlNote'), 'on', false);
      var pend = ctl.pendingFront;
      ctl.pendingFront = null;
      ctl.bundle = '';
      if (pend) ctlApply(pend);
      return;
    }
    var cv = b.getAttribute('data-cv');
    if (cv) { if (tp.view === 'watch') ovShow(true); return videoAct(cv, b); }
    var bv = b.getAttribute('data-bview');
    if (bv) { ctl.browserView = bv; ctl.surface = ''; return ctlPoll(); }
    if (b.getAttribute('data-bwatch')) { var u = ctl.data && ctl.data.tab && ctl.data.tab.url; return tpOpen('screen', 'full', u ? hostKind(u) : 'browse', u); }
    var tabI = b.getAttribute('data-tab'), tabX = b.getAttribute('data-tabx'), mark = b.getAttribute('data-mark');
    if (tabI || tabX || mark) {
      return busy(b, function () { return api('POST', '/api/browser/do', { bundle: ctl.bundle, action: tabI ? 'switch' : tabX ? 'close' : 'open', index: tabI || tabX, url: mark }); })
        .then(function (r) { if (!r) return; renderTabs2({ tabs: r.tabs, bookmarks: [] }); ctl.tabsAt = 0; loadTabs(); }, function () {});
    }
    var mus = b.getAttribute('data-music'), mode = b.getAttribute('data-music-mode');
    if (mus || mode) {
      return busy(b, function () { return api('POST', '/api/music', { bundle: ctl.bundle, action: mus || 'mode', value: mode }); }).then(function (m) { musicApply(m); }, function () {});
    }
    var ck = b.getAttribute('data-ckey');
    if (ck) return ctlKey(ck, b);
    var sys = b.getAttribute('data-sys');
    if (sys) return busy(b, function () { return api('POST', '/api/system', { action: sys }).then(function (s) {
      if (typeof s.volume === 'number') showVolume(s.volume, s.muted);
      liveSoon(400);
      return s;
    }); });
    if (b.getAttribute('data-np') === 'open') { tpClose(); return npShow(true); }
    if (ctl.kind === 'ai') pnClick(b, e);
  }
  $('tpCtrl').addEventListener('click', ctlClick, false);
  $('tpOverlay').addEventListener('click', ctlClick, false);

  // —— AI 应用（Claude / ChatGPT）面板 ——
  // 输入区在切换应用时保留内容；聚焦输入框时进入「输入布局」：隐藏操作按钮，输入框与发送移到上方，避开 iPad 键盘

  var pn = { bundle: '', panel: null, labels: {}, voiceDown: false };

  function pnApi(path, body) { return api('POST', '/api/panel/' + path, body); }

  function pnLabels() {
    var bs = $('tpCtrl').querySelectorAll('[data-pop]');
    for (var i = 0; i < bs.length; i++) {
      var id = bs[i].getAttribute('data-pop');
      if (pn.labels[id]) bs[i].lastChild.textContent = pn.labels[id];
    }
  }

  function pnHtml(r) {
    var p = r.panel, keep = $('pnText') ? $('pnText').value : '';
    var h = '<div class="cs cs-ai"><div class="pn-head">';
    p.popups.forEach(function (x) {
      h += '<button type="button" class="pn-pop" data-pop="' + x.id + '"><small>' + esc(x.label) + '</small><span>' + esc(x.label) + '</span></button>';
    });
    h += '</div><div class="pn-body"><div class="pn-grid">';
    p.actions.forEach(function (a) {
      h += '<button type="button" class="pn-act" data-pn="' + a.id + '">' + picon(a.icon) + '<span>' + esc(a.label) + '</span></button>';
    });
    h += '</div><div class="pn-compose">' +
      '<textarea id="pnText" placeholder="' + esc(p.composerHint || '输入内容…') + '（也可以点 iPad 键盘上的麦克风听写）" autocomplete="off" autocorrect="on" spellcheck="false">' + esc(keep) + '</textarea>' +
      '<div class="pn-chips">' +
        ['继续', '总结一下', '翻译成英文', '解释一下', '给出代码'].map(function (c) { return '<button type="button" data-chip-text="' + c + '">' + c + '</button>'; }).join('') +
      '</div>' +
      '<div class="pn-row">' +
        '<button type="button" class="pn-voice" id="pnVoice">' + picon('mic') + '<span>按住说话</span></button>' +
        (p.dictate ? '<button type="button" data-pn="dictate">Mac 听写</button>' : '') +
        '<button type="button" data-pn-text="clear">清空</button>' +
        '<button type="button" data-pn-text="fill">填入</button>' +
        '<button type="button" class="pn-send" data-pn-text="send">发送 ⏎</button>' +
      '</div></div></div>' +
      '<div class="pn-list" id="pnList"></div></div>';
    return h;
  }

  function pnShowList(id, items) {
    var h = '<div class="pn-list-card"><div class="pn-list-head"><b>选择' + esc(id === 'model' ? '模型' : '项目') + '</b><button type="button" data-pn-cancel="1">取消</button></div><div class="pn-list-items">';
    items.forEach(function (it) {
      h += '<button type="button" ' + (it.enabled ? '' : 'disabled ') + 'data-pn-pick="' + esc(it.title) + '">' + (it.checked ? '✓ ' : '') + esc(it.title) + '</button>';
    });
    $('pnList').innerHTML = h + '</div></div>';
    setClass($('pnList'), 'on', true);
  }

  function pnHideList() { setClass($('pnList'), 'on', false); }

  function pnClick(b) {
    var bundle = pn.bundle;
    var id = b.getAttribute('data-pn');
    if (id) return busy(b, function () { return pnApi('do', { bundle: bundle, id: id }); });
    var pop = b.getAttribute('data-pop');
    if (pop) {
      return busy(b, function () { return pnApi('popup', { bundle: bundle, id: pop }); }).then(function (r) {
        if (!r) return;
        if (r.items && r.items.length) return pnShowList(pop, r.items);
        toast(r.note || '已在 Mac 上打开');
        if (r.screen) tpSetMode('screen');
      }, function () {});
    }
    var pick = b.getAttribute('data-pn-pick');
    if (pick !== null) {
      pnHideList();
      return pnApi('pick', { bundle: bundle, title: pick }).then(function (r) { pn.labels = r.labels || pn.labels; pnLabels(); }, function (err) { toast(err.message, true); });
    }
    if (b.getAttribute('data-pn-cancel')) { pnHideList(); return pnApi('cancel', { bundle: bundle }).catch(function () {}); }
    var chip = b.getAttribute('data-chip-text');
    if (chip) { var ta = $('pnText'); ta.value = ta.value ? ta.value + (/\s$/.test(ta.value) ? '' : ' ') + chip : chip; return; }
    var t = b.getAttribute('data-pn-text');
    if (!t) return;
    var area = $('pnText');
    if (t === 'clear') { area.value = ''; return; }
    var text = area.value;
    busy(b, function () { return pnApi('send', { bundle: bundle, text: text, submit: t === 'send' }); }).then(function (result) {
      if (!result || !result.ok) return;
      if (t === 'send') { area.value = ''; area.blur(); toast('已发送到 ' + pn.panel.name); } else toast('已填入 ' + pn.panel.name);
    }, function () {});
  }

  // 聚焦输入框 → 输入布局
  document.addEventListener('focusin', function (e) { if (e.target && e.target.id === 'pnText') setClass($('tp'), 'typing', true); }, false);
  document.addEventListener('focusout', function (e) {
    if (e.target && e.target.id === 'pnText') setTimeout(function () { if (document.activeElement !== $('pnText')) setClass($('tp'), 'typing', false); }, 150);
  }, false);

  // 按住说话：按下时把目标应用切到前台、定位输入框，再按住 Mac 上的语音键（默认 fn），松开结束
  function pnVoice(down) {
    var key = (config && config.settings.voiceKey) || 'fn';
    var btn = $('pnVoice');
    if (down && !pn.voiceDown) {
      pn.voiceDown = true;
      var epoch = pn.voiceEpoch = (pn.voiceEpoch || 0) + 1, bundle = pn.bundle;
      setClass(btn, 'on', true);
      btn.lastChild.textContent = '正在听…松开结束';
      pnApi('focus', { bundle: bundle }).then(function () { if (pn.voiceDown && pn.voiceEpoch === epoch && tp.visible && tp.mode === 'ctrl' && pn.bundle === bundle) tpSend({ t: 'kd', k: key }); }, function (err) { toast(err.message, true); });
    } else if (!down && pn.voiceDown) {
      pn.voiceDown = false; pn.voiceEpoch = (pn.voiceEpoch || 0) + 1;
      setClass(btn, 'on', false);
      btn.lastChild.textContent = '按住说话';
      tpSend({ t: 'ku', k: key });
    }
  }

  // ---------- 画面模式 ----------
  // 双指捏合放大（最多 4 倍），放大后单指拖动 = 平移画面；未放大时单指拖动 = 滚动 Mac 窗口。

  var scr = { on: false, streaming: false, meta: null, url: null, timer: null, retry: null, watch: null,
    frames: 0, fpsAt: 0, g: null, lastTap: null, generation: 0, loadToken: 0, xhr: null, loader: null,
    pendingURL: null, pendingMeta: null, healthAt: 0, lastArrival: 0, reprofile: false, z: { s: 1, x: 0, y: 0 } };

  function scrStart() {
    if (scr.on || document.hidden || tp.size === 'min') return;
    scr.on = true; scr.generation++; scr.frames = 0; scr.fpsAt = Date.now(); scr.lastArrival = 0; scr.rtcFailed = false;
    scrMsg('正在获取画面…');
    if (tp.ready) scrSubscribe(); else scrNext();
  }
  function scrAbortLoad() {
    scr.generation++; scr.loadToken++;
    if (scr.xhr) { var x = scr.xhr; scr.xhr = null; x.onload = x.onerror = x.ontimeout = null; x.abort(); }
    if (scr.loader) { scr.loader.onload = scr.loader.onerror = null; scr.loader = null; }
    if (scr.pendingURL) { (window.URL || window.webkitURL).revokeObjectURL(scr.pendingURL); scr.pendingURL = null; }
  }
  function scrStop() {
    if (scr.rtc) tpSend({ t: 'rtc', on: false });
    rtcTeardown();
    if (scr.streaming) tpSend({ t: 'screen', on: false });
    scr.on = false; scr.streaming = false; scr.pendingMeta = null;
    clearTimeout(scr.timer); clearTimeout(scr.retry); clearTimeout(scr.watch); scrAbortLoad();
    scr.meta = null;
    $('tpScreen').removeAttribute('src');
    if (scr.url) { (window.URL || window.webkitURL).revokeObjectURL(scr.url); scr.url = null; }
  }
  function scrSubscribe() {
    if (rtcUsable()) return rtcStart();
    scrSubscribeJpeg();
  }
  function scrSubscribeJpeg() {
    if (!scr.on || !tp.ready || document.hidden || tp.size === 'min') return;
    clearTimeout(scr.timer); clearTimeout(scr.retry); clearTimeout(scr.watch); scrAbortLoad();
    scr.streaming = true; scr.pendingMeta = null; scr.healthAt = Date.now(); scr.reprofile = false;
    scr.subscription = clientID + '-' + ((scr.subSequence || 0) + 1); scr.subSequence = (scr.subSequence || 0) + 1;
    var p = perfProfile();
    tpSend({ t: 'screen', on: true, w: p.w, fps: p.fps, q: p.q, subscription: scr.subscription });
    var watch = function () {
      if (!scr.on || !scr.streaming) return;
      if (Date.now() - scr.healthAt > 8500) return scrFallback('stream-timeout');
      scr.watch = setTimeout(watch, 2000);
    };
    scr.watch = setTimeout(watch, 2000);
  }
  function scrFallback(error) {
    if (!scr.on) return;
    if (scr.streaming) tpSend({ t: 'screen', on: false });
    scr.streaming = false; clearTimeout(scr.watch); clearTimeout(scr.retry); clearTimeout(scr.timer); scrAbortLoad();
    scrMsg(error === 'screen-permission' ? '需要屏幕录制权限：请在 Mac 的 iPadDuo 设置向导中授权' : '画面恢复中，正在使用兼容连接…');
    scr.timer = setTimeout(scrNext, error === 'screen-permission' ? 4000 : 300);
    scr.retry = setTimeout(function () { if (scr.on && tp.ready && !document.hidden) scrSubscribe(); }, error === 'screen-permission' ? 15000 : 6000);
  }
  // 在离屏图片中完成解码，再在同一个任务中提交图像与元数据。
  function scrDisplay(blob, meta, bytes, done) {
    if (!meta || !meta.frameId) { done(false); return; }
    var URLs = window.URL || window.webkitURL, url = URLs.createObjectURL(blob), image = new Image();
    var token = ++scr.loadToken, generation = scr.generation, began = monotonic(), arrival = began;
    var cycle = scr.lastArrival ? arrival - scr.lastArrival : 0; scr.lastArrival = arrival;
    scr.loader = image; scr.pendingURL = url;
    image.onerror = function () {
      if (token !== scr.loadToken) return;
      URLs.revokeObjectURL(url); scr.pendingURL = null; scr.loader = null; scrMsg('图像加载失败，正在重试…'); done(false);
    };
    image.onload = function () {
      if (!scr.on || token !== scr.loadToken || generation !== scr.generation) { URLs.revokeObjectURL(url); return; }
      var old = scr.meta, changed = old && (old.wid !== meta.wid || old.x !== meta.x || old.y !== meta.y || old.w !== meta.w || old.h !== meta.h);
      if (changed) { tpCancel(); scrZoom(1, 0, 0); }
      var previousURL = scr.url;
      $('tpScreen').src = url; scr.meta = meta; scr.url = url; scr.pendingURL = null; scr.loader = null;
      scr.healthAt = Date.now(); scrMsg('');
      if (meta.app) $('tpApp').textContent = meta.app;
      if (old && old.bundle !== meta.bundle && tp.view === 'watch') { ctl.bundle = ''; ctlStart(); }
      if (scr.lastDisplayAt && Date.now() - scr.lastDisplayAt > 2000) { scr.frames = 0; scr.fpsAt = Date.now(); }
      scr.lastDisplayAt = Date.now(); scr.frames++;
      var dt = Date.now() - scr.fpsAt;
      if (dt > 2000) {
        var p = perfProfile();
        $('tpFps').textContent = Math.round(scr.frames * 10000 / dt) / 10 + ' fps · ' + p.w + 'px · ' + Math.round(bytes / 1024) + ' KB · ' + (scr.streaming ? '推流' : '兼容连接');
        scr.frames = 0; scr.fpsAt = Date.now();
      }
      var decodeMs = monotonic() - began;
      nextFrame(function () {
        if (previousURL) URLs.revokeObjectURL(previousURL);
        if (!scr.on || generation !== scr.generation || token !== scr.loadToken) return;
        perfSample(monotonic() - began, cycle); done(true);
      });
    };
    image.src = url;
  }
  function scrOnFrame(blob) {
    if (!scr.on || !scr.streaming || document.hidden) return;
    var meta = scr.pendingMeta, bytes = scr.pendingBytes || blob.size || 0;
    scr.pendingMeta = null;
    if (!meta || !meta.frameId) return;
    scrDisplay(blob, meta, bytes, function () {
      if (!scr.on || !scr.streaming) return;
      if (scr.reprofile) scrSubscribe();
      else tpSend({ t: 'fack', frameId: meta.frameId, subscription: scr.subscription });
    });
  }
  function scrMsg(text) { $('tpScreenMsg').textContent = text || ''; setClass($('tpScreenMsg'), 'on', !!text); }
  function scrNext() {
    clearTimeout(scr.timer);
    if (!scr.on || !tp.visible || scr.streaming || document.hidden || tp.size === 'min' || scr.xhr || scr.loader) return;
    var began = monotonic(), generation = scr.generation, p = perfProfile(), x = new XMLHttpRequest();
    scr.xhr = x;
    x.open('GET', '/api/screen/frame?w=' + p.w + '&_=' + Date.now(), true); x.responseType = 'blob'; x.timeout = 8000;
    x.setRequestHeader('X-Deck', '1'); x.setRequestHeader('X-Deck-Client', clientID);
    var pin = store('deck-pin'); if (pin) x.setRequestHeader('X-Deck-Pin', pin);
    function again(ms) { if (scr.on && generation === scr.generation && !scr.streaming) scr.timer = setTimeout(scrNext, ms); }
    x.onload = function () {
      if (scr.xhr === x) scr.xhr = null;
      if (!scr.on || generation !== scr.generation || scr.streaming) return;
      if (x.status !== 200) { scrMsg(x.status === 401 ? '请返回桌面重新连接并输入 PIN' : '画面暂不可用，正在重试…'); again(2000); return; }
      var meta; try { meta = JSON.parse(decodeURIComponent(x.getResponseHeader('X-Win') || '')); } catch (e) { again(1500); return; }
      scrDisplay(x.response, meta, x.response.size || 0, function () { again(Math.max(0, 1000 / p.fps - (monotonic() - began))); });
    };
    x.onerror = x.ontimeout = function () { if (scr.xhr === x) scr.xhr = null; if (generation !== scr.generation) return; scrMsg('连接中断，正在重试…'); again(2000); };
    x.send();
  }

  // ---------- WebRTC 画面（iPadOS 11+）----------
  // Mac 端 VideoToolbox 硬件编码 H.264，iPad 硬件解码；只传变化部分，延迟与码率都远低于 JPEG。
  // 信令走同一条 WebSocket；不支持（iOS 10）或连接失败时自动回到 JPEG 推流。
  var RTC_OK = !!(window.RTCPeerConnection && window.Promise);
  setClass($('tp'), 'can-rtc', RTC_OK);
  scr.virtual = RTC_OK && store('deck-virtual') === '1';
  setClass($('tpExtend'), 'on', scr.virtual);
  var RTC_PROFILES = { lite: { w: 1024, fps: 24, kbps: 1800 }, balanced: { w: 1280, fps: 30, kbps: 3500 }, full: { w: 1920, fps: 60, kbps: 8000 } };
  function rtcUsable() { return RTC_OK && !scr.rtcFailed && store('deck-rtc') !== 'off' && tp.ready; }
  // 扩展屏：Mac 新增一块与 iPad 屏幕同尺寸（逻辑点、HiDPI）的虚拟显示器，iPad 显示它 —— 类似随航
  function rtcVirtualSize() {
    var w = Math.max(window.screen.width, window.screen.height), h = Math.min(window.screen.width, window.screen.height);
    return Math.max(800, Math.min(2732, w)) + 'x' + Math.max(600, Math.min(2048, h));
  }
  function rtcSetVirtual(on) {
    scr.virtual = !!on && RTC_OK; store('deck-virtual', scr.virtual ? '1' : '');
    setClass($('tpExtend'), 'on', scr.virtual);
    setClass($('tp'), 'virtual', false);
    if (scr.on) { scr.rtcFailed = false; scrMsg(scr.virtual ? '正在创建扩展屏…' : '正在切回窗口画面…'); rtcStart(); }
  }
  function rtcStart() {
    if (!scr.on || !tp.ready || document.hidden || tp.size === 'min') return;
    clearTimeout(scr.timer); clearTimeout(scr.retry); clearTimeout(scr.watch); scrAbortLoad();
    if (scr.streaming) { tpSend({ t: 'screen', on: false }); scr.streaming = false; }
    rtcTeardown();
    var p = RTC_PROFILES[PERF.uiTier] || RTC_PROFILES.balanced, r = $('tpPad').getBoundingClientRect();
    var visibleW = Math.round((r.width || Math.max(window.screen.width, window.screen.height)) * Math.min(window.devicePixelRatio || 1, 2));
    scr.rtc = { pc: null, at: Date.now(), shown: false, stats: null };
    scr.healthAt = Date.now();
    var msg = { t: 'rtc', on: true, w: Math.max(640, Math.min(p.w, visibleW)), fps: p.fps, kbps: p.kbps };
    if (scr.virtual) { msg.virtual = rtcVirtualSize(); msg.w = Math.max(msg.w, Math.min(2560, parseInt(msg.virtual, 10) * Math.min(window.devicePixelRatio || 1, 2))); }
    tpSend(msg);
    var session = scr.rtc;
    // 6 秒内没出画面就放弃 WebRTC，用 JPEG
    scr.watch = setTimeout(function () { if (scr.rtc === session && !session.shown) rtcFail('rtc-timeout'); }, 6000);
  }
  function rtcTeardown() {
    var r = scr.rtc; scr.rtc = null;
    setClass($('tp'), 'virtual', false);
    clearTimeout(scr.rtcStats);
    setClass($('tp'), 'rtc-live', false);
    var v = $('tpVideo');
    if (v) { try { v.pause(); } catch (e) { /* ignore */ } v.srcObject = null; }
    if (r && r.pc) { try { r.pc.close(); } catch (e) { /* 已关闭 */ } }
  }
  function rtcFail(err) {
    if (!scr.rtc && err !== 'screen-permission') return;
    if (scr.rtc) tpSend({ t: 'rtc', on: false });
    rtcTeardown();
    if (err === 'screen-permission') { scrFallback(err); return; }
    if (err === 'virtual-display-unavailable') { toast('这台 Mac 无法创建扩展屏，已切回窗口画面', true); scr.virtual = false; store('deck-virtual', ''); setClass($('tpExtend'), 'on', false); if (scr.on) rtcStart(); return; }
    scr.rtcFailed = true; // 本次打开改用 JPEG；重新进入画面模式时再试
    if (scr.on) { scrMsg('改用兼容画面…'); scrSubscribeJpeg(); }
  }
  function rtcOffer(sdp) {
    var session = scr.rtc;
    if (!session || session.pc || !scr.on) return;
    var pc;
    try { pc = new RTCPeerConnection({ iceServers: [] }); } catch (e) { rtcFail('rtc-create'); return; }
    session.pc = pc;
    var v = $('tpVideo');
    pc.ontrack = function (e) {
      if (scr.rtc !== session) return;
      v.srcObject = e.streams && e.streams[0] ? e.streams[0] : new MediaStream([e.track]);
      var p = v.play(); if (p && p.catch) p.catch(function () { /* muted 自动播放，失败时等首帧事件 */ });
    };
    var shown = function () {
      if (scr.rtc !== session || session.shown || !v.videoWidth) return;
      session.shown = true; clearTimeout(scr.watch);
      setClass($('tp'), 'rtc-live', true); scrMsg('');
      rtcStatsLoop(session);
    };
    v.onloadeddata = v.onplaying = shown;
    v.onresize = function () { if (scr.rtc === session && scr.meta && v.videoWidth) { scr.meta.pw = v.videoWidth; scr.meta.ph = v.videoHeight; } };
    pc.oniceconnectionstatechange = function () {
      if (scr.rtc === session && (pc.iceConnectionState === 'failed')) rtcFail('ice-failed');
    };
    var answered = false;
    var sendAnswer = function () {
      if (answered || scr.rtc !== session || !pc.localDescription) return;
      answered = true; tpSend({ t: 'rtc-answer', sdp: pc.localDescription.sdp });
    };
    // 服务端不接收逐条候选：等本地候选收集完（局域网通常 <200ms），最多 1 秒
    pc.onicecandidate = function (e) { if (!e.candidate) sendAnswer(); };
    pc.setRemoteDescription({ type: 'offer', sdp: sdp }).then(function () { return pc.createAnswer(); })
      .then(function (a) { return pc.setLocalDescription(a); })
      .then(function () { setTimeout(sendAnswer, 1000); })
      .catch(function () { rtcFail('rtc-sdp'); });
  }
  function rtcMeta(meta) {
    if (!scr.rtc || !meta || !meta.frameId) return;
    var v = $('tpVideo'), old = scr.meta;
    if (v.videoWidth) { meta.pw = v.videoWidth; meta.ph = v.videoHeight; }
    if (!meta.pw) { meta.pw = meta.w; meta.ph = meta.h; }
    var changed = old && (old.wid !== meta.wid || old.x !== meta.x || old.y !== meta.y || old.w !== meta.w || old.h !== meta.h);
    if (changed) { tpCancel(); scrZoom(1, 0, 0); }
    scr.meta = meta; scr.healthAt = Date.now();
    setClass($('tp'), 'virtual', !!(meta.disp && !meta.wid));
    if (meta.app) $('tpApp').textContent = meta.app;
    if (old && old.bundle !== meta.bundle && tp.view === 'watch') { ctl.bundle = ''; ctlStart(); }
  }
  // 每 2 秒读一次接收统计：帧率、码率、丢包；画面卡住时请求关键帧
  function rtcStatsLoop(session) {
    clearTimeout(scr.rtcStats);
    if (scr.rtc !== session || !session.pc || !session.pc.getStats) return;
    session.pc.getStats().then(function (report) {
      if (scr.rtc !== session) return;
      var cur = null;
      report.forEach(function (st) { if (st.type === 'inbound-rtp' && (st.kind === 'video' || st.mediaType === 'video')) cur = st; });
      if (cur) {
        var prev = session.stats, now = Date.now();
        if (prev) {
          var dt = Math.max(1, now - prev.at) / 1000;
          var fps = ((cur.framesDecoded || 0) - (prev.framesDecoded || 0)) / dt;
          var mbps = ((cur.bytesReceived || 0) - (prev.bytesReceived || 0)) * 8 / dt / 1e6;
          var lost = (cur.packetsLost || 0) - (prev.packetsLost || 0);
          var v = $('tpVideo');
          $('tpFps').textContent = Math.round(fps) + ' fps · ' + (v.videoWidth || '?') + 'px · ' + (Math.round(mbps * 10) / 10) + ' Mbps' + (lost > 0 ? ' · 丢包 ' + lost : '') + ' · 硬件视频';
        }
        session.stats = { at: now, framesDecoded: cur.framesDecoded, bytesReceived: cur.bytesReceived, packetsLost: cur.packetsLost };
      }
      scr.rtcStats = setTimeout(function () { rtcStatsLoop(session); }, 2000);
    }, function () { scr.rtcStats = setTimeout(function () { rtcStatsLoop(session); }, 4000); });
  }

  // 缩放 / 平移：作用在包住截图的图层上（transform-origin 左上角）
  function scrZoom(s, x, y) {
    var r = $('tpPad').getBoundingClientRect();
    s = Math.max(1, Math.min(4, s));
    // 不让画面拖出边界
    x = Math.min(0, Math.max(r.width - r.width * s, x));
    y = Math.min(0, Math.max(r.height - r.height * s, y));
    scr.z = { s: s, x: s === 1 ? 0 : x, y: s === 1 ? 0 : y };
    var l = $('tpLayer');
    l.style.webkitTransform = l.style.transform = 'translate3d(' + scr.z.x + 'px,' + scr.z.y + 'px,0) scale(' + s + ')';
    setClass($('tp'), 'zoomed', s > 1.01);
  }

  // 触点 → 窗口内的归一化坐标（考虑缩放平移与 contain 留边）；落在画面外返回 null
  function scrPoint(cx, cy) {
    var m = scr.meta;
    if (!m) return null;
    var r = $('tpPad').getBoundingClientRect();
    var lx = (cx - r.left - scr.z.x) / scr.z.s, ly = (cy - r.top - scr.z.y) / scr.z.s;
    var k = Math.min(r.width / m.pw, r.height / m.ph);
    var w = m.pw * k, h = m.ph * k;
    var nx = (lx - (r.width - w) / 2) / w, ny = (ly - (r.height - h) / 2) / h;
    if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return null;
    return { nx: Math.round(nx * 10000) / 10000, ny: Math.round(ny * 10000) / 10000, scale: m.w / (w * scr.z.s) };
  }

  function dist(ts) { var dx = ts[0].clientX - ts[1].clientX, dy = ts[0].clientY - ts[1].clientY; return Math.sqrt(dx * dx + dy * dy); }
  function avg(ts) { var x = 0, y = 0; for (var i = 0; i < ts.length; i++) { x += ts[i].clientX; y += ts[i].clientY; } return { x: x / ts.length, y: y / ts.length }; }
  function dragFeedback(on) { setClass($('tpPad'), 'dragging', on); setClass($('tp'), 'drag-active', on); }
  function scrollSend(g, dx, dy, at) {
    g.rx = (g.rx || 0) + dx; g.ry = (g.ry || 0) + dy;
    var x = Math.round(g.rx), y = Math.round(g.ry); g.rx -= x; g.ry -= y;
    if (!x && !y) return;
    scr.scrollAt = monotonic();
    var m = { t: at ? 'sa' : 's', x: x, y: y };
    if (at) { m.nx = at.nx; m.ny = at.ny; }
    tpSend(m);
  }
  function scrollMove(g, dx, dy, at) {
    var now = monotonic(), dt = Math.max(1, now - g.lt), a = Math.exp(-dt / 35);
    g.vx = (g.vx || 0) * a + dx / dt * (1 - a); g.vy = (g.vy || 0) * a + dy / dt * (1 - a); g.lt = now;
    scrollSend(g, dx, dy, at); if (at) g.anchor = { nx: at.nx, ny: at.ny };
  }
  function tpStopInertia() { if (tp.inertia) cancelFrame(tp.inertia); tp.inertia = null; }
  function tpInertia(vx, vy, anchor) {
    tpStopInertia();
    var previous = monotonic(), g = {}, origin = scr.meta;
    var step = function (now) {
      tp.inertia = null;
      var dt = now - previous; previous = now;
      if (document.hidden || !tp.visible || tp.size === 'min' || dt > 120 || (anchor && (!scr.meta || !origin || scr.meta.wid !== origin.wid || scr.meta.x !== origin.x || scr.meta.y !== origin.y || scr.meta.w !== origin.w || scr.meta.h !== origin.h))) return;
      var decay = Math.exp(-Math.max(0, dt) / 180), distance = 180 * (1 - decay);
      scrollSend(g, vx * distance, vy * distance, anchor); vx *= decay; vy *= decay;
      if (Math.abs(vx) + Math.abs(vy) > 0.025) tp.inertia = nextFrame(step);
    };
    tp.inertia = nextFrame(step);
  }
  function scrTouchStart(e) {
    e.preventDefault(); tpStopInertia();
    if (e.touches.length > 2) { tpCancel(); return; }
    var p = avg(e.touches), now = monotonic(); clearTimeout(scr.g && scr.g.timer);
    if (e.touches.length === 2) {
      if (scr.g && scr.g.mode === 'drag') { tpSend({ t: 'pu' }); dragFeedback(false); }
      scr.g = { mode: 'two', t: now, x: p.x, y: p.y, x0: p.x, y0: p.y, d0: dist(e.touches), z0: scr.z, moved: false, intent: '', vx: 0, vy: 0, lt: now };
      return;
    }
    // 刚在滚动 / 惯性中：这一下只是「按停」，不算点击（与 iOS 一致）
    var g = { mode: 'touch', t: now, lt: now, x: p.x, y: p.y, sx: p.x, sy: p.y, moved: false, vx: 0, vy: 0, caught: now - (scr.scrollAt || 0) < 160 };
    scr.g = g;
    // 指针先移到手指下：网页的悬停效果（视频控制条、菜单）在抬手前就出现，点击落点也已就位
    if (tp.view !== 'watch' && scr.z.s <= 1.01) { var hq = scrPoint(p.x, p.y); if (hq) tpSend({ t: 'hv', nx: hq.nx, ny: hq.ny }); }
    g.timer = setTimeout(function () {
      if (scr.g !== g || g.moved || document.hidden) return;
      var q = scrPoint(g.x, g.y); if (!q) return;
      if (tp.view === 'watch') { g.mode = 'done'; tpSend({ t: 'tap', nx: q.nx, ny: q.ny }); scrRipple(g.x, g.y); return; }
      g.mode = 'drag'; tpSend({ t: 'pd', nx: q.nx, ny: q.ny }); dragFeedback(true);
    }, 450);
  }
  function scrTouchMove(e) {
    e.preventDefault(); var g = scr.g;
    if (!g || !e.touches.length || g.mode === 'none' || g.mode === 'done') return;
    var p = avg(e.touches), dx = p.x - g.x, dy = p.y - g.y; g.x = p.x; g.y = p.y;
    if (g.mode === 'drag') { var q = scrPoint(p.x, p.y); if (q) tpSend({ t: 'pm', nx: q.nx, ny: q.ny }); return; }
    if (g.mode === 'two') {
      if (e.touches.length !== 2) return;
      var d = dist(e.touches), travel = Math.abs(p.x - g.x0) + Math.abs(p.y - g.y0);
      if (!g.intent) {
        if (Math.abs(d - g.d0) > 8) g.intent = 'pinch';
        else if (travel > 6 && Math.abs(d - g.d0) < 6) { g.intent = 'scroll'; dx = p.x - g.x0; dy = p.y - g.y0; }
        else return;
      }
      g.moved = true;
      if (g.intent === 'pinch') {
        var r = $('tpPad').getBoundingClientRect(), z = g.z0, scale = Math.max(1, Math.min(4, z.s * d / Math.max(1, g.d0)));
        var cx = (g.x0 - r.left - z.x) / z.s, cy = (g.y0 - r.top - z.y) / z.s;
        scrZoom(scale, p.x - r.left - cx * scale, p.y - r.top - cy * scale); return;
      }
      var at2 = scrPoint(p.x, p.y); if (at2) scrollMove(g, dx * at2.scale, dy * at2.scale, at2); return;
    }
    if (!g.moved) {
      if (Math.abs(p.x - g.sx) + Math.abs(p.y - g.sy) <= 8) return;
      g.moved = true; clearTimeout(g.timer); dx = p.x - g.sx; dy = p.y - g.sy;
    }
    if (scr.z.s > 1.01) { scrZoom(scr.z.s, scr.z.x + dx, scr.z.y + dy); return; }
    var at = scrPoint(p.x, p.y); if (at) scrollMove(g, dx * at.scale, dy * at.scale, at);
  }
  function scrTouchEnd(e) {
    e.preventDefault();
    if (e.type === 'touchcancel') { tpCancel(); return; }
    var g = scr.g; if (!g) return; clearTimeout(g.timer);
    var dt = monotonic() - g.t;
    if (g.mode === 'drag') { if (e.touches.length) return; tpSend({ t: 'pu' }); dragFeedback(false); scr.g = null; return; }
    if (g.mode === 'two') {
      if (!g.moved && dt < 350) { var r = scrPoint(g.x, g.y); if (r) tpSend({ t: 'tap', nx: r.nx, ny: r.ny, b: 'right' }); }
      else if (g.intent === 'scroll' && monotonic() - g.lt < 80) tpInertia(g.vx, g.vy, g.anchor);
      scr.g = e.touches.length ? { mode: 'none' } : null; return;
    }
    if (e.touches.length) return;
    if (g.mode === 'touch' && !g.moved && dt < 450 && g.caught) { scr.g = null; return; }
    if (g.mode === 'touch' && !g.moved && dt < 450) {
      var now = monotonic(), lt = scr.lastTap;
      var dbl = lt && now - lt.t < 320 && Math.abs(lt.x - g.sx) < 30 && Math.abs(lt.y - g.sy) < 30;
      if (tp.view === 'watch') {
        var pr = $('tpPad').getBoundingClientRect(), zone = (g.sx - pr.left) / pr.width;
        if (dbl && (zone < 0.33 || zone > 0.67) && lt.zone === (zone < 0.33 ? 'left' : 'right')) {
          ovShow(true); videoAct(zone < 0.33 ? 'back' : 'fwd'); scrRipple(g.sx, g.sy); scr.lastTap = null;
        } else { ovShow(!ovVisible()); scr.lastTap = { t: now, x: g.sx, y: g.sy, zone: zone < 0.33 ? 'left' : zone > 0.67 ? 'right' : 'middle' }; }
      } else {
        var t = scrPoint(g.sx, g.sy);
        if (t) { tpSend({ t: 'tap', nx: t.nx, ny: t.ny, n: dbl ? 2 : 1 }); scr.lastTap = dbl ? null : { t: now, x: g.sx, y: g.sy }; scrRipple(g.sx, g.sy); }
      }
    } else if (g.mode === 'touch' && g.moved && scr.z.s <= 1.01 && monotonic() - g.lt < 80) tpInertia(g.vx, g.vy, g.anchor);
    scr.g = null;
  }
  function scrRipple(x, y) {
    var r = $('tpRipple'), pr = $('tpPad').getBoundingClientRect(); r.style.left = (x - pr.left - 22) + 'px'; r.style.top = (y - pr.top - 22) + 'px';
    setClass(r, 'go', false); nextFrame(function () { setClass(r, 'go', true); });
  }

  var pad = $('tpPad');
  pad.addEventListener('touchstart', function (e) {
    tpStopInertia(); if (scrDirect()) return scrTouchStart(e);
    e.preventDefault(); if (e.touches.length > 2) { tpCancel(); return; }
    var now = monotonic(), p = avg(e.touches);
    if (e.touches.length === 1) {
      var lt = tp.lastTap, drag = lt && now - lt.t < 280 && Math.abs(lt.x - p.x) < 50 && Math.abs(lt.y - p.y) < 50;
      tp.g = { mode: drag ? 'drag' : 'move', t: now, lt: now, x: p.x, y: p.y, sx: p.x, sy: p.y, moved: false, sensitivity: { slow: 0.75, normal: 1, fast: 1.3 }[store('deck-pointer-speed') || 'normal'] || 1, accel: store('deck-pointer-accel') !== 'off' };
      if (drag) { tp.lastTap = null; tpSend({ t: 'd', b: 'left', n: 2 }); dragFeedback(true); }
    } else if (e.touches.length === 2) {
      if (tp.g && tp.g.mode === 'drag') { tpSend({ t: 'u', b: 'left' }); dragFeedback(false); }
      tp.g = { mode: 'scroll', t: now, x: p.x, y: p.y, sx: p.x, sy: p.y, moved: false, vx: 0, vy: 0, lt: now };
    }
  }, { passive: false });
  pad.addEventListener('touchmove', function (e) {
    if (scrDirect()) return scrTouchMove(e);
    e.preventDefault(); var g = tp.g; if (!g || !e.touches.length) return;
    var p = avg(e.touches), dx = p.x - g.x, dy = p.y - g.y, now = monotonic(), dt = Math.max(1, now - g.lt);
    g.x = p.x; g.y = p.y;
    if (g.mode === 'scroll') {
      if (e.touches.length !== 2) return;
      if (!g.moved) {
        if (Math.abs(p.x - g.sx) + Math.abs(p.y - g.sy) < 4) return;
        g.moved = true; dx = p.x - g.sx; dy = p.y - g.sy;
      }
      scrollMove(g, dx * 2, dy * 2); return;
    }
    if (g.mode !== 'move' && g.mode !== 'drag') return;
    if (Math.abs(p.x - g.sx) + Math.abs(p.y - g.sy) > 6) g.moved = true;
    if (!g.pointerStarted) {
      if (Math.abs(p.x - g.sx) + Math.abs(p.y - g.sy) < 2) return;
      g.pointerStarted = true; dx = p.x - g.sx; dy = p.y - g.sy; dt = Math.max(1, now - g.t);
    }
    g.lt = now;
    var speed = Math.sqrt(dx * dx + dy * dy) / dt;
    var gain = g.accel === false ? 1.6 : 1.2 + 2.3 * speed / (speed + 0.65);
    if (g.mode === 'drag') gain = 1.15;
    var sensitivity = g.sensitivity || 1;
    // 时间归一化与小数残差使相同速度在不同采样率下得到一致位移。
    g.rx = (g.rx || 0) + dx * gain * sensitivity; g.ry = (g.ry || 0) + dy * gain * sensitivity;
    var x = Math.round(g.rx * 100) / 100, y = Math.round(g.ry * 100) / 100; g.rx -= x; g.ry -= y;
    if (x || y) tpSend({ t: 'm', x: x, y: y });
  }, { passive: false });
  function padEnd(e) {
    if (e.type === 'touchcancel') { e.preventDefault(); tpCancel(); return; }
    if (scrDirect()) return scrTouchEnd(e);
    e.preventDefault(); var g = tp.g; if (!g) return;
    var dt = monotonic() - g.t;
    if (g.mode === 'drag' && !e.touches.length) { tpSend({ t: 'u', b: 'left' }); dragFeedback(false); tp.g = null; return; }
    if (g.mode === 'scroll') {
      if (!g.moved && dt < 300) tpSend({ t: 'c', b: 'right' });
      else if (g.moved && monotonic() - g.lt < 80) tpInertia(g.vx, g.vy);
      tp.g = e.touches.length ? { mode: 'none' } : null; return;
    }
    if (g.mode === 'move' && !e.touches.length) {
      if (!g.moved && dt < 220) { tpSend({ t: 'c', b: 'left' }); tp.lastTap = { t: monotonic(), x: g.sx, y: g.sy }; }
      tp.g = null;
    }
  }
  pad.addEventListener('touchend', padEnd, { passive: false });
  pad.addEventListener('touchcancel', padEnd, { passive: false });

  // 鼠标调试（在 Mac 浏览器里打开页面时）
  pad.addEventListener('mousedown', function (e) {
    if (scrDirect()) { var q = scrPoint(e.clientX, e.clientY); if (q) { tpSend({ t: 'tap', nx: q.nx, ny: q.ny }); scrRipple(e.clientX, e.clientY); } return; }
    tp.g = { mode: 'move', t: Date.now(), x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false };
  }, false);
  pad.addEventListener('mousemove', function (e) {
    var g = tp.g;
    if (scrDirect() || !g || g.mode !== 'move') return;
    tpSend({ t: 'm', x: (e.clientX - g.x) * 2, y: (e.clientY - g.y) * 2 });
    g.x = e.clientX; g.y = e.clientY;
    if (Math.abs(e.clientX - g.sx) + Math.abs(e.clientY - g.sy) > 6) g.moved = true;
  }, false);
  pad.addEventListener('mouseup', function () {
    if (scrDirect()) return;
    if (tp.g && !tp.g.moved) tpSend({ t: 'c', b: 'left' });
    tp.g = null;
  }, false);

  // —— 键盘：隐藏输入框接收 iPad 键盘（支持中文输入法组字），并在上方显示刚输入的内容 ——
  var tpInput = $('tpInput');
  tpInput.value = ' ';
  function tpEcho(text) {
    var el = $('tpEcho');
    if (text === null) { el.textContent = ''; setClass(el, 'on', false); return; }
    el.textContent = (el.textContent + text).slice(-40);
    setClass(el, 'on', true);
    clearTimeout(tp.echoTimer);
    tp.echoTimer = setTimeout(function () { if (document.activeElement !== tpInput) tpEcho(null); }, 2500);
  }
  tpInput.addEventListener('compositionstart', function () { tp.composing = true; }, false);
  tpInput.addEventListener('compositionend', function () { tp.composing = false; tpFlushInput(); }, false);
  tpInput.addEventListener('input', function () { if (!tp.composing) tpFlushInput(); }, false);
  tpInput.addEventListener('keydown', function (e) {
    if (e.keyCode === 13 && !tp.composing && !e.isComposing) { e.preventDefault(); tpSend({ t: 'k', k: 'return' }); tpEcho(' ⏎ '); }
  }, false);
  tpInput.addEventListener('focus', function () { $('tpEcho').textContent = ''; tpEcho('键盘已连接 Mac：'); }, false);
  tpInput.addEventListener('blur', function () { setTimeout(function () { tpEcho(null); }, 800); }, false);
  function tpFlushInput() {
    var v = tpInput.value;
    if (v.length === 0) { tpSend({ t: 'k', k: 'backspace' }); var el = $('tpEcho'); el.textContent = el.textContent.slice(0, -1); }
    else if (v.length > 1) { tpSend({ t: 'x', s: v.slice(1) }); tpEcho(v.slice(1)); }
    tpInput.value = ' ';
  }

  // —— 浮层上的按钮：返回 / 模式 / 按键 / 键盘 ——
  $('tp').addEventListener('click', function (e) {
    if (closest(e.target, '#tpCtrl')) return;
    var b = closest(e.target, '[data-key], [data-tp]');
    if (!b) return;
    e.preventDefault();
    var key = b.getAttribute('data-key');
    if (key) { tpSend({ t: 'k', k: key }); setClass(b, 'hit', true); setTimeout(function () { setClass(b, 'hit', false); }, 150); return; }
    var act = b.getAttribute('data-tp');
    if (act === 'close') tpClose();
    else if (act === 'release') tpCancel();
    else if (act === 'zoom-reset') scrZoom(1, 0, 0);
    else if (act === 'extend') {
      // 实验功能：会在 Mac 上新增一块虚拟显示器。Mac 若本身就在用虚拟显示器（无头 Mac mini、远程桌面），可能短暂重排或黑屏
      if (!scr.virtual && store('deck-virtual-ok') !== '1') {
        if (!window.confirm('扩展屏（实验）：Mac 会新增一块与 iPad 同尺寸的显示器。\n若这台 Mac 没接真实显示器、靠远程桌面或虚拟显示器工作，可能出现几秒的屏幕重排。继续？')) return;
        store('deck-virtual-ok', '1');
      }
      rtcSetVirtual(!scr.virtual);
    }
    else if (act === 'bring' || act === 'home') tpSend({ t: 'rtc-cmd', cmd: act });
    else if (act === 'pointer') { tpSetRelative(!tp.relative); toast(tp.relative ? '触控板：单指移动指针，轻点单击' : '直接触控：点哪里就点哪里'); }
    else if (act === 'size') tpSetSize(tp.size === 'split' ? 'full' : 'split');
    else if (act === 'kbd') { tpInput.value = ' '; tpInput.focus(); }
    else if (act.indexOf('mode-') === 0) tpSetMode(act.slice(5));
  }, false);

  // —— 控制区的触摸：进度条拖动、按住说话；顶栏下滑关闭 ——
  var tpTop = null;
  $('tp').addEventListener('touchstart', function (e) {
    if (e.target && e.target.id === 'pnText') setClass($('tp'), 'typing', true); // 不完全依赖 focusin
    if (closest(e.target, '.tp-top') && !closest(e.target, 'button')) { tpTop = { y: pointFrom(e).y, x: pointFrom(e).x }; return; }
    if (scrubStart(e)) return;
    if (closest(e.target, '#pnVoice')) { e.preventDefault(); pnVoice(true); }
  }, { passive: false });
  $('tp').addEventListener('touchmove', function (e) { if (ctl.scrub) scrubMove(e); }, { passive: false });
  $('tp').addEventListener('touchend', function (e) {
    if (tpTop) {
      var p = pointFrom(e), st = tpTop, dy = p.y - st.y;
      tpTop = null;
      if (dy > 70 && Math.abs(p.x - st.x) < dy) tpClose();
      else if (Math.abs(dy) < 10 && Math.abs(p.x - st.x) < 10) tpSetSize(tp.size === 'split' ? 'full' : 'split'); // 点顶栏空白 = 全屏 / 分屏
      return;
    }
    if (ctl.scrub) { e.preventDefault(); return scrubEnd(); }
    if (pn.voiceDown) { e.preventDefault(); pnVoice(false); }
  }, { passive: false });
  $('tp').addEventListener('touchcancel', function () { tpTop = null; tpCancel(); }, false);
  // 鼠标（Mac 浏览器调试）
  $('tp').addEventListener('mousedown', function (e) { if (scrubStart(e)) return; if (closest(e.target, '#pnVoice')) pnVoice(true); }, false);
  document.addEventListener('mousemove', function (e) { if (ctl.scrub) scrubMove(e); }, false);
  document.addEventListener('mouseup', function () { if (ctl.scrub) scrubEnd(); if (pn.voiceDown) pnVoice(false); }, false);


  // ---------- 时钟与状态 ----------

  var WEEK = ['日', '一', '二', '三', '四', '五', '六'];
  function tick() {
    var d = new Date();
    var hh = d.getHours(), mm = d.getMinutes();
    $('clockTime').textContent = (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
    $('clockDate').textContent = (d.getMonth() + 1) + '月' + d.getDate() + '日 周' + WEEK[d.getDay()];
    $('npClock').textContent = $('clockTime').textContent;
  }

  var offline = false;
  function setConn(ok) {
    $('conn').className = 'conn ' + (ok ? 'ok' : 'bad');
    if (offline === !ok) return;
    offline = !ok;
    setClass($('offline'), 'on', offline);
  }

  var volume = 0, muted = false;
  function showVolume(v, m) {
    if (typeof v === 'number') volume = v;
    if (typeof m === 'boolean') muted = m;
    $('volFill').style.webkitTransform = $('volFill').style.transform = 'scaleX(' + (volume / 100) + ')';
    $('volNum').textContent = muted ? '静音' : volume;
    $('dock').className = 'dock' + (muted ? ' muted' : '');
  }

  // ---------- 执行 ----------

  function flash(el, ok) {
    if (!el) return;
    var cls = ok ? ' ok' : ' err';
    el.className += cls;
    setTimeout(function () { el.className = el.className.replace(cls, ''); }, ok ? 700 : 1100);
  }

  function tileById(id) {
    var t = null;
    config.pages.forEach(function (p) { p.tiles.forEach(function (x) { if (x.id === id) t = x; }); });
    return t;
  }
  function isDangerous(t) { return t.type === 'system' && /^(lock|sleep)$/.test(t.target); }

  function runTile(id, el) {
    var t = tileById(id);
    if (el && el.getAttribute('data-busy')) return;
    var intent = ++stageIntent; clearTimeout(stageTimer);
    if (el) { el.setAttribute('data-busy', '1'); setClass(el, 'is-busy', true); }
    api('POST', '/api/run', { id: id }).then(function (res) {
      setConn(true);
      if (el) { el.removeAttribute('data-busy'); setClass(el, 'is-busy', false); flash(el, true); }
      if (res && res.reused) toast('已切到已打开的页面');
      if (t) stageForTile(t, res, intent);
      if (t && t.type === 'app') liveSoon(1200);
    }, function (e) {
      if (el) { el.removeAttribute('data-busy'); setClass(el, 'is-busy', false); flash(el, false); }
      if (!offline) toast(e.message, true);
    });
  }

  function runSystem(action) {
    var v = /^(playpause|next|prev)$/.test(action) && srcVideo();
    if (v) { srcAct(v.id, action); return; }
    api('POST', '/api/system', { action: action }).then(function (s) {
      setConn(true);
      if (/^(playpause|next|prev|mute|volup|voldown)$/.test(action)) liveSoon(/^(next|prev)$/.test(action) ? 700 : 350);
      if (typeof s.volume === 'number') showVolume(s.volume, s.muted);
    }, function (e) { toast(e.message, true); });
  }

  // ---------- 触摸处理（统一 touch 与 mouse，规避 300ms 延迟） ----------

  var press = null;      // 当前手势
  var lastTouchAt = Date.now(); // 最近一次触摸（歌词页只在闲置一段时间后才自动进入）
  var lastTouch = 0;
  var LONG_PRESS = 320;

  function pointFrom(e) {
    var t = e.changedTouches ? e.changedTouches[0] : e;
    return { x: t.clientX, y: t.clientY };
  }

  function onStart(e) {
    lastTouchAt = Date.now();
    if (e.type === 'mousedown') { if (Date.now() - lastTouch < 800 || e.button !== 0) return; }
    else lastTouch = Date.now();
    if (closest(e.target, '.sheet-wrap') || closest(e.target, '#tp') || closest(e.target, '#fb')) return;

    var el = closest(e.target, '[data-src], .tile, .dk, .pill, .tab, #volTrack, [data-np], [data-tp], #stageTab');
    if (el && el.id === 'volTrack') return volStart(e);
    var inStage = !!closest(e.target, '#stage');
    var inNp = !!closest(e.target, '#np');
    if (inNp) npWake();
    if (!el && !inStage && !inNp) return;

    var pt = pointFrom(e);
    press = { el: el, x: pt.x, y: pt.y, t: Date.now(), moved: false, drag: false, swipe: false, canSwipe: inStage, inNp: inNp, base: inStage ? freezeTrack() : 0, timer: null };
    if (el) el.className += ' down';
    if (editing && el && el.getAttribute('data-id')) {
      press.timer = setTimeout(function () { beginDrag(); }, LONG_PRESS);
    } else if (!editing && el && el.getAttribute('data-id')) {
      var tile = tileById(el.getAttribute('data-id'));
      if (tile && isDangerous(tile)) {
        setClass(el, 'arming', true);
        press.timer = setTimeout(function () { if (!press || press.el !== el) return; press.done = true; setClass(el, 'arming', false); runTile(tile.id, el); }, 900);
      } else {
        press.timer = setTimeout(function () { if (!press || press.el !== el || press.moved) return; press.done = true; unpress(el); toggleEdit(); toast('已进入编辑模式：点按磁贴修改，长按拖动排序'); }, 600);
      }
    }
  }

  function onMove(e) {
    if (volDragging) return volMove(e);
    if (!press) return;
    var pt = pointFrom(e);
    var dx = pt.x - press.x, dy = pt.y - press.y;
    if (press.drag) {
      e.preventDefault();
      dragMove(pt, dx, dy);
      return;
    }
    if (press.swipe) {
      e.preventDefault();
      sample(press, pt.x);
      swipeMove(dx + press.base);
      return;
    }
    if (!press.moved && (dx * dx + dy * dy) > 100) {
      press.moved = true;
      clearTimeout(press.timer);
      if (press.el) { unpress(press.el); setClass(press.el, 'arming', false); }
      // 横向为主的滑动 → 翻页；纵向 → 交给原生滚动
      if (press.canSwipe && config && config.pages.length > 1 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        press.swipe = true;
        e.preventDefault();
        sample(press, pt.x);
        swipeMove(dx + press.base);
      }
    }
  }

  function onEnd(e) {
    if (volDragging) return volEnd(e);
    if (!press) return;
    var p = press;
    press = null;
    clearTimeout(p.timer);
    if (p.el) { unpress(p.el); setClass(p.el, 'arming', false); }
    if (p.done) return; // 长按已经触发了动作
    if (p.drag) { endDrag(p); return; }
    if (p.swipe) { var ex = pointFrom(e).x; sample(p, ex); swipeEnd(ex - p.x + p.base, releaseVelocity(p)); return; }
    // 歌词页下滑关闭；底栏迷你播放器上滑打开
    var ep = pointFrom(e), mdx = ep.x - p.x, mdy = ep.y - p.y;
    if (p.inNp && mdy > 90 && Math.abs(mdx) < mdy) { npHide(true); return; }
    if (p.el && p.el.id === 'mini' && mdy < -30 && Math.abs(mdx) < -mdy) { if (np.state && np.state.active) npShow(true); return; }
    if (p.base) positionTrack(true); // 点在了正在滑动的页面上：让它继续滑到位
    if (!p.moved && !p.el && p.canSwipe && tp.visible && tp.size === 'split') return tpSetSize('min'); // 点磁贴区空白 = 收起控件
    if (p.moved || !p.el) return;
    if (e.type === 'touchend') e.preventDefault(); // 阻止随后的模拟 click
    tap(p.el);
  }

  // 记录最近的触点位置，用松手前约 100ms 内的位移计算速度（而不是整个手势的平均速度）
  function sample(p, x) {
    var now = Date.now();
    p.samples = p.samples || [];
    p.samples.push({ x: x, t: now });
    while (p.samples.length > 2 && now - p.samples[0].t > 100) p.samples.shift();
  }

  function releaseVelocity(p) {
    var s = p.samples || [];
    if (s.length < 2) return 0;
    var a = s[0], b = s[s.length - 1];
    return (b.x - a.x) / Math.max(b.t - a.t, 16); // px/ms，带方向
  }

  function unpress(el) { el.className = el.className.replace(/ down/g, ''); }

  function tap(el) {
    var id = el.getAttribute('data-id');
    if (id) {
      if (editing) return openEditor(id);
      var tile = tileById(id);
      if (tile && isDangerous(tile)) return toast('按住约 1 秒执行「' + (tile.label || '锁屏') + '」，防止误触');
      // 文件夹磁贴：在 iPad 上分栏浏览（设置里可改回直接在 Mac 上打开）
      if (tile && tile.type === 'folder' && !tile.reveal && config.settings.folderBrowser !== false) return fbOpen(tile.target, tile.label);
      return runTile(id, el);
    }
    if (el.getAttribute('data-add')) return openEditor(null);
    if (el.getAttribute('data-page') !== null) return goPage(parseInt(el.getAttribute('data-page'), 10));
    if (el.getAttribute('data-src')) return srcTap(el);
    if (el.getAttribute('data-sys')) return runSystem(el.getAttribute('data-sys'));
    var npAct = el.getAttribute('data-np');
    if (npAct === 'open' && srcVideo()) { var sv = srcVideo(); el = null; return api('POST', '/api/openapp', { bundle: sv.bundle }).then(function () { ctl.pin = sv.bundle; tpOpen('screen', 'full', 'watch'); }, function (e) { toast(e.message, true); }); }
    if (npAct === 'open') return np.state && np.state.active ? npShow(true) : openMediaApp();
    if (npAct === 'layout') {
      np.layout = np.layout === 'focus' ? 'split' : 'focus';
      store('deck-np-layout', np.layout);
      npApplyLayout();
      np.active = -1;
      return setTimeout(function () { npTick(true); }, 30);
    }
    if (el.getAttribute('data-tp') === 'open') { clearTimeout(stageTimer); stageIntent++; ctl.pin = ''; ctl.browserView = 'auto'; return tpOpen('ctrl', 'full'); } // 遥控入口：跟随 Mac 前台
    if (el.id === 'stageTab') return tpSetSize('split');
    if (npAct === 'close') return npHide(true);
    if (el.id === 'editBtn') return toggleEdit();
    var act = el.getAttribute('data-act');
    if (act) editAction(act);
  }

  document.addEventListener('touchstart', onStart, false);
  document.addEventListener('touchmove', onMove, { passive: false });
  document.addEventListener('touchend', onEnd, false);
  document.addEventListener('touchcancel', function () {
    if (press) {
      clearTimeout(press.timer);
      if (press.el) unpress(press.el);
      if (press.drag) endDrag(press, true);
      if (press.swipe || press.base) positionTrack(true);
      press = null;
    }
    if (volDragging) volEnd({});
  }, false);
  document.addEventListener('mousedown', onStart, false);
  document.addEventListener('mousemove', function (e) { if (press || volDragging) onMove(e); }, false);
  document.addEventListener('mouseup', function (e) { if (Date.now() - lastTouch > 800) onEnd(e); }, false);

  // ---------- 拖动排序 ----------

  var dropTarget = null;

  function beginDrag() {
    if (!press) return;
    press.drag = true;
    unpress(press.el);
    press.el.className += ' dragging';
    press.el.style.pointerEvents = 'none';
  }

  function dragMove(pt, dx, dy) {
    press.el.style.webkitTransform = press.el.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(1.04)';
    var under = document.elementFromPoint(pt.x, pt.y);
    var t = under ? closest(under, '.tile[data-id]') : null;
    if (t === press.el) t = null;
    if (t !== dropTarget) {
      if (dropTarget) dropTarget.className = dropTarget.className.replace(/ drop-target/g, '');
      if (t) t.className += ' drop-target';
      dropTarget = t;
    }
    // 靠近边缘时自动滚动
    var sec = $('track').children[pageIndex];
    var r = $('stage').getBoundingClientRect();
    if (pt.y > r.bottom - 50) sec.scrollTop += 12;
    else if (pt.y < r.top + 50) sec.scrollTop -= 12;
  }

  function endDrag(p, cancelled) {
    var target = dropTarget;
    dropTarget = null;
    if (!cancelled && target) {
      var tiles = page().tiles;
      var from = indexOfTile(p.el.getAttribute('data-id'));
      var to = indexOfTile(target.getAttribute('data-id'));
      if (from > -1 && to > -1) {
        var moved = tiles.splice(from, 1)[0];
        tiles.splice(to, 0, moved);
        persist();
      }
    }
    renderGrid();
  }

  function indexOfTile(id) {
    var tiles = page().tiles;
    for (var i = 0; i < tiles.length; i++) if (tiles[i].id === id) return i;
    return -1;
  }

  // ---------- 音量条 ----------

  var volDragging = false, volSendTimer = null, volLastSent = 0;

  // 像 iOS 控制中心一样：从当前值开始相对拖动；只是轻点或擦过不会改变音量
  var volStartX = 0, volStartV = 0, volMoved = false;
  function volSet(e) {
    var r = $('volTrack').getBoundingClientRect();
    var dx = pointFrom(e).x - volStartX;
    if (!volMoved && Math.abs(dx) < 8) return;
    volMoved = true;
    var v = Math.round(Math.max(0, Math.min(100, volStartV + dx / r.width * 100)));
    showVolume(v, false);
    setClass($('volTrack'), 'active', true);
    var now = Date.now();
    clearTimeout(volSendTimer);
    if (now - volLastSent > 150) { volLastSent = now; sendVolume(v); }
    else volSendTimer = setTimeout(function () { volLastSent = Date.now(); sendVolume(v); }, 150);
  }
  function sendVolume(v) {
    api('POST', '/api/volume', { volume: v }).catch(function (e) { toast(e.message, true); });
  }
  function volStart(e) { volDragging = true; volMoved = false; volStartX = pointFrom(e).x; volStartV = volume; e.preventDefault(); }
  function volMove(e) { e.preventDefault(); volSet(e); }
  function volEnd() { volDragging = false; setClass($('volTrack'), 'active', false); }

  // ---------- 编辑模式 ----------

  function toggleEdit() {
    editing = !editing;
    if (editing) npHide(true);
    $('editBtn').textContent = editing ? '完成' : '编辑';
    render();
  }

  function editAction(act) {
    var p = page();
    switch (act) {
      case 'add-tile': return openEditor(null);
      case 'add-front': return addFront();
      case 'add-page': {
        var name = window.prompt('新页面名称', '新页面');
        if (!name) return;
        config.pages.push({ id: uid(), name: name, tiles: [] });
        pageIndex = config.pages.length - 1;
        store('deck-page', String(pageIndex));
        persist(); render();
        return;
      }
      case 'rename-page': {
        var n = window.prompt('页面名称', p.name);
        if (!n) return;
        p.name = n; persist(); renderTabs();
        return;
      }
      case 'move-page': {
        if (pageIndex === 0) return;
        config.pages.splice(pageIndex, 1);
        pageIndex--;
        config.pages.splice(pageIndex, 0, p);
        store('deck-page', String(pageIndex));
        persist(); renderTabs();
        return;
      }
      case 'del-page': {
        if (config.pages.length <= 1) return toast('至少保留一个页面', true);
        if (!window.confirm('删除页面「' + p.name + '」及其中 ' + p.tiles.length + ' 个磁贴？')) return;
        config.pages.splice(pageIndex, 1);
        pageIndex = Math.max(0, pageIndex - 1);
        store('deck-page', String(pageIndex));
        persist(); render();
        return;
      }
      case 'settings': return openSettings();
      case 'sheet-cancel': return closeSheet();
      case 'sheet-save': return sheetSave && sheetSave();
      case 'picker-close': return closePicker();
    }
  }

  // 一键添加 Mac 当前最前面的应用；如果是浏览器，添加当前标签页的网址
  function addFront() {
    api('GET', '/api/frontinfo').then(function (r) {
      if (!r.front) return toast('没有读到 Mac 当前的应用', true);
      var t;
      if (r.tab && /^https?:/.test(r.tab.url)) {
        t = { id: uid(), type: 'url', label: (r.tab.title || hostOf(r.tab.url)).slice(0, 24), target: r.tab.url, color: 'auto', size: 's' };
      } else {
        t = { id: uid(), type: 'app', label: r.front.name, target: r.path || r.front.bundle, color: 'auto', size: 's' };
      }
      page().tiles.push(t);
      persist();
      renderGrid();
      setTimeout(refreshTints, 800);
      toast('已添加「' + t.label + '」，点按它可以修改');
    }, function (e) { toast(e.message, true); });
  }

  // ---------- 磁贴编辑器 ----------

  var draft = null, draftPageIndex = 0, editingId = null, sheetSave = null, sheetMode = 'tile';

  function openEditor(id) {
    sheetMode = 'tile';
    $('sheetBody').onclick = null;
    editingId = id;
    draftPageIndex = pageIndex;
    if (id) {
      draft = clone(page().tiles[indexOfTile(id)]);
    } else {
      draft = { id: uid(), type: 'app', label: '', sub: '', target: '', color: 'auto', size: 's' };
    }
    $('sheetTitle').textContent = id ? '编辑磁贴' : '新建磁贴';
    sheetSave = saveDraft;
    renderEditor();
    $('sheet').className = 'sheet-wrap open';
  }

  function closeSheet() {
    $('sheet').className = 'sheet-wrap';
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }

  function seg(name, items, current) {
    var h = '<div class="seg" data-seg="' + name + '">';
    items.forEach(function (it) {
      h += '<button type="button" data-v="' + esc(it.k) + '" class="' + (it.k === current ? 'on' : '') + '">' + esc(it.n) + '</button>';
    });
    return h + '</div>';
  }

  function field(name, label, value, ph, extra) {
    return '<div class="form-row"><label>' + label + '</label>' +
      '<input class="field" data-f="' + name + '" value="' + esc(value) + '" placeholder="' + esc(ph || '') + '" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">' +
      (extra || '') + '</div>';
  }

  function targetEditor() {
    var t = draft;
    switch (t.type) {
      case 'app':
        return '<div class="form-row"><label>应用</label><div class="field-row">' +
          '<input class="field" data-f="target" value="' + esc(t.target) + '" placeholder="应用名称、路径或 Bundle ID" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">' +
          '<button class="pill" type="button" data-pick="apps">从 Mac 选择</button></div>' +
          '<p class="hint">例如 “Google Chrome”、“/Applications/微信.app” 或 “com.apple.Notes”。</p></div>';
      case 'url':
        return field('target', '网址', t.target, 'https://example.com', '<p class="hint">也支持 localhost、内网地址或 obsidian:// 等 URL Scheme。</p>') +
          '<div class="form-row"><label>打开方式</label>' + seg('browser', BROWSERS, t.browser || '') + '</div>';
      case 'folder':
        var chips = '<div class="chips">';
        FOLDER_CHIPS.forEach(function (c) { chips += '<button type="button" data-chip="' + esc(c[1]) + '" data-chip-label="' + esc(c[0]) + '">' + esc(c[0]) + '</button>'; });
        return field('target', '文件夹路径', t.target, '~/Documents/项目', chips + '</div>');
      case 'file':
        return field('target', '文件路径', t.target, '~/Documents/报告.pdf') +
          '<div class="form-row"><label>打开方式</label>' + seg('reveal', [{ k: '', n: '直接打开' }, { k: '1', n: '在 Finder 中显示' }], t.reveal ? '1' : '') + '</div>';
      case 'shortcut':
        return '<div class="form-row"><label>快捷指令名称</label><div class="field-row">' +
          '<input class="field" data-f="target" value="' + esc(t.target) + '" placeholder="与「快捷指令」App 中名称一致" autocomplete="off" autocorrect="off" autocapitalize="off">' +
          '<button class="pill" type="button" data-pick="shortcuts">从 Mac 选择</button></div>' +
          '<p class="hint">可以把复杂流程（开会模式、打开一组应用等）做成快捷指令再放到这里。</p></div>';
      case 'system':
        return '<div class="form-row"><label>动作</label>' + seg('target', SYSTEM, t.target) + '</div>';
      case 'keys':
        return field('target', '组合键', t.target, 'cmd+shift+4',
          '<p class="hint">用 + 连接：cmd / shift / opt / ctrl + 按键。支持 space、return、tab、esc、delete、up/down/left/right、f1–f12。<br>需在 Mac「隐私与安全性 → 辅助功能」中允许终端或 node。</p>');
      case 'script':
        return '<div class="form-row"><label>语言</label>' + seg('lang', [{ k: 'shell', n: 'Shell (zsh)' }, { k: 'applescript', n: 'AppleScript' }], t.lang || 'shell') + '</div>' +
          '<div class="form-row"><label>脚本</label><textarea class="field" data-f="script" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="open -a Safari &amp;&amp; say 好的">' + esc(t.script || '') + '</textarea></div>';
    }
    return '';
  }

  function renderPreview() {
    var box = $('editorPreview');
    if (box) box.innerHTML = tileHtml(draft);
  }

  function renderEditor() {
    var t = draft;
    var pagesOpts = '';
    config.pages.forEach(function (p, i) {
      pagesOpts += '<option value="' + i + '"' + (i === draftPageIndex ? ' selected' : '') + '>' + esc(p.name) + '</option>';
    });
    var sw = '<div class="swatches" data-seg="color">';
    COLORS.forEach(function (c) {
      var on = c === (t.color || 'auto') ? ' on' : '';
      if (c === 'auto') { sw += '<button type="button" data-v="auto" class="sw-auto' + on + '">取自图标</button>'; return; }
      var hex = PALETTE[c] || '#3b4048';
      sw += '<button type="button" data-v="' + c + '" class="' + on + '" style="background:' + hex + '"></button>';
    });
    sw += '</div>';

    var h = '<div class="preview-row" id="editorPreview"></div>' +
      '<div class="form-row"><label>类型</label>' + seg('type', TYPES, t.type) + '</div>' +
      targetEditor() +
      '<div class="form-2">' + field('label', '名称', t.label, '显示在磁贴上的名字') + field('sub', '副标题', t.sub, '留空自动生成') + '</div>' +
      (/^(app|url)$/.test(t.type) ? '<div class="form-row"><label>点开后</label>' +
        seg('stage', [{ k: '', n: '自动显示对应控件' }, { k: 'none', n: '只打开，不显示控件' }], t.stage || '') +
        '<p class="hint">音乐、浏览器、AI 应用、演示等会以半屏控件打开；视频网站进入「观看」，X / 微博等进入「阅读」，其它网页进入「浏览」。</p></div>' : '') +
      '<div class="form-row"><label>颜色</label>' + sw + '</div>' +
      '<div class="form-row"><label>尺寸</label>' + seg('size', SIZES, t.size || 's') + '</div>' +
      '<div class="form-2">' +
      field('icon', '自定义图标', t.icon, '留空用应用图标；可填 emoji 或文字') +
      '<div class="form-row"><label>所在页面</label><select class="field" data-f="page">' + pagesOpts + '</select></div>' +
      '</div>';
    if (editingId) {
      h += '<div class="sheet-actions">' +
        '<button class="pill" type="button" data-ed="test">▶ 试运行</button>' +
        '<button class="pill" type="button" data-ed="dup">复制一份</button>' +
        '<button class="pill" type="button" data-ed="first">移到最前</button>' +
        '<button class="pill danger" type="button" data-ed="delete">删除磁贴</button></div>';
    }
    $('sheetBody').innerHTML = h;
    renderPreview();
  }

  // 编辑器内的点击与输入
  $('sheetBody').addEventListener('click', function (e) {
    if (sheetMode !== 'tile') return;
    var b = closest(e.target, 'button');
    if (!b) return;
    var segEl = closest(b, '[data-seg]');
    if (segEl) {
      var name = segEl.getAttribute('data-seg'), v = b.getAttribute('data-v');
      if (name === 'type') {
        if (draft.type === v) return;
        draft.type = v;
        draft.target = v === 'system' ? 'playpause' : '';
        if (v === 'system' && !draft.label) draft.label = SYSTEM_NAME.playpause;
        return renderEditor();
      }
      if (name === 'reveal') draft.reveal = !!v;
      else if (name === 'target' && draft.type === 'system') {
        if (!draft.label || SYSTEM_NAME[draft.target] === draft.label) draft.label = SYSTEM_NAME[v];
        draft.target = v;
        updateLabelInput();
      } else draft[name] = v;
      var all = segEl.querySelectorAll('button');
      for (var i = 0; i < all.length; i++) all[i].className = all[i].className.replace(/\bon\b/g, '').trim() + (all[i] === b ? ' on' : '');
      return renderPreview();
    }
    if (b.getAttribute('data-chip')) {
      draft.target = b.getAttribute('data-chip');
      if (!draft.label) { draft.label = b.getAttribute('data-chip-label'); updateLabelInput(); }
      var inp = $('sheetBody').querySelector('[data-f="target"]');
      if (inp) inp.value = draft.target;
      return renderPreview();
    }
    if (b.getAttribute('data-pick')) return openPicker(b.getAttribute('data-pick'));
    var ed = b.getAttribute('data-ed');
    if (ed === 'test') {
      api('POST', '/api/run', { tile: draft }).then(function () { toast('已执行'); }, function (err) { toast(err.message, true); });
    } else if (ed === 'dup') {
      var copy = clone(draft); copy.id = uid(); copy.label = (copy.label || '') + ' 副本';
      config.pages[draftPageIndex].tiles.splice(indexOfTile(editingId) + 1, 0, copy);
      persist(); closeSheet(); renderGrid();
    } else if (ed === 'first') {
      var tiles = page().tiles, idx = indexOfTile(editingId);
      tiles.unshift(tiles.splice(idx, 1)[0]);
      persist(); closeSheet(); renderGrid();
    } else if (ed === 'delete') {
      if (!window.confirm('删除磁贴「' + (draft.label || '未命名') + '」？')) return;
      page().tiles.splice(indexOfTile(editingId), 1);
      persist(); closeSheet(); renderGrid();
    }
  }, false);

  function updateLabelInput() {
    var inp = $('sheetBody').querySelector('[data-f="label"]');
    if (inp) inp.value = draft.label || '';
  }

  function onField(e) {
    if (sheetMode !== 'tile') return;
    var f = e.target.getAttribute && e.target.getAttribute('data-f');
    if (!f) return;
    if (f === 'page') { draftPageIndex = parseInt(e.target.value, 10); return; }
    if (f === 'target') { delete draft._tint; delete draft._plate; }
    draft[f] = e.target.value;
    renderPreview();
  }
  $('sheetBody').addEventListener('input', onField, false);
  $('sheetBody').addEventListener('change', onField, false);
  // 网址/路径输入完成后，若名称为空则自动填写
  $('sheetBody').addEventListener('blur', function (e) {
    if (sheetMode !== 'tile' || !e.target.getAttribute || e.target.getAttribute('data-f') !== 'target' || draft.label) return;
    var v = draft.target || '';
    if (draft.type === 'url') { var h = hostOf(v); draft.label = h.split('.')[0] ? h.split('.')[0].charAt(0).toUpperCase() + h.split('.')[0].slice(1) : ''; }
    else if (draft.type === 'folder' || draft.type === 'file') draft.label = v.replace(/\/+$/, '').split('/').pop();
    else if (draft.type === 'app' || draft.type === 'shortcut') draft.label = v.replace(/\.app$/, '').split('/').pop();
    updateLabelInput();
    renderPreview();
  }, true);

  function saveDraft() {
    var t = draft;
    if (t.type !== 'script' && !String(t.target || '').trim()) return toast('请先填写' + (t.type === 'url' ? '网址' : '目标'), true);
    if (t.type === 'script' && !String(t.script || '').trim()) return toast('脚本不能为空', true);
    if (!t.label) t.label = TYPE_NAME[t.type];
    delete t._display;
    delete t.thenTp;
    ['sub', 'icon', 'browser', 'stage'].forEach(function (k) { if (!t[k]) delete t[k]; });
    if (editingId) {
      var idx = indexOfTile(editingId);
      if (draftPageIndex === pageIndex) page().tiles[idx] = t;
      else { page().tiles.splice(idx, 1); config.pages[draftPageIndex].tiles.push(t); }
    } else {
      config.pages[draftPageIndex].tiles.push(t);
    }
    persist();
    closeSheet();
    renderGrid();
    setTimeout(refreshTints, 700);
    toast(draftPageIndex === pageIndex ? '已保存' : '已保存到「' + config.pages[draftPageIndex].name + '」');
  }

  // ---------- 选择器 ----------

  var pickerItems = [], pickerKind = '';

  function openPicker(kind) {
    pickerKind = kind;
    $('pickerTitle').textContent = kind === 'apps' ? '选择应用' : '选择快捷指令';
    $('pickerSearch').value = '';
    $('pickerList').innerHTML = '<p class="hint">加载中…</p>';
    $('picker').className = 'sheet-wrap open';
    api('GET', kind === 'apps' ? '/api/apps' : '/api/shortcuts').then(function (list) {
      pickerItems = list;
      renderPicker();
    }, function (e) { $('pickerList').innerHTML = '<p class="hint">' + esc(e.message) + '</p>'; });
  }

  function renderPicker() {
    var q = $('pickerSearch').value.toLowerCase();
    var h = '', n = 0;
    for (var i = 0; i < pickerItems.length && n < 300; i++) {
      var it = pickerItems[i];
      var name = typeof it === 'string' ? it : it.name;
      var display = (typeof it !== 'string' && it.display) || name;
      if (q && (name + ' ' + display).toLowerCase().indexOf(q) < 0) continue;
      n++;
      var sub = display !== name ? name : '';
      h += '<button type="button" class="pick-item" data-name="' + esc(name) + '" data-display="' + esc(display) + '">' + esc(display) + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</button>';
    }
    $('pickerList').innerHTML = h || '<p class="hint">没有匹配项</p>';
  }

  function closePicker() { $('picker').className = 'sheet-wrap'; }

  $('pickerSearch').addEventListener('input', renderPicker, false);
  $('pickerList').addEventListener('click', function (e) {
    var b = closest(e.target, '.pick-item');
    if (!b) return;
    var name = b.getAttribute('data-name');
    var prevAuto = !draft.label || draft.label === draft.target || draft.label === draft._display;
    draft.target = name;
    delete draft._tint; delete draft._plate;
    draft._display = b.getAttribute('data-display');
    if (prevAuto) draft.label = draft._display.replace(/^Google /, '').replace(/^Microsoft /, '');
    closePicker();
    renderEditor();
  }, false);

  // 编辑面板 / 选择器的按钮（头部）
  function sheetHeadClick(e) {
    var b = closest(e.target, '[data-act]');
    if (b) editAction(b.getAttribute('data-act'));
  }
  $('sheet').querySelector('.sheet-head').addEventListener('click', sheetHeadClick, false);
  // 点编辑面板外面的暗色区域 = 取消
  $('sheet').addEventListener('click', function (e) { if (e.target === $('sheet')) closeSheet(); }, false);
  $('picker').addEventListener('click', function (e) { if (e.target === $('picker')) closePicker(); }, false);
  $('picker').querySelector('.sheet-head').addEventListener('click', sheetHeadClick, false);

  // ---------- 设置 ----------

  function sidecarScan() {
    var box = $('sidecarBox');
    box.innerHTML = '<p class="hint">正在查找…</p>';
    api('GET', '/api/sidecar').then(function (r) {
      if (!r.available) { box.innerHTML = '<p class="hint">这台 Mac 上不可用随航。</p>'; return; }
      if (!r.devices.length) {
        box.innerHTML = '<p class="hint">没有找到可连接的 iPad：确认 iPad 已解锁、与 Mac 同一 Apple 账户，并开启蓝牙 / Wi-Fi / 接力。</p><button class="pill" type="button" id="sidecarScan">重新查找</button>';
        return;
      }
      var h = '';
      r.devices.forEach(function (d) {
        h += '<button class="pill" type="button" style="margin:0 8px 8px 0" data-sidecar="' + esc(d.name) + '" data-on="' + (d.connected ? '1' : '') + '">' +
          (d.connected ? '断开 ' : '连接 ') + esc(d.name) + '</button>';
      });
      box.innerHTML = h;
    }, function (e) { box.innerHTML = '<p class="hint">' + esc(e.message) + '</p>'; });
  }

  function sidecarConnect(name, disconnect) {
    toast((disconnect ? '正在断开 ' : '正在连接 ') + name + '…');
    api('POST', '/api/sidecar/connect', { name: name, disconnect: disconnect }).then(function () {
      toast(disconnect ? '已断开随航' : '已连接随航');
      sidecarScan();
    }, function (e) { toast(e.message, true); });
  }

  function openSettings() {
    var s = config.settings;
    sheetMode = 'settings';
    $('sheetTitle').textContent = '设置';
    var ON = [{ k: '1', n: '开启' }, { k: '', n: '关闭' }];
    $('sheetBody').innerHTML =
      (macInfo.accessibility === false ?
        '<div class="form-row"><label>辅助功能权限</label><p class="hint" style="color:#ffb35c">未授权：媒体键与快捷键磁贴暂不可用。请在 Mac「系统设置 → 隐私与安全性 → 辅助功能」中允许运行 iPadDuo 的程序（终端或 node），然后重启服务。其它功能不受影响。</p></div>' : '') +
      '<div class="form-row"><label>这台设备</label><p class="hint" style="font-size:14px;color:#cfd5dc">' + esc(DEVICE.name) +
        (DEVICE.os ? ' · ' + (DEVICE.os <= 12 ? 'iOS ' : 'iPadOS ') + DEVICE.os : '') + ' · 屏幕 ' + esc(DEVICE.key) + '</p>' +
        seg('tier', [{ k: '', n: '自动（' + ({ lite: '省电', balanced: '均衡', full: '增强' }[DEVICE.autoTier]) + '）' }, { k: 'lite', n: '省电' }, { k: 'balanced', n: '均衡' }, { k: 'full', n: '增强' }], store('deck-tier') || '') +
        '<p class="hint">档位决定动效与画面预算：省电档关闭持续动画、画面 1024px；均衡档 1280px / 30fps；增强档最高 1920px / 60fps（硬件视频）。画面会按解码、网络和显示区域自动调整。档位修改后重新加载生效。</p></div>' +
      '<div class="form-row"><label>外观（这台设备）</label>' + seg('theme', [{ k: 'dark', n: '深色' }, { k: 'light', n: '浅色' }, { k: 'auto', n: '跟随系统' }], store('deck-theme') || 'dark') + '</div>' +
      '<div class="form-row"><label>副屏画面传输（这台设备）</label>' + seg('rtc', [{ k: '', n: '自动（硬件视频优先）' }, { k: 'off', n: '兼容模式（JPEG）' }], store('deck-rtc') || '') +
        '<p class="hint">' + (RTC_OK ? '这台设备支持 WebRTC：Mac 用硬件编码 H.264 推流，iPad 硬件解码，延迟与流畅度明显更好；网络异常时自动退回兼容模式。' : '这台设备的系统（iOS 10 及更早）不支持 WebRTC，使用 JPEG 兼容模式。升级到 iOS 12 可获得更流畅的硬件视频。') + '</p></div>' +
      '<div class="form-row"><label>点开文件夹磁贴</label>' + seg('folderBrowser', [{ k: '1', n: '在 iPad 上分栏浏览' }, { k: '', n: '在 Mac 上打开' }], s.folderBrowser === false ? '' : '1') + '</div>' +
      '<div class="form-row"><label>触控板灵敏度（这台设备）</label>' + seg('pointerSpeed', [{ k: 'slow', n: '精细' }, { k: 'normal', n: '标准' }, { k: 'fast', n: '快速' }], store('deck-pointer-speed') || 'normal') + '</div>' +
      '<div class="form-row"><label>触控板加速</label>' + seg('pointerAccel', [{ k: 'on', n: '随手速加速' }, { k: 'off', n: '固定速度' }], store('deck-pointer-accel') || 'on') + '</div>' +
      (DEVICE.sidecar ? '<div class="form-row"><label>随航（把这台 iPad 变成 Mac 的扩展屏）</label>' +
        '<div id="sidecarBox"><button class="pill" type="button" id="sidecarScan">查找可连接的 iPad</button></div>' +
        '<p class="hint">使用 macOS 自带的随航：需要与 Mac 登录同一 Apple 账户，并打开蓝牙、Wi-Fi 和「接力」。连接后 iPad 会变成扩展屏，iPadDuo 页面暂时被替换；在 iPad 随航侧边栏点「断开」即可回来。</p></div>' : '') +
      '<div class="form-row"><label>面板「按住说话」的语音键</label>' +
        seg('voiceKey', [{ k: 'fn', n: 'fn（豆包 / 微信输入法默认）' }, { k: 'ropt', n: '右 ⌥' }, { k: 'rcmd', n: '右 ⌘' }, { k: 'rctrl', n: '右 ⌃' }], s.voiceKey || 'fn') +
        '<p class="hint">按住面板上的「按住说话」时，Mac 上会一直按着这个键：先把豆包输入法或微信输入法切成当前输入法，就能用它们的语音输入。也可以直接用 iPad 键盘上的麦克风听写。</p></div>' +
      '<div class="form-row"><label>点开磁贴后</label>' + seg('autoStage', [{ k: '1', n: '自动显示对应控件' }, { k: '', n: '只打开应用 / 网页' }], s.autoStage === false ? '' : '1') + '</div>' +
      '<div class="form-row"><label>屏幕常亮</label>' + seg('keepAwake', ON, s.keepAwake === false ? '' : '1') +
        '<p class="hint">通过循环播放一段静音小视频阻止 iPad 自动锁屏，建议同时插着电源。</p></div>' +
      '<div class="form-row"><label>播放音乐时自动显示歌词</label>' + seg('autoLyrics', ON, s.autoLyrics === false ? '' : '1') + '</div>' +
      '<div class="form-row"><label>播放信息来源</label>' +
        seg('nowPlaying', [{ k: 'auto', n: '自动（QQ 音乐 / Apple Music）' }, { k: 'music', n: '仅 Apple Music' }, { k: 'system', n: '系统级（其它播放器）' }, { k: 'off', n: '关闭' }], s.nowPlaying || 'auto') +
        '<p class="hint">「自动」用已授予的辅助功能权限读取 QQ 音乐播放栏，或用 AppleScript 读取 Apple Music。「系统级」通过系统自带的 perl 读取 macOS 的正在播放信息，这是绕开 macOS 15.4 起的读取限制的做法，请自行决定是否开启。</p></div>' +
      '<div class="form-row"><label>联网查询歌词</label>' + seg('lyricsOnline', ON, s.lyricsOnline === false ? '' : '1') +
        '<p class="hint">会把当前歌名和歌手发送给 QQ 音乐、网易云音乐或 LRCLIB 以查找歌词与封面。</p></div>' +
      '<div class="form-row"><label>底部控制栏</label>' + seg('showDock', [{ k: '1', n: '显示' }, { k: '', n: '隐藏' }], s.showDock === false ? '' : '1') + '</div>' +
      '<div class="form-row"><label>每行磁贴数</label>' + seg('columns', [{ k: '0', n: '自动' }, { k: '4', n: '4' }, { k: '5', n: '5' }, { k: '6', n: '6' }, { k: '7', n: '7' }, { k: '8', n: '8' }], String(s.columns || 0)) + '</div>' +
      field('pin', '访问 PIN（可选）', s.pin || '', '留空表示局域网内无需验证',
        '<p class="hint">设置后，新设备首次访问需要输入 PIN。服务本身只接受局域网地址的请求，并拒绝跨站请求。</p>') +
      '<div class="sheet-actions"><button class="pill" type="button" id="reloadBtn">重新加载页面</button></div>';
    var temp = {
      voiceKey: s.voiceKey || 'fn', autoStage: s.autoStage !== false, folderBrowser: s.folderBrowser !== false,
      showDock: s.showDock !== false, columns: s.columns || 0, keepAwake: s.keepAwake !== false,
      autoLyrics: s.autoLyrics !== false, lyricsOnline: s.lyricsOnline !== false, nowPlaying: s.nowPlaying || 'auto'
    };
    $('sheetBody').onclick = function (e) {
      var b = closest(e.target, 'button');
      if (!b) return;
      if (b.id === 'reloadBtn') return location.reload();
      if (b.id === 'sidecarScan') return sidecarScan();
      if (b.getAttribute('data-sidecar')) return sidecarConnect(b.getAttribute('data-sidecar'), b.getAttribute('data-on') === '1');
      var sg = closest(b, '[data-seg]');
      if (!sg) return;
      var name = sg.getAttribute('data-seg'), v = b.getAttribute('data-v');
      if (name === 'columns') temp.columns = parseInt(v, 10);
      else if (name === 'tier') { store('deck-tier', v); toast('重新加载页面后生效'); }
      else if (name === 'pointerSpeed') store('deck-pointer-speed', v);
      else if (name === 'theme') { store('deck-theme', v); themeApply(); }
      else if (name === 'rtc') { store('deck-rtc', v); toast(v === 'off' ? '下次进入副屏时使用兼容模式' : '下次进入副屏时优先使用硬件视频'); }
      else if (name === 'pointerAccel') store('deck-pointer-accel', v);
      else if (name === 'nowPlaying' || name === 'voiceKey') temp[name] = v;
      else temp[name] = !!v;
      var all = sg.querySelectorAll('button');
      for (var i = 0; i < all.length; i++) all[i].className = all[i] === b ? 'on' : '';
    };
    sheetSave = function () {
      var pin = $('sheetBody').querySelector('[data-f="pin"]').value.trim();
      Object.keys(temp).forEach(function (k) { config.settings[k] = temp[k]; });
      config.settings.pin = pin;
      if (pin) store('deck-pin', pin);
      $('sheetBody').onclick = null;
      persist(); closeSheet(); render();
      keepAwakeKick();
      liveSoon(300);
    };
    $('sheet').className = 'sheet-wrap open';
  }

  // ---------- 启动 ----------

  function boot() {
    document.body.className = (window.navigator.standalone ? 'standalone ' : '') + 'tier-' + DEVICE.tier;
    tick();
    setInterval(tick, 5000);
    api('GET', '/api/ping').then(function (r) {
      setConn(true);
      macInfo = r;
      $('hostName').textContent = r.host + (r.accessibility === false ? ' · 快捷键需授权' : ' · 已连接');
    }, function () { $('hostName').textContent = '未连接'; });
    api('GET', '/api/config').then(function (c) {
      config = c;
      config.settings = config.settings || {};
      render();
      livePoll();
      setTimeout(srcPoll, 1200);
      if (c._pendingTints) setTimeout(refreshTints, 2500);
    }, function (e) {
      $('track').innerHTML = '<section class="page"><div class="grid"><div class="empty">无法加载配置：' + esc(e.message) + '<br>请确认 Mac 上的 iPadDuo 服务正在运行</div></div></section>';
    });

    var rt;
    var relayout = function () { if (config) layout(); ctlFit(); if (np.visible) npTick(true); if (scr.on) { scrZoom(scr.z.s, scr.z.x, scr.z.y); if (scr.streaming) scr.reprofile = true; } };
    window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(relayout, 120); }, false);
    window.addEventListener('orientationchange', function () { setTimeout(relayout, 300); }, false);
    function suspendRemote() {
      tpCancel(); scrStop(); ctlStop(); clearTimeout(pingTimer); clearTimeout(tp.reconnect);
      clearInterval(np.ticker);
      if (keepVideo && !keepVideo.paused) keepVideo.pause();
      if (wakeLock) { wakeLock.release().catch(function () {}); wakeLock = null; }
    }
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) suspendRemote();
      else {
        liveSoon(50); keepAwakeKick(); setTimeout(srcPoll, 300);
        if (np.visible) { npTick(true); clearInterval(np.ticker); np.ticker = setInterval(npTick, 250); }
        if (tp.visible && tp.size !== 'min') { tpConnect(); tp.lastPong = Date.now(); tpPing(); if (tp.mode === 'screen') scrStart(); if (tp.mode === 'ctrl' || tp.view === 'watch') ctlStart(); }
      }
    }, false);
    window.addEventListener('blur', function () { if (tp.visible) tpCancel(); }, false);
    window.addEventListener('pagehide', function () { suspendRemote(); if (tp.ws) tp.ws.close(); }, false);
    window.addEventListener('pageshow', function (e) { if (e.persisted && !document.hidden && tp.visible) { tpConnect(); if (tp.mode === 'screen') scrStart(); if (tp.mode === 'ctrl' || tp.view === 'watch') ctlStart(); } }, false);
    document.addEventListener('touchstart', perfTouch, { passive: true });
    document.addEventListener('touchmove', perfTouch, { passive: true });
    if (window.matchMedia) {
      var motion = window.matchMedia('(prefers-reduced-motion: reduce)');
      var changed = function (e) { DEVICE.reducedMotion = e.matches; perfApplyUI(); };
      if (motion.addEventListener) motion.addEventListener('change', changed); else if (motion.addListener) motion.addListener(changed);
    }
    perfApplyUI(); themeApply();
  }

  boot();
})();
