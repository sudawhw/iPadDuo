const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createWebRTC } = require('../webrtc.js');

test('a viewer that never receives a frame gets a keyframe request, then the encoder is restarted', async () => {
  const spawned = [];
  const spawn = () => {
    const c = new EventEmitter();
    c.writes = []; c.killed = false;
    c.stdin = Object.assign(new EventEmitter(), { destroyed: false, write: (l) => c.writes.push(l.trim()) });
    c.stdout = new EventEmitter(); c.stderr = new EventEmitter();
    c.kill = () => { c.killed = true; setImmediate(() => c.emit('exit', null, 'SIGTERM')); };
    spawned.push(c); return c;
  };
  let t = 1000;
  const rtc = createWebRTC({ helperBin: 'x', isHelperReady: () => true, registerMeta: () => 'f1', spawn, now: () => t });
  const peer = { open: true, openAt: 1000, frames: 0, w: 1280, fps: 30, kbps: 3000, virtual: '', send() {} };
  rtc._attach({}, peer);
  assert.equal(spawned.length, 1);
  t = 3200; await new Promise((r) => setTimeout(r, 650));
  assert.ok(spawned[0].writes.includes('kf'), 'keyframe requested after 2 s without frames');
  assert.equal(spawned[0].killed, false);
  t = 6000; await new Promise((r) => setTimeout(r, 1100));
  assert.equal(spawned[0].killed, true, 'encoder restarted after 4.5 s');
  assert.equal(spawned.length, 2, 'a fresh encoder process is started');
  rtc.close();
});

test('repeated capture-stream failures tell viewers to switch to compatibility mode right away', () => {
  let c;
  const spawn = () => { c = new EventEmitter(); c.stdin = Object.assign(new EventEmitter(), { destroyed: false, write() {} }); c.stdout = new EventEmitter(); c.stderr = new EventEmitter(); c.kill = () => {}; return c; };
  const rtc = createWebRTC({ helperBin: 'x', isHelperReady: () => true, registerMeta: () => 'f1', spawn });
  const sent = [];
  rtc._attach({}, { open: true, openAt: Date.now(), frames: 0, w: 1280, fps: 30, kbps: 3000, virtual: '', send: (o) => sent.push(o) });
  const err = JSON.stringify({ ok: 0, err: '流播放期间，应用程序连接中断而导致失败' }) + '\n';
  c.stdout.emit('data', Buffer.from(err));
  assert.equal(sent.filter((o) => o.t === 'rtc-error').length, 0, 'one interruption is retried silently');
  c.stdout.emit('data', Buffer.from(err));
  assert.deepEqual(sent.filter((o) => o.t === 'rtc-error').map((o) => o.err), ['stream-unavailable']);
  rtc.close();
});

test('after two stream interruptions within a minute, streams are refused for two minutes and recover on success', () => {
  const { noteStreamFailure, streamBroken, streamRecovered } = require('../input.js');
  streamRecovered();
  const t = 1_000_000;
  noteStreamFailure(t);
  assert.equal(streamBroken(t + 1), false);
  noteStreamFailure(t + 30_000);
  assert.equal(streamBroken(t + 31_000), true);
  assert.equal(streamBroken(t + 30_000 + 121_000), false, 'cool-down ends after 2 minutes');
  noteStreamFailure(t + 200_000); noteStreamFailure(t + 300_000);
  assert.equal(streamBroken(t + 300_001), false, 'failures more than a minute apart do not trip it');
  streamRecovered();
});

test('encoder spawn errors restart safely and stale exits cannot clear the replacement', async () => {
  const spawned = [];
  const spawn = () => {
    const c = new EventEmitter();
    c.stdin = Object.assign(new EventEmitter(), { destroyed: false, write() {} });
    c.stdout = new EventEmitter(); c.stderr = new EventEmitter();
    c.kill = () => {};
    spawned.push(c); return c;
  };
  const rtc = createWebRTC({ helperBin: 'x', isHelperReady: () => true, registerMeta: () => 'f1', spawn });
  rtc._attach({}, { open: true, openAt: Date.now(), frames: 0, w: 1280, fps: 30, kbps: 3000, virtual: '', send() {} });
  const first = spawned[0];
  assert.doesNotThrow(() => first.emit('error', new Error('mock ENOENT')));
  await new Promise((resolve) => setTimeout(resolve, 1600));
  assert.equal(spawned.length, 2, 'a replacement encoder was started');
  first.emit('exit', null, 'SIGTERM');
  assert.equal(rtc.status().encoder, true, 'stale exit did not clear the active encoder');
  rtc.close();
});
