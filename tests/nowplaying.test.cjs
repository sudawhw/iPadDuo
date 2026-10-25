const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { createNowPlaying } = require('../nowplaying.js');

const tick = () => new Promise((resolve) => setImmediate(resolve));

function fixture(options) {
  options = options || {};
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'deck-np-'));
  const root = path.join(base, 'root');
  fs.mkdirSync(path.join(root, 'helper'), { recursive: true });
  fs.writeFileSync(path.join(root, 'helper', 'nowplaying.m'), '// fixture');
  fs.writeFileSync(path.join(root, 'helper', 'nowplaying.dylib'), 'fixture');
  const children = [];
  const spawn = () => {
    const c = new EventEmitter();
    c.stdout = new EventEmitter(); c.stderr = new EventEmitter(); c.killed = false;
    c.kill = () => { c.killed = true; };
    children.push(c); return c;
  };
  const np = createNowPlaying({
    root, cacheDir: path.join(base, 'cache'), helperBin: 'helper', spawn,
    run: options.run || (async () => ''), isHelperReady: options.isHelperReady || (() => true),
    getSettings: () => ({ nowPlaying: options.mode || 'system', lyricsOnline: false }),
    isActive: () => true, log: options.log || (() => {}),
  });
  return { np, children };
}

test('system now-playing process handles spawn errors and closes cleanly', () => {
  const a = fixture();
  a.np.sync();
  assert.equal(a.children.length, 1);
  assert.doesNotThrow(() => a.children[0].emit('error', new Error('mock ENOENT')));
  a.np.close();
});

test('an old system process exit cannot clear or restart over its replacement', () => {
  const a = fixture();
  a.np.sync();
  const first = a.children[0];
  a.np.close();
  assert.equal(first.killed, true);
  a.np.sync();
  const second = a.children[1];
  first.emit('exit', null, 'SIGTERM');
  a.np.close();
  assert.equal(second.killed, true, 'the current process is still owned and killed');
});

test('slow now-playing polls never overlap', async () => {
  let calls = 0;
  const a = fixture({ mode: 'auto', run: () => { calls++; return new Promise(() => {}); } });
  a.np.sync();
  await new Promise((resolve) => setTimeout(resolve, 1700));
  assert.equal(calls, 1);
  a.np.close();
});

test('a poll from an old source cannot restore playback after close', async () => {
  let finish;
  const a = fixture({
    mode: 'auto', isHelperReady: () => false,
    run: () => new Promise((resolve) => { finish = resolve; }),
  });
  a.np.sync();
  await tick();
  a.np.close();
  finish('playing\tOld song\tArtist\tAlbum\t100\t1\n');
  await tick(); await tick();
  assert.equal(a.np.state().active, false);
});
