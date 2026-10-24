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
