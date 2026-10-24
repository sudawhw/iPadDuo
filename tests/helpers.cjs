const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const root = path.join(__dirname, '..');
class Socket extends EventEmitter {
  constructor() { super(); this.writes = []; this.destroyed = false; this.writableLength = 0; this.writable = true; }
  write(b) { this.writes.push(Buffer.from(b)); return true; }
  setNoDelay() {}
  end() { this.destroy(); }
  destroy() { if (!this.destroyed) { this.destroyed = true; this.emit('close'); } }
}
function encode(m, fin = true, op = 1) {
  const p = Buffer.from(typeof m === 'string' ? m : JSON.stringify(m)), mask = Buffer.from([1,2,3,4]);
  const h = Buffer.alloc(p.length < 126 ? 2 : 4); h[0] = (fin ? 128 : 0) | op;
  if (p.length < 126) h[1] = 128 | p.length; else { h[1] = 254; h.writeUInt16BE(p.length, 2); }
  const data = Buffer.from(p); for (let i = 0; i < p.length; i++) data[i] ^= mask[i % 4];
  return Buffer.concat([h, mask, data]);
}
function messages(socket) {
  return socket.writes.filter(b => b[0] === 0x81).map(b => JSON.parse(b.subarray(b[1] === 126 ? 4 : 2).toString()));
}
function backend() {
  const children = [], logs = [];
  const spawn = (_bin, args) => {
    const c = new EventEmitter(); c.args = args; c.commands = []; c.stdout = new EventEmitter(); c.stderr = new EventEmitter();
    c.stdin = new EventEmitter(); c.stdin.destroyed = false;
    c.stdin.write = (s) => { c.commands.push(s.trim()); return true; };
    c.kill = () => { c.killed = true; c.emit('exit', null, 'SIGTERM'); };
    children.push(c); return c;
  };
  const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'ipadduo-test-'));
  const api = require('../input').createInput({ helperBin: '/mock/deckctl', cacheDir: dir, isHelperReady: () => true, spawn, log: s => logs.push(s) });
  function socket(id = 'client-test-a') {
    const s = new Socket();
    api.upgrade({ url: '/ws?client=' + id, headers: { upgrade: 'websocket', 'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==' } }, s, () => true);
    return s;
  }
  function frame(c, meta = {}, jpg = Buffer.from('JPEG')) {
    const m = { ok: 1, bytes: jpg.length, wid: 11, x: 0, y: 0, w: 1000, h: 600, pw: 1000, ph: 600, app: 'Test', bundle: 'test.app', at: Date.now(), ...meta };
    c.stdout.emit('data', Buffer.concat([Buffer.from(JSON.stringify(m) + '\n'), jpg]));
  }
  return { api, children, logs, socket, frame, send(s, m) { s.emit('data', encode(m)); }, close() { api.close(); fs.rmSync(dir, { recursive: true, force: true }); }, dir };
}
function frontend(options = {}) {
  const elements = new Map(), docEvents = {}, winEvents = {}, timers = new Map(), sent = [], requests = [], images = [], revoked = [], storage = new Map(Object.entries(options.storage || {}));
  let clock = 10000, nextID = 0;
  function element(id) {
    if (!elements.has(id)) {
      const events = {}, attrs = {};
      const e = { id, className: '', style: { setProperty() {} }, value: '', textContent: '', innerHTML: '', children: [], disabled: false, events,
        clientWidth: 1024, clientHeight: 650, offsetWidth: 1024, offsetTop: 0, offsetHeight: 30,
        firstChild: { style: {} }, lastChild: { textContent: '' },
        addEventListener(t, f) { (events[t] ||= []).push(f); },
        getAttribute(k) { return Object.hasOwn(attrs, k) ? attrs[k] : null; }, setAttribute(k,v) { attrs[k] = String(v); }, removeAttribute(k) { delete attrs[k]; },
        querySelector(sel) { return sel === '.cv-next' || sel === '[data-cv="rate"]' ? null : element(id + sel); }, querySelectorAll() { return []; },
        blur() {}, focus() {}, matches() { return false; }, getBoundingClientRect() { return { left: 0, top: 0, width: 1024, height: 650, right: 1024, bottom: 650 }; }
      }; elements.set(id, e);
    }
    return elements.get(id);
  }
  element('tpMode').children = ['ctrl','pad','screen'].map(m => ({ className: '', getAttribute: () => 'mode-' + m }));
  class XHR {
    constructor() { requests.push(this); this.headers = {}; }
    open(method, url) { this.method = method; this.url = url; }
    setRequestHeader(k,v) { this.headers[k] = v; }
    send(body) { this.body = body; }
    abort() { this.aborted = true; }
    respond(status, value) { this.status = status; this.responseText = JSON.stringify(value); if (this.onload) this.onload(); if (this.onloadend) this.onloadend(); }
  }
  class FakeImage { constructor() { images.push(this); } }
  class WS { constructor(url) { this.url = url; this.bufferedAmount = 0; } send(s) { sent.push(JSON.parse(s)); } close() { if (this.onclose) this.onclose(); } }
  const timer = (f, ms = 0) => { const id = ++nextID; timers.set(id, { f, at: clock + ms }); return id; };
  const nav = { userAgent: options.ua || 'Mozilla/5.0 (iPad; CPU OS 12_5 like Mac OS X) Version/12.1 Safari/604.1', maxTouchPoints: 5 };
  const context = { console: { warn() {} }, Promise, XMLHttpRequest: XHR, Image: FakeImage, WebSocket: WS,
    navigator: nav, localStorage: { getItem(k) { return storage.get(k) || null; }, setItem(k,v) { storage.set(k,v); } },
    location: { host: 'audit.invalid', protocol: options.protocol || 'http:' }, Date: class extends Date { static now() { return clock; } },
    setTimeout: timer, clearTimeout(id) { timers.delete(id); }, setInterval() {}, clearInterval() {},
    document: { hidden: false, body: element('body'), getElementById: element, addEventListener(t,f) { (docEvents[t] ||= []).push(f); } },
    window: { screen: { width: 768, height: 1024 }, innerWidth: 1024, innerHeight: 768, devicePixelRatio: 2, navigator: nav, WebSocket: WS,
      addEventListener(t,f) { (winEvents[t] ||= []).push(f); }, matchMedia() { return { matches: false, addListener() {} }; },
      URL: { createObjectURL() { return 'blob:' + (++nextID); }, revokeObjectURL(u) { revoked.push(u); } } }
  };
  context.window.requestAnimationFrame = f => timer(() => f(clock), 16);
  context.window.cancelAnimationFrame = id => timers.delete(id);
  context.window.performance = { now: () => clock };
  const exports = '{ DEVICE, PERF, tp, scr, ctl, pn, busy, videoApply, ctlRender, tpSetMode, tpClose, tpSetSize, tpCancel, tpSend, tpFlush, tpConnect, tpInertia, tpStopInertia, scrPoint, scrTouchEnd, scrTouchStart, scrTouchMove, scrSubscribe, scrStop, scrStart, scrOnFrame, scrDisplay, perfSample, perfProfile, stageForTile, boot, setConfig: function (c) { config = c; } }';
  const source = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8').replace('  boot();\n})();', '  globalThis.audit = ' + exports + ';\n})();');
  vm.runInNewContext(source, context, { filename: 'app.js' });
  const api = context.audit; api.tp.visible = true; api.tp.ready = true; api.tp.ws = new WS('mock');
  api.setConfig({ settings: { keepAwake: false }, pages: [{ tiles: [] }] });
  function event(x, count = 1, type = 'touchmove') { return { type, preventDefault() {}, touches: Array.from({ length: count }, (_,i) => ({ clientX: x + i * 10, clientY: 100 })), changedTouches: [{ clientX: x, clientY: 100 }] }; }
  function advance(ms) {
    const end = clock + ms; let steps = 0;
    while (true) { let first; for (const [id,t] of timers) if (t.at <= end && (!first || t.at < first[1].at)) first = [id,t]; if (!first) break;
      if (++steps > 2000) throw new Error('Timer loop'); timers.delete(first[0]); clock = first[1].at; first[1].f(); }
    clock = end;
  }
  return { api, context, sent, requests, images, revoked, storage, elements, docEvents, winEvents, timers, element, event, advance, now(n) { clock = n; } };
}
module.exports = { backend, frontend, encode, messages };
