// 文件夹浏览（iPad 上的分栏浏览器）：列目录、QuickLook 缩略图、在 Mac 上打开 / 在 Finder 中显示。
// 只允许访问家目录与已添加为磁贴的文件夹；隐藏文件（以 . 开头）和 ~/Library 不列出、不可访问。
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 这些「文件夹」在 Finder 里是一个整体（应用、文稿包），当文件处理
const PACKAGES = new Set(['app', 'bundle', 'framework', 'plugin', 'photoslibrary', 'musiclibrary', 'tvlibrary', 'pages', 'numbers', 'key',
  'rtfd', 'xcodeproj', 'xcworkspace', 'playground', 'band', 'logicx', 'fcpbundle', 'imovielibrary', 'scriptd', 'workflow', 'qlgenerator']);
const KINDS = {
  image: /^(jpe?g|png|gif|heic|heif|webp|tiff?|bmp|svg|raw|cr2|nef|dng|psd)$/,
  video: /^(mp4|mov|m4v|mkv|avi|webm|flv|wmv)$/,
  audio: /^(mp3|m4a|aac|flac|wav|aiff?|ogg|opus)$/,
  doc: /^(pdf|docx?|xlsx?|pptx?|pages|numbers|key|txt|md|rtf|rtfd|csv|epub)$/,
  code: /^(js|ts|jsx|tsx|json|py|swift|c|cc|cpp|h|m|go|rs|java|kt|rb|php|sh|zsh|html|css|scss|yml|yaml|toml|xml|sql|vue)$/,
  archive: /^(zip|rar|7z|tar|gz|tgz|bz2|xz|dmg|pkg|iso)$/,
  app: /^app$/,
};

function kindOf(name, dir) {
  const ext = (path.extname(name).slice(1) || '').toLowerCase();
  if (dir && !PACKAGES.has(ext)) return 'folder';
  for (const k of Object.keys(KINDS)) if (KINDS[k].test(ext)) return k;
  return 'file';
}

function createFiles({ home, roots, run, cacheDir }) {
  const qlDir = path.join(cacheDir, 'ql');

  function within(p, root) { return p === root || p.startsWith(root.endsWith('/') ? root : root + '/'); }

  // 解析并校验路径：必须在允许的根目录内，且相对根目录的每一段都不是隐藏项
  function resolve(input) {
    let p = String(input || '').trim();
    if (!p) throw new Error('缺少路径');
    if (p === '~') p = home; else if (p.startsWith('~/')) p = path.join(home, p.slice(2));
    if (!path.isAbsolute(p)) throw new Error('路径无效');
    let real;
    try { real = fs.realpathSync(path.resolve(p)); } catch (e) { throw new Error('路径不存在'); }
    const allowed = [home].concat(roots()).map((r) => { try { return fs.realpathSync(r); } catch (e) { return null; } }).filter(Boolean);
    const root = allowed.filter((r) => within(real, r)).sort((a, b) => b.length - a.length)[0];
    if (!root) throw new Error('只能浏览家目录或已添加的文件夹');
    const rel = path.relative(root, real);
    const parts = rel ? rel.split(path.sep) : [];
    if (parts.some((s) => s.startsWith('.'))) throw new Error('不能访问隐藏文件');
    if (root === fs.realpathSync(home) && parts[0] === 'Library') throw new Error('不能访问资源库');
    return { real, root };
  }

  // 读目录放在子进程里：文稿 / 下载 / iCloud 等受保护文件夹在授权前会一直卡住（macOS 等用户点「允许」），
  // 卡住的读取会占满 node 的 I/O 线程池、拖垮整个服务；子进程超时即杀掉。
  async function list(input) {
    const { real, root } = resolve(input);
    let out;
    try { out = await run(process.execPath, [__filename, '--scan', real, real === fs.realpathSync(home) ? '1' : '0'], { timeout: 6000 }); }
    catch (e) {
      if (e.killed || e.signal) throw new Error('Mac 没有回应：可能弹出了「node 想访问此文件夹」的授权提示，请在 Mac 上点「允许」后重试');
      throw new Error(/EPERM|EACCES|not permitted/i.test(e.message) ? '没有访问这个文件夹的权限（Mac「隐私与安全性 → 文件与文件夹」里允许 node）' : '无法读取文件夹');
    }
    const r = JSON.parse(out);
    return { path: real, name: path.basename(real) || real, parent: real === root ? null : path.dirname(real), entries: r.entries.slice(0, 1000), total: r.entries.length };
  }

  async function info(input) {
    const { real } = resolve(input);
    const s = await fs.promises.stat(real);
    const name = path.basename(real);
    return { path: real, name, dir: s.isDirectory() && kindOf(name, true) === 'folder', kind: kindOf(name, s.isDirectory()), size: s.size, mtime: Math.round(s.mtimeMs) };
  }

  // QuickLook 缩略图（qlmanage）：图片、PDF、视频、文稿都能出图；按路径 + 修改时间缓存
  const pending = new Map();
  async function thumb(input, size) {
    const { real } = resolve(input);
    const s = await fs.promises.stat(real);
    const px = Math.max(128, Math.min(1024, Number(size) || 512));
    const key = crypto.createHash('sha1').update(real + '|' + s.mtimeMs + '|' + px).digest('hex');
    const out = path.join(qlDir, key + '.png');
    if (fs.existsSync(out)) return out;
    if (pending.has(key)) return pending.get(key);
    const work = (async () => {
      const tmp = path.join(qlDir, key + '.d');
      await fs.promises.mkdir(tmp, { recursive: true });
      try {
        await run('/usr/bin/qlmanage', ['-t', '-s', String(px), '-o', tmp, real], { timeout: 10000 });
        const made = (await fs.promises.readdir(tmp)).find((f) => f.endsWith('.png'));
        if (!made) throw new Error('无法预览');
        await fs.promises.rename(path.join(tmp, made), out);
        return out;
      } finally {
        fs.promises.rm(tmp, { recursive: true, force: true }).catch(() => {});
      }
    })();
    pending.set(key, work);
    try { return await work; } finally { pending.delete(key); }
  }

  function open(input, reveal) {
    const { real } = resolve(input);
    return run('/usr/bin/open', reveal ? ['-R', real] : [real]);
  }

  return { resolve, list, info, thumb, open };
}

function scan(dir, atHome) {
  const names = fs.readdirSync(dir, { withFileTypes: true })
    .filter((d) => !d.name.startsWith('.') && d.name !== 'Icon\r' && !(atHome && d.name === 'Library')).slice(0, 2000);
  const entries = [];
  for (const d of names) {
    const full = path.join(dir, d.name);
    let s;
    try { s = fs.statSync(full); } catch (e) { continue; } // 失效的替身 / 无权限
    const isDir = s.isDirectory();
    const kind = kindOf(d.name, isDir);
    entries.push({ name: d.name, path: full, dir: kind === 'folder', kind, size: isDir ? 0 : s.size, mtime: Math.round(s.mtimeMs) });
  }
  entries.sort((a, b) => (b.dir - a.dir) || a.name.localeCompare(b.name, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' }));
  return { entries };
}

if (require.main === module && process.argv[2] === '--scan') {
  process.stdout.write(JSON.stringify(scan(process.argv[3], process.argv[4] === '1')));
}

module.exports = { createFiles, kindOf };
