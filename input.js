// iPadDuo 输入与 JPEG 推流。会话持有按键状态；输入只能引用该会话收到的帧。
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawn: spawnProcess } = require('child_process');
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const KEY_RE = /^[a-z0-9+⌘⇧⌥⌃\-=\[\];',./`\\ ]{1,40}$/i;
const CLIENT_RE = /^[a-z0-9-]{8,80}$/i;

// 屏幕录制权限被拒（包括 macOS 定期复核时被关掉）时 ScreenCaptureKit 只返回一句本地化的 TCC 错误：统一归为 screen-permission
// 系统的连续采集（ScreenCaptureKit 流）坏掉时（内存吃紧、replayd 异常），反复启动采集流会拖慢单张截图，
// 让兼容画面一卡一卡。1 分钟内中断两次就判定「暂不可用」2 分钟：期间推流请求立即回绝，只用截图。
// 连续两轮冷却都没恢复：多半是 macOS 的采集服务已拒绝本进程的新采集（实测重启 node 即恢复）。
// 由 launchd 托管时主动退出，让 launchd 立即重新拉起；手动 node server.js 运行时只记录日志。
const streamHealth = { fails: [], brokenUntil: 0, trips: 0 };
function noteStreamFailure(now) {
  const t = now || Date.now();
  streamHealth.fails = streamHealth.fails.filter((x) => t - x < 60000).concat(t);
  if (streamHealth.fails.length >= 2) {
    streamHealth.brokenUntil = t + 120000; streamHealth.fails = []; streamHealth.trips++;
    if (streamHealth.trips >= 2 && streamHealth.onStuck) streamHealth.onStuck();
  }
}
function streamBroken(now) { return (now || Date.now()) < streamHealth.brokenUntil; }
function streamRecovered() { streamHealth.fails = []; streamHealth.brokenUntil = 0; streamHealth.trips = 0; }
function onStreamStuck(fn) { streamHealth.onStuck = fn; }

function captureError(err) {
  const e = String(err || 'capture');
  return /TCC|拒绝|declined|denied|not authori[sz]ed|permission/i.test(e) ? 'screen-permission' : e;
}

function createInput(opts) {
  const { helperBin, isHelperReady, cacheDir } = opts;
  const spawn = opts.spawn || spawnProcess;
  const log = opts.log || (() => {});
  const screenDir = path.join(cacheDir, 'screen');
  fs.mkdirSync(screenDir, { recursive: true });
  const sessions = new Map(), buttonOwners = new Map(), keyOwners = new Map();
  const pendingReleases = new Set(), sockets = new Set(), streams = new Map();
  const epoch = crypto.randomBytes(6).toString('hex');
  let sequence = 0, child = null, frontID = 0, inputFailures = 0, retryAt = 0, retryTimer = null;
  const frontWaiters = new Map();
  let capChild = null, capWaiter = null, captureCache = null, inflight = null, fileSeq = 0;
  let rtc = null; // WebRTC（H.264）画面，由 server.js 通过 setRTC 挂上

  function timer(fn, ms) { const t = setTimeout(fn, ms); if (t.unref) t.unref(); return t; }
  function clientId(id) { return typeof id === 'string' && CLIENT_RE.test(id) ? id : 'legacy-http'; }
  function session(id) {
    id = clientId(id);
    let s = sessions.get(id);
    if (!s) { s = { id, buttons: new Set(), keys: new Set(), frames: new Map(), lastFrame: null, lastSeq: 0, at: Date.now(), socket: null }; sessions.set(id, s); }
    s.at = Date.now();
    return s;
  }
  function send(socket, payload, opcode = 1) {
    if (!socket || socket.destroyed || socket.writable === false) return false;
    payload = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
    let h;
    if (payload.length < 126) h = Buffer.from([0x80 | opcode, payload.length]);
    else if (payload.length < 65536) { h = Buffer.alloc(4); h[0] = 0x80 | opcode; h[1] = 126; h.writeUInt16BE(payload.length, 2); }
    else { h = Buffer.alloc(10); h[0] = 0x80 | opcode; h[1] = 127; h.writeUInt32BE(0, 2); h.writeUInt32BE(payload.length, 6); }
    try { return socket.write(Buffer.concat([h, payload])); } catch (e) { socket.destroy(); return false; }
  }
  function message(socket, obj) { return send(socket, JSON.stringify(obj)); }
  function inputError(s, error) { if (s.socket) message(s.socket, { t: 'inputerr', err: error }); }
  function write(c, line) { try { if (c && !c.stdin.destroyed) { c.stdin.write(line + '\n'); return true; } } catch (e) { /* 退出处理负责恢复 */ } return false; }

  function ensureChild() {
    if (child) return child;
    if (!isHelperReady() || Date.now() < retryAt) return null;
    let c;
    try { c = spawn(helperBin, ['serve'], { stdio: ['pipe', 'pipe', 'ignore'] }); } catch (e) { retryAt = Date.now() + 1000; log('  input 启动失败：' + e.message); return null; }
    child = c;
    let buf = '', finished = false;
    const finish = (error) => {
      if (finished) return; finished = true;
      if (child !== c) return;
      child = null;
      inputFailures++;
      retryAt = Date.now() + Math.min(10000, 500 * Math.pow(2, Math.min(5, inputFailures - 1)));
      frontWaiters.forEach((w) => { clearTimeout(w.timer); w.resolve(null); }); frontWaiters.clear();
      sessions.forEach((s) => { release(s, false); inputError(s, 'input-unavailable'); });
      log('  input 退出：' + error);
      clearTimeout(retryTimer);
      if (pendingReleases.size) retryTimer = timer(ensureChild, Math.max(1000, retryAt - Date.now()));
    };
    c.on('error', (e) => finish(e.code || e.message));
    c.on('exit', (code, sig) => finish(sig || 'code ' + code));
    c.stdin.on('error', (e) => { finish(e.code || 'stdin'); c.kill(); });
    c.stdout.on('data', (d) => {
      if (child !== c) return;
      buf += d;
      if (buf.length > 65536) { buf = ''; return; }
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const fields = buf.slice(0, i).split('\t'); buf = buf.slice(i + 1);
        if (fields[0] === 'inputerr') { const s = sessions.get(fields[1]); if (s) { release(s); inputError(s, fields[2] || 'stale-frame'); } continue; }
        let id, bundle, name;
        if (fields[0] === 'front') { id = Number(fields[1]); bundle = fields[2]; name = fields.slice(3).join('\t'); }
        else { id = frontWaiters.keys().next().value; bundle = fields[0]; name = fields.slice(1).join('\t'); } // 兼容旧辅助进程
        const w = frontWaiters.get(id);
        if (w) { frontWaiters.delete(id); clearTimeout(w.timer); inputFailures = 0; w.resolve(bundle ? { bundle, name: name || '' } : null); }
      }
    });
    pendingReleases.forEach((line) => write(c, line)); pendingReleases.clear();
    return c;
  }
  function cmd(line) { const c = ensureChild(); return c ? write(c, line.replace(/[\r\n]/g, ' ')) : false; }
  function release(s, deliver = true) {
    s.buttons.forEach((b) => { if (buttonOwners.get(b) === s.id) { const line = 'up ' + b; if (!deliver || !cmd(line)) pendingReleases.add(line); buttonOwners.delete(b); } });
    s.keys.forEach((k) => { if (keyOwners.get(k) === s.id) { const line = 'keyup ' + k; if (!deliver || !cmd(line)) pendingReleases.add(line); keyOwners.delete(k); } });
    s.buttons.clear(); s.keys.clear(); s.dragFrame = null;
  }
  function num(v, max) { v = Number(v); return Number.isFinite(v) ? Math.max(-max, Math.min(max, Math.round(v * 1000) / 1000)) : 0; }
  function remember(s, meta) {
    s.frames.set(meta.frameId, meta); s.lastFrame = meta;
    while (s.frames.size > 12) s.frames.delete(s.frames.keys().next().value);
  }
  function positioned(m, s, action) {
    const meta = m.frameId ? s.frames.get(m.frameId) : s.lastFrame;
    // wid 为 0 且带 disp：画面是整块虚拟扩展屏，按显示器区域定位
    if (!meta || (!meta.wid && !meta.disp) || !Number.isFinite(Number(m.nx)) || !Number.isFinite(Number(m.ny))) { inputError(s, 'stale-frame'); return false; }
    if (s.dragFrame && action === 'movewin' && meta.wid !== s.dragFrame.wid) { release(s); inputError(s, 'stale-frame'); return false; }
    // Swift 在投递事件前再次检查真实前台、窗口 ID 与几何，关掉采集与输入间的竞态窗口。
    const unit = (v) => Math.round(Math.max(0, Math.min(1, Number(v))) * 10000) / 10000;
    return cmd([action, meta.wid, meta.x, meta.y, meta.w, meta.h, unit(m.nx),
      unit(m.ny), m.b === 'right' ? 'right' : 'left', m.n === 2 ? 2 : 1,
      num(m.x, 3000), num(m.y, 3000), s.id].join(' '));
  }
  function handle(m, id) {
    if (!m || typeof m !== 'object') return false;
    const s = session(id), b = m.b === 'right' ? 'right' : 'left';
    if (Number.isSafeInteger(m.seq)) { if (m.seq <= s.lastSeq) return false; s.lastSeq = m.seq; }
    if (m.t === 'release') { release(s); return true; }
    if (m.t === 'hb') return true;
    if (m.t === 'pu' || m.t === 'u') {
      if (buttonOwners.get(b) === s.id) { if (!cmd('up ' + b)) pendingReleases.add('up ' + b); buttonOwners.delete(b); s.buttons.delete(b); }
      s.dragFrame = null; return true;
    }
    if (m.t === 'ku') {
      const k = String(m.k || '').toLowerCase();
      if (keyOwners.get(k) === s.id) { if (!cmd('keyup ' + k)) pendingReleases.add('keyup ' + k); keyOwners.delete(k); s.keys.delete(k); }
      return true;
    }
    if (!ensureChild()) { inputError(s, 'input-unavailable'); return false; }
    // 拖拽/按住说话期间只有持有者能继续输入，其他设备可继续看画面。
    if ([...buttonOwners.values(), ...keyOwners.values()].some((owner) => owner !== s.id)) { inputError(s, 'input-busy'); return false; }
    let ok = false;
    switch (m.t) {
      case 'tap': return positioned(m, s, 'clickwin');
      case 'hv': return !s.buttons.size && positioned(m, s, 'hoverwin'); // 手指按下：指针先跟过去，触发网页悬停效果
      case 'sa': return positioned(m, s, 'scrollwin');
      case 'pm': return s.buttons.has('left') && positioned(m, s, 'movewin');
      case 'pd':
        if ((ok = positioned(m, s, 'downwin'))) { s.buttons.add('left'); buttonOwners.set('left', s.id); s.dragFrame = m.frameId ? s.frames.get(m.frameId) : s.lastFrame; } return ok;
      case 'm': return cmd('move ' + num(m.x, 2000) + ' ' + num(m.y, 2000));
      case 's': return cmd('scroll ' + num(m.x, 3000) + ' ' + num(m.y, 3000));
      case 'c': return cmd('click ' + b + ' ' + (m.n === 2 ? 2 : 1));
      case 'd': if ((ok = cmd('down ' + b + ' ' + (m.n === 2 ? 2 : 1)))) { s.buttons.add(b); buttonOwners.set(b, s.id); } return ok;
      case 'k': return typeof m.k === 'string' && KEY_RE.test(m.k) && cmd('key ' + m.k);
      case 'kd': {
        const k = String(m.k || '').toLowerCase(); if (!KEY_RE.test(k)) return false;
        if ((ok = cmd('keydown ' + k))) { s.keys.add(k); keyOwners.set(k, s.id); } return ok;
      }
      case 'x': return typeof m.s === 'string' && m.s.length <= 500 && cmd('text ' + m.s);
      default: return false;
    }
  }
  function front() {
    return new Promise((resolve) => {
      const c = ensureChild(); if (!c) return resolve(null);
      const id = ++frontID;
      const t = timer(() => { frontWaiters.delete(id); resolve(null); }, 1500);
      frontWaiters.set(id, { resolve, timer: t }); write(c, 'front ' + id);
    });
  }

  // HTTP 截图只缓存真正的图像，不能与推流元数据共用一个缓存对象。
  function ensureCapture() {
    if (capChild || !isHelperReady()) return capChild;
    const c = spawn(helperBin, ['capture'], { stdio: ['pipe', 'pipe', 'ignore'] }); capChild = c;
    let buf = '', done = false;
    const finish = (reason) => {
      if (done) return; done = true;
      if (capChild !== c) return; capChild = null;
      if (capWaiter) { const w = capWaiter; capWaiter = null; w(JSON.stringify({ ok: 0, err: reason })); }
    };
    c.on('error', (e) => finish(e.code || 'capture')); c.on('exit', () => finish('exit')); c.stdin.on('error', () => { finish('stdin'); c.kill(); });
    c.stdout.on('data', (d) => {
      if (capChild !== c) return;
      buf += d;
      if (buf.length > 1024 * 1024) { buf = ''; finish('overflow'); c.kill(); return; }
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        if (capWaiter) { const w = capWaiter; capWaiter = null; w(line); }
      }
    });
    return c;
  }
  async function frame(width, id) {
    const w = Math.max(320, Math.min(2048, Number(width) || 1024));
    if (inflight) { await inflight; return frame(width, id); }
    if (!captureCache || captureCache.width !== w || Date.now() - captureCache.at >= 60) {
      inflight = new Promise((resolve) => {
        let c; try { c = ensureCapture(); } catch (e) { return resolve({ error: 'helper' }); }
        if (!c) return resolve({ error: 'helper' });
        const file = path.join(screenDir, 'frame-' + (fileSeq++ % 3) + '.jpg');
        const t = timer(() => { capWaiter = null; if (capChild === c) capChild = null; c.kill(); resolve({ error: 'timeout' }); }, 4000);
        capWaiter = (line) => {
          clearTimeout(t); let meta;
          try { meta = JSON.parse(line); } catch (e) { return resolve({ error: 'parse' }); }
          if (!meta.ok) { const e = captureError(meta.err); if (e === 'screen-permission' && meta.err !== 'screen-permission') noteStreamFailure(); return resolve({ error: e }); }
          fs.readFile(file, (error, jpg) => {
            if (error) return resolve({ error: 'read' });
            meta.frameId = epoch + '-' + (++sequence);
            captureCache = { jpg, meta, at: Date.now(), width: w }; resolve(captureCache);
          });
        };
        write(c, 'frame ' + w + ' ' + file);
      });
      const result = await inflight; inflight = null;
      if (result.error) return result;
    }
    const result = captureCache;
    remember(session(id), result.meta); return result;
  }

  // 播放来源缩略图：复用常驻截图进程（一次性进程启动 ScreenCaptureKit 偶尔会卡住）
  async function thumb(bundle, width) {
    if (!/^[\w.-]+$/.test(String(bundle || ''))) return { error: 'bad-bundle' };
    const w = Math.max(160, Math.min(640, Number(width) || 360));
    if (inflight) { await inflight.catch(() => {}); return thumb(bundle, width); }
    inflight = new Promise((resolve) => {
      let c; try { c = ensureCapture(); } catch (e) { return resolve({ error: 'helper' }); }
      if (!c) return resolve({ error: 'helper' });
      const file = path.join(screenDir, 'thumb.jpg');
      const t = timer(() => { capWaiter = null; if (capChild === c) capChild = null; c.kill(); resolve({ error: 'timeout' }); }, 4000);
      capWaiter = (line) => {
        clearTimeout(t); let meta;
        try { meta = JSON.parse(line); } catch (e) { return resolve({ error: 'parse' }); }
        if (!meta.ok) { const e = captureError(meta.err); if (e === 'screen-permission' && meta.err !== 'screen-permission') noteStreamFailure(); return resolve({ error: e }); }
        fs.readFile(file, (error, jpg) => resolve(error ? { error: 'read' } : { jpg, meta }));
      };
      write(c, 'thumb ' + w + ' ' + bundle + ' ' + file);
    });
    const result = await inflight; inflight = null;
    return result;
  }

  // 三组输出将老设备与高清设备隔离；每组按实际订阅调整采集参数，编码前使用单帧额度。
  function profile(m) {
    const w = Math.max(320, Math.min(2048, Number(m.w) || 1024));
    const fps = Math.max(4, Math.min(30, Number(m.fps) || 12));
    const q = Math.max(0.35, Math.min(0.8, Number(m.q) || 0.6));
    return { w, fps, q, key: w <= 1024 && fps <= 12 ? 'lite' : w <= 1280 && fps <= 20 ? 'balanced' : 'full' };
  }
  function group(key) {
    if (!streams.has(key)) streams.set(key, { key, subs: new Map(), child: null, buf: Buffer.alloc(0), header: null, latest: null, credited: false, failures: 0, stopTimer: null, retryTimer: null, pumpTimer: null, lastHealth: Date.now() });
    return streams.get(key);
  }
  function broadcast(g, obj) { g.subs.forEach((s, socket) => message(socket, { ...obj, subscription: s.subscription })); }
  function parameters(g) { const values = [...g.subs.values()]; return { w: Math.max(320, ...values.map((s) => s.w)), fps: Math.max(4, ...values.map((s) => s.fps)), q: Math.max(0.35, ...values.map((s) => s.q)) }; }
  function start(g) {
    clearTimeout(g.stopTimer); clearTimeout(g.retryTimer);
    if (!g.subs.size) return;
    const p = parameters(g);
    if (g.child) { if (JSON.stringify(p) !== JSON.stringify(g.params)) { g.params = p; g.latest = null; write(g.child, 'profile ' + p.w + ' ' + p.fps + ' ' + p.q); } return; }
    if (!isHelperReady()) return broadcast(g, { t: 'screenerr', err: 'helper' });
    let c; try { c = spawn(helperBin, ['stream', String(p.w), String(p.fps), String(p.q), 'credit'], { stdio: ['pipe', 'pipe', 'pipe'] }); } catch (e) { broadcast(g, { t: 'screenerr', err: 'stream-start' }); return; }
    g.child = c; g.spawnAt = Date.now(); g.params = p; g.buf = Buffer.alloc(0); g.header = null; g.latest = null; g.credited = false; g.lastHealth = Date.now();
    let finished = false;
    const finish = (reason, permission) => {
      if (finished) return; finished = true;
      if (g.child !== c) return;
      g.child = null; g.buf = Buffer.alloc(0); g.header = null; g.latest = null; g.credited = false;
      g.failures++; log('  stream [' + g.key + '] 退出：' + reason);
      broadcast(g, { t: 'screenerr', err: permission ? 'screen-permission' : 'stream-restarting' });
      if (!permission && g.subs.size) g.retryTimer = timer(() => start(g), Math.min(10000, 750 * Math.pow(2, Math.min(g.failures - 1, 4))));
    };
    c.on('error', (e) => finish(e.code || e.message)); c.on('exit', (code, sig) => finish(sig || 'code ' + code, code === 3));
    c.stdin.on('error', () => { finish('stdin'); c.kill(); });
    c.stderr.on('data', (d) => log('  stream [' + g.key + '] ' + String(d).trim().slice(0, 240)));
    c.stdout.on('data', (d) => { if (g.child === c) parse(g, d); });
    requestFrame(g);
  }
  function requestFrame(g) {
    if (!g.child || g.credited) return;
    const now = Date.now();
    const ready = [...g.subs.entries()].some(([socket, s]) => !socket.destroyed && s.ready && now >= s.nextAt && (socket.writableLength || 0) < 512 * 1024);
    if (ready) { g.credited = true; write(g.child, 'credit'); }
  }
  function parse(g, d) {
    g.buf = Buffer.concat([g.buf, d]);
    if (g.buf.length > 16 * 1024 * 1024) { if (g.child) g.child.kill(); return; }
    for (;;) {
      if (!g.header) {
        const i = g.buf.indexOf(10); if (i < 0) return;
        let h; try { h = JSON.parse(g.buf.subarray(0, i).toString()); } catch (e) { if (g.child) g.child.kill(); return; }
        g.buf = g.buf.subarray(i + 1); g.lastHealth = Date.now();
        if (h.kind === 'health') { broadcast(g, { t: 'screenhealth', at: Date.now() }); continue; }
        if (!h.ok) {
          const e = captureError(h.err);
          // 刚启动的 1–3 秒里偶尔会报「中断」随后正常出帧：只统计运行 3 秒以后的中断
          // 「screen-permission」字样来自系统的 TCC 文本时（预检已通过）也是采集服务异常，同样计入；真正没授权会在启动预检时退出
          if (e !== 'no-window' && h.err !== 'screen-permission' && Date.now() - (g.spawnAt || 0) > 3000) noteStreamFailure();
          broadcast(g, { t: 'screenerr', err: e }); continue;
        }
        if (!Number.isSafeInteger(h.bytes) || h.bytes < 1 || h.bytes > 12 * 1024 * 1024) { if (g.child) g.child.kill(); return; }
        g.header = h;
      }
      if (g.buf.length < g.header.bytes) return;
      const jpg = Buffer.from(g.buf.subarray(0, g.header.bytes)); g.buf = g.buf.subarray(g.header.bytes);
      const meta = g.header; g.header = null; meta.frameId = epoch + '-' + (++sequence);
      g.latest = { meta, jpg }; g.credited = false; g.failures = 0; if (streamHealth.fails.length || streamHealth.brokenUntil) streamRecovered(); pump(g);
    }
  }
  function pump(g) {
    clearTimeout(g.pumpTimer);
    const now = Date.now(); let next = Infinity;
    if (g.latest) g.subs.forEach((s, socket) => {
      if (socket.destroyed || !s.ready || s.lastSent === g.latest.meta.frameId) return;
      if (s.nextAt > now) { next = Math.min(next, s.nextAt - now); return; }
      if ((socket.writableLength || 0) > 512 * 1024) { next = Math.min(next, 50); return; }
      s.ready = false; s.lastSent = g.latest.meta.frameId; s.sentAt = now; s.nextAt = now + 1000 / s.fps;
      remember(session(s.client), g.latest.meta);
      message(socket, { t: 'frame', meta: g.latest.meta, bytes: g.latest.jpg.length, profile: g.key, subscription: s.subscription });
      send(socket, g.latest.jpg, 2);
      clearTimeout(s.ackTimer); s.ackTimer = timer(() => { if (!s.ready) socket.destroy(); }, 6000);
    });
    g.subs.forEach((s) => { if (s.ready && s.nextAt > now) next = Math.min(next, s.nextAt - now); });
    if (next < Infinity) g.pumpTimer = timer(() => pump(g), Math.max(5, next));
    requestFrame(g);
  }
  function unsubscribe(socket) {
    streams.forEach((g) => {
      const s = g.subs.get(socket); if (!s) return;
      clearTimeout(s.ackTimer); g.subs.delete(socket); clearTimeout(g.pumpTimer);
      if (g.subs.size) { start(g); pump(g); }
      else {
        clearTimeout(g.retryTimer); g.stopTimer = timer(() => {
          if (g.subs.size) return;
          const c = g.child; g.child = null; g.latest = null; g.buf = Buffer.alloc(0); g.header = null; if (c) c.kill();
          streams.delete(g.key);
        }, 1000);
      }
    });
  }
  function subscribe(socket, m, id) {
    unsubscribe(socket);
    if (!m.on) return;
    if (streamBroken()) { message(socket, { t: 'screenerr', err: 'stream-unavailable' }); return; }
    const p = profile(m), g = group(p.key);
    g.subs.set(socket, { ...p, client: id, subscription: typeof m.subscription === 'string' ? m.subscription.slice(0, 100) : null, ready: true, lastSent: '', nextAt: 0, ackTimer: null });
    start(g); pump(g);
  }

  function upgrade(req, socket, allow, head, id) {
    if (!allow(req) || String(req.headers.upgrade || '').toLowerCase() !== 'websocket' || !req.headers['sec-websocket-key']) { socket.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return; }
    id = clientId(id || new URL(req.url || '/ws', 'http://local').searchParams.get('client'));
    if (id === 'legacy-http') id = 'ws-' + crypto.randomBytes(10).toString('hex');
    const s = session(id);
    if (s.socket && s.socket !== socket) s.socket.destroy();
    s.socket = socket; sockets.add(socket);
    const accept = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + GUID).digest('base64');
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n'); socket.setNoDelay(true);
    ensureChild();
    let data = Buffer.alloc(0), fragments = [], fragmentBytes = 0;
    const receive = (chunk) => {
      data = Buffer.concat([data, chunk]); if (data.length > 128 * 1024) return socket.destroy();
      while (data.length >= 2) {
        const fin = !!(data[0] & 0x80), op = data[0] & 15, maskBit = data[1] & 0x80;
        if ((data[0] & 0x70) || !maskBit) return socket.destroy();
        let len = data[1] & 127, off = 2;
        if (len === 126) { if (data.length < 4) return; len = data.readUInt16BE(2); off = 4; }
        else if (len === 127) return socket.destroy();
        if ((op >= 8 && (!fin || len > 125)) || len + fragmentBytes > 65536) return socket.destroy();
        if (data.length < off + 4 + len) return;
        const mask = data.subarray(off, off + 4), p = Buffer.from(data.subarray(off + 4, off + 4 + len));
        for (let i = 0; i < p.length; i++) p[i] ^= mask[i % 4]; data = data.subarray(off + 4 + len);
        s.at = Date.now();
        if (op === 8) { socket.end(Buffer.from([0x88, 0])); return; }
        if (op === 9) { send(socket, p, 10); continue; }
        if (op === 10) continue;
        if (op !== 0 && op !== 1) return socket.destroy();
        if ((op === 0 && !fragments.length) || (op === 1 && fragments.length)) return socket.destroy();
        fragments.push(p); fragmentBytes += p.length; if (!fin) continue;
        const text = Buffer.concat(fragments).toString('utf8'); fragments = []; fragmentBytes = 0;
        let m; try { m = JSON.parse(text); } catch (e) { continue; }
        if (!m || typeof m !== 'object') continue;
        if (m.t === 'ping') { message(socket, { t: 'pong', id: m.id }); continue; }
        if (m.t === 'screen') { subscribe(socket, m, id); continue; }
        if (m.t === 'rtc') { if (!rtc) { message(socket, { t: 'rtc-error', err: 'unavailable' }); continue; } if (m.on) rtc.start(socket, id, m, (o) => message(socket, o)); else rtc.stop(socket); continue; }
        if (m.t === 'rtc-answer') { if (rtc) rtc.answer(socket, m.sdp); continue; }
        if (m.t === 'rtc-cmd') { if (rtc) rtc.command(socket, m.cmd); continue; }
        if (m.t === 'fack') {
          streams.forEach((g) => { const st = g.subs.get(socket); if (!st || st.ready || (st.subscription && st.subscription !== m.subscription) || (m.frameId && m.frameId !== st.lastSent)) return; clearTimeout(st.ackTimer); st.ready = true; pump(g); }); continue;
        }
        if (m.t === 'f') front().then((f) => message(socket, { t: 'f', front: f }));
        else handle(m, id);
      }
    };
    socket.on('data', receive); socket.on('drain', () => streams.forEach(pump)); socket.on('error', () => {});
    socket.on('close', () => { unsubscribe(socket); if (rtc) rtc.stop(socket); sockets.delete(socket); if (s.socket === socket) { s.socket = null; release(s); } });
    if (head && head.length) receive(head);
  }
  const watchdog = setInterval(() => {
    const now = Date.now();
    sessions.forEach((s, id) => { if (now - s.at > 8000 && (s.buttons.size || s.keys.size)) release(s); if (!s.socket && now - s.at > 60000) sessions.delete(id); });
    streams.forEach((g) => { if (g.child && now - g.lastHealth > 10000) g.child.kill(); });
  }, 2000);
  if (watchdog.unref) watchdog.unref();
  function close() {
    clearInterval(watchdog); clearTimeout(retryTimer); sessions.forEach((s) => release(s));
    streams.forEach((g) => { clearTimeout(g.stopTimer); clearTimeout(g.retryTimer); clearTimeout(g.pumpTimer); g.subs.forEach((s) => clearTimeout(s.ackTimer)); const c = g.child; g.child = null; if (c) c.kill(); }); streams.clear();
    sockets.forEach((s) => s.destroy()); if (child) child.kill(); if (capChild) capChild.kill();
  }
  // WebRTC 画面的窗口位置：分配帧编号并记入该会话，点击按它校验（与 JPEG 帧同一套机制）
  function registerMeta(id, meta) {
    const m = Object.assign({}, meta, { frameId: epoch + '-' + (++sequence) });
    remember(session(id), m);
    return m.frameId;
  }
  function typeText(text) { String(text).replace(/\r\n?/g, '\n').split('\n').forEach((line, i) => { if (i) cmd('key shift+return'); if (line) cmd('text ' + line); }); }
  return { upgrade, handle, front, frame, thumb, typeText, close, clientId, registerMeta, setRTC: (r) => { rtc = r; }, key: (k) => KEY_RE.test(k) && cmd('key ' + k),
    status: () => ({ sessions: sessions.size, streams: [...streams.values()].map((g) => ({ profile: g.key, viewers: g.subs.size, ...g.params, healthy: !!g.child && Date.now() - g.lastHealth < 10000 })) }) };
}
module.exports = { createInput, captureError, noteStreamFailure, streamBroken, streamRecovered, onStreamStuck };
