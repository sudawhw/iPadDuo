// WebRTC + H.264 画面：Mac 用 VideoToolbox 硬件编码（deckctl h264），经 libdatachannel（node-datachannel）发给 iPad。
// 相比 JPEG 推流：只传变化、码率约为 1/10、iPad 端硬件解码、有抖动缓冲，适合 iPadOS 11+（Safari 11 起支持 WebRTC）。
// iOS 10 等不支持 WebRTC 的设备继续使用 input.js 里的 JPEG 推流。
//
// 信令走现有的 WebSocket：iPad 发 {t:'rtc', on:true, w, fps, kbps, mode} → 服务端回 {t:'rtc-offer', sdp}
// → iPad 回 {t:'rtc-answer', sdp}。窗口位置变化时发 {t:'rtc-meta', meta}，meta.frameId 用于点击坐标校验。
'use strict';

const { spawn: spawnProcess } = require('child_process');
const crypto = require('crypto');

let ndc = null;
try { ndc = require('node-datachannel'); } catch (e) { /* 可选依赖：没装就只用 JPEG 推流 */ }

function createWebRTC(opts) {
  const { helperBin, isHelperReady, registerMeta } = opts;
  const spawn = opts.spawn || spawnProcess;
  const log = opts.log || (() => {});
  const peers = new Map(); // socket → peer
  let child = null, buf = Buffer.alloc(0), header = null, params = null, meta = null, restartTimer = null, stopTimer = null;

  function available() { return !!ndc; }

  function wanted() {
    const list = [...peers.values()];
    if (!list.length) return null;
    // 同一时间只有一个编码进程：取所有观看者里的最高要求；扩展屏优先
    const virtual = list.find((p) => p.virtual);
    return {
      w: Math.max(...list.map((p) => p.w)), fps: Math.max(...list.map((p) => p.fps)), kbps: Math.max(...list.map((p) => p.kbps)),
      virtual: virtual ? virtual.virtual : '',
    };
  }

  function writeChild(line) { try { if (child && !child.stdin.destroyed) child.stdin.write(line + '\n'); } catch (e) { /* 退出处理负责 */ } }

  function ensureEncoder() {
    clearTimeout(stopTimer);
    const want = wanted();
    if (!want) return;
    if (child && params && params.virtual === want.virtual) {
      if (want.w !== params.w || want.fps !== params.fps || want.kbps !== params.kbps) {
        params = want;
        writeChild('profile ' + want.w + ' ' + want.fps + ' ' + want.kbps);
      }
      return;
    }
    if (child) { const c = child; child = null; c.kill(); } // 窗口 ↔ 扩展屏切换：重启编码进程
    if (!isHelperReady()) return broadcast({ t: 'rtc-error', err: 'helper' });
    params = want;
    const args = ['h264', String(want.w), String(want.fps), String(want.kbps)];
    if (want.virtual) args.push('virtual', want.virtual);
    let c;
    try { c = spawn(helperBin, args, { stdio: ['pipe', 'pipe', 'pipe'] }); } catch (e) { return broadcast({ t: 'rtc-error', err: 'encoder-start' }); }
    child = c; buf = Buffer.alloc(0); header = null; meta = null;
    c.stdin.on('error', () => {});
    c.stderr.on('data', (d) => log('  h264: ' + String(d).trim().slice(0, 240)));
    c.stdout.on('data', (d) => { if (child === c) parse(d); });
    c.on('error', () => {});
    c.on('exit', (code, sig) => {
      if (child !== c) return;
      child = null;
      log('  h264 退出：' + (sig || 'code ' + code));
      if (code === 3) return broadcast({ t: 'rtc-error', err: 'screen-permission' });
      if (code === 4) return broadcast({ t: 'rtc-error', err: 'virtual-display-unavailable' });
      if (peers.size) restartTimer = setTimeout(ensureEncoder, 1500);
    });
  }

  function broadcast(obj) { peers.forEach((p) => p.send(obj)); }

  function parse(d) {
    buf = Buffer.concat([buf, d]);
    if (buf.length > 32 * 1024 * 1024) { if (child) child.kill(); return; }
    for (;;) {
      if (!header) {
        const i = buf.indexOf(10);
        if (i < 0) return;
        let h;
        try { h = JSON.parse(buf.subarray(0, i).toString()); } catch (e) { if (child) child.kill(); return; }
        buf = buf.subarray(i + 1);
        if (!h.ok) { log('  h264 采集：' + (h.err || '未知错误')); continue; } // 采集中断由 helper 自动重建，不让 iPad 退回 JPEG
        if (h.kind === 'health' || h.kind === 'virtual') continue;
        if (h.kind === 'moved') { broadcast({ t: 'rtc-moved', done: !!h.done, app: h.app || '' }); continue; }
        if (h.kind === 'meta') { updateMeta(h); continue; }
        if (!Number.isSafeInteger(h.bytes) || h.bytes < 1 || h.bytes > 16 * 1024 * 1024) { if (child) child.kill(); return; }
        header = h;
      }
      if (buf.length < header.bytes) return;
      const frame = Buffer.from(buf.subarray(0, header.bytes));
      buf = buf.subarray(header.bytes);
      const h = header; header = null;
      if (h.pw && meta && (meta.pw !== h.pw || meta.ph !== h.ph)) updateMeta(Object.assign({}, meta, { pw: h.pw, ph: h.ph }));
      peers.forEach((p) => {
        if (!p.open) return;
        if (p.needKey && !h.key) return; // 新观看者从关键帧开始
        p.needKey = false;
        try { p.rtp.timestamp = h.pts >>> 0; p.track.sendMessageBinary(frame); p.frames++; } catch (e) { /* 连接关闭中 */ }
      });
    }
  }

  // 窗口 / 显示器的位置与尺寸：分配帧编号并通知每个观看者（点击坐标按它换算与校验）
  function updateMeta(h) {
    const m = { wid: h.wid || 0, disp: h.disp || 0, x: h.x, y: h.y, w: h.w, h: h.h, pw: h.pw || (meta && meta.pw) || 0, ph: h.ph || (meta && meta.ph) || 0, app: h.app || '', bundle: h.bundle || '' };
    meta = m;
    peers.forEach((p) => {
      const withId = Object.assign({}, m, { frameId: registerMeta(p.clientId, m) });
      p.send({ t: 'rtc-meta', meta: withId });
    });
  }

  function start(socket, clientId, m, send) {
    if (!ndc) return send({ t: 'rtc-error', err: 'unavailable' });
    stop(socket);
    const ssrc = crypto.randomBytes(4).readUInt32BE(0) >>> 1;
    const pc = new ndc.PeerConnection('ipadduo-' + clientId.slice(0, 16), { iceServers: [], disableAutoNegotiation: false });
    const video = new ndc.Video('video', 'SendOnly');
    // Constrained Baseline：iOS / iPadOS 的 Safari 都能硬解；允许更高 level（level-asymmetry-allowed）
    video.addH264Codec(102, 'profile-level-id=42e01f;packetization-mode=1;level-asymmetry-allowed=1');
    video.addSSRC(ssrc, 'ipadduo', 'ipadduo', 'screen');
    const track = pc.addTrack(video);
    const rtp = new ndc.RtpPacketizationConfig(ssrc, 'ipadduo', 102, 90000);
    const packetizer = new ndc.H264RtpPacketizer('LongStartSequence', rtp);
    packetizer.addToChain(new ndc.RtcpSrReporter(rtp));
    packetizer.addToChain(new ndc.RtcpNackResponder());
    track.setMediaHandler(packetizer);
    const peer = {
      pc, track, rtp, send, clientId, open: false, needKey: true, frames: 0, offered: false,
      w: Math.max(480, Math.min(2560, Number(m.w) || 1600)),
      fps: Math.max(5, Math.min(60, Number(m.fps) || 30)),
      kbps: Math.max(500, Math.min(20000, Number(m.kbps) || 4000)),
      virtual: /^\d{3,4}x\d{3,4}$/.test(String(m.virtual || '')) ? m.virtual : '',
    };
    peers.set(socket, peer);
    track.onOpen(() => {
      peer.open = true; peer.needKey = true;
      writeChild('kf');
      if (meta) updateMeta(meta);
    });
    // 浏览器的 RTCP：PLI（丢关键帧）/ FIR → 立即出关键帧
    track.onMessage((msg) => {
      if (!Buffer.isBuffer(msg) || msg.length < 4) return;
      for (let off = 0; off + 4 <= msg.length;) {
        const pt = msg[off + 1], fmt = msg[off] & 0x1f, len = (msg.readUInt16BE(off + 2) + 1) * 4;
        if ((pt === 206 && (fmt === 1 || fmt === 4)) || pt === 192) { peer.needKey = true; writeChild('kf'); }
        off += len;
      }
    });
    const sendOffer = () => {
      if (peer.offered) return;
      const d = pc.localDescription();
      if (!d) return;
      peer.offered = true;
      send({ t: 'rtc-offer', sdp: d.sdp });
    };
    pc.onGatheringStateChange((s) => { if (s === 'complete') sendOffer(); });
    setTimeout(sendOffer, 1500); // 收集候选太慢时先发已有的
    pc.onStateChange((s) => {
      send({ t: 'rtc-state', state: s });
      if (s === 'failed' || s === 'closed') stop(socket);
    });
    pc.setLocalDescription();
    ensureEncoder();
  }

  function answer(socket, sdp) {
    const p = peers.get(socket);
    if (!p || typeof sdp !== 'string' || sdp.length > 20000) return;
    try { p.pc.setRemoteDescription(sdp, 'answer'); } catch (e) { p.send({ t: 'rtc-error', err: 'bad-answer' }); stop(socket); }
  }

  function stop(socket) {
    const p = peers.get(socket);
    if (!p) return;
    peers.delete(socket);
    try { p.track.close(); } catch (e) { /* 已关闭 */ }
    try { p.pc.close(); } catch (e) { /* 已关闭 */ }
    if (!peers.size) {
      clearTimeout(restartTimer);
      stopTimer = setTimeout(() => { if (!peers.size && child) { const c = child; child = null; c.kill(); } }, 3000);
    } else ensureEncoder();
  }

  // 扩展屏操作：bring（把前台窗口移到 iPad）/ home（送回主显示器）/ kf（请求关键帧）
  function command(socket, cmd) {
    const p = peers.get(socket);
    if (!p || !/^(bring|home|kf)$/.test(String(cmd))) return;
    if (cmd !== 'kf' && !(params && params.virtual)) return p.send({ t: 'rtc-moved', done: false, err: 'not-virtual' });
    writeChild(cmd);
  }

  function close() {
    [...peers.keys()].forEach(stop);
    if (child) { const c = child; child = null; c.kill(); }
    if (ndc && ndc.cleanup) try { ndc.cleanup(); } catch (e) { /* ignore */ }
  }

  function status() {
    return { available: !!ndc, viewers: peers.size, encoder: !!child, params, frames: [...peers.values()].map((p) => p.frames) };
  }

  return { available, start, answer, command, stop, close, status };
}

module.exports = { createWebRTC };
