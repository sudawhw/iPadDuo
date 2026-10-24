const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { createFiles, kindOf } = require('../files.js');
const run = (cmd, args, opts) => new Promise((resolve, reject) => execFile(cmd, args, opts || {}, (e, out) => e ? reject(e) : resolve(out)));

function sandbox() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'deck-home-'));
  fs.mkdirSync(path.join(home, 'Docs', 'Sub'), { recursive: true });
  fs.mkdirSync(path.join(home, 'Library', 'Secret'), { recursive: true });
  fs.mkdirSync(path.join(home, '.ssh'));
  fs.mkdirSync(path.join(home, 'Tool.app'));
  fs.writeFileSync(path.join(home, 'Docs', 'b.pdf'), 'x');
  fs.writeFileSync(path.join(home, 'Docs', 'a10.txt'), 'x');
  fs.writeFileSync(path.join(home, 'Docs', 'a2.txt'), 'x');
  fs.writeFileSync(path.join(home, 'Docs', '.hidden'), 'x');
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'deck-out-'));
  return { home, outside, f: createFiles({ home, roots: () => [], run, cacheDir: path.join(home, 'cache-x') }) };
}

test('folder listing hides dotfiles and Library, sorts folders first with natural order', async () => {
  const { home, f } = sandbox();
  const root = await f.list(home);
  const names = root.entries.map((e) => e.name);
  assert(!names.includes('Library') && !names.includes('.ssh'));
  assert.equal(root.entries.find((e) => e.name === 'Tool.app').dir, false); // 应用包当文件
  const docs = await f.list(path.join(home, 'Docs'));
  assert.deepEqual(docs.entries.map((e) => e.name), ['Sub', 'a2.txt', 'a10.txt', 'b.pdf']);
  assert.equal(docs.parent, fs.realpathSync(home));
});

test('folder browser refuses paths outside the allowed roots, hidden and Library paths', async () => {
  const { home, outside, f } = sandbox();
  await assert.rejects(f.list(outside), /只能浏览/);
  await assert.rejects(f.list(path.join(home, '.ssh')), /隐藏/);
  await assert.rejects(f.list(path.join(home, 'Library', 'Secret')), /资源库/);
  await assert.rejects(f.list(path.join(home, 'Docs', '..', '..')), /只能浏览/);
  fs.symlinkSync(outside, path.join(home, 'Docs', 'link'));
  await assert.rejects(f.list(path.join(home, 'Docs', 'link')), /只能浏览/); // 替身指向外部也拒绝
  assert.equal(kindOf('x.MOV', false), 'video');
});
