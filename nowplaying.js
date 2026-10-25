// 正在播放 + 歌词。
//
// 播放信息来源（config.settings.nowPlaying）：
//   'auto'   —— 默认：QQ 音乐在运行时通过「辅助功能」读取它播放栏上的歌名 / 进度（与媒体键共用已授予的权限），
//               否则读取 Apple Music（AppleScript）
//   'music'  —— 只读 Apple Music
//   'system' —— 系统级「正在播放」（QQ 音乐 / 网易云 / 浏览器等通用）。
//               macOS 15.4 起需借助系统自带的 /usr/bin/perl 加载 helper/nowplaying.dylib 才能读取，
//               属于绕开系统限制的做法，因此默认关闭，由用户在设置里自行开启。
//   'off'    —— 关闭
// 歌词依次查询 QQ 音乐 → 网易云 → LRCLIB，按歌名 / 歌手 / 时长匹配，结果缓存在 cache/lyrics。
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

function sha(s) { return crypto.createHash('sha1').update(s).digest('hex').slice(0, 16); }

async function fetchJson(url, headers, timeout) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout || 6000);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: Object.assign({ 'User-Agent': UA }, headers) });
    if (!r.ok) return null;
    return JSON.parse(await r.text());
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function download(url, file, headers) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: Object.assign({ 'User-Agent': UA }, headers) });
    if (!r.ok || !/^image\//.test(r.headers.get('content-type') || '')) return false;
    fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
    return true;
  } catch (e) {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// ---------- 匹配 ----------

function norm(s) {
  return String(s || '').toLowerCase()
    .replace(/[(（\[【][^)）\]】]*[)）\]】]/g, '') // 去掉 (Explicit) (Live) 【伴奏】 等
    .replace(/\s+-\s+.*$/, '')
    .replace(/[\s'’"“”.,，。!！?？·・&＆\-_/]/g, '');
}

function artistMatch(a, b) {
  const x = norm(a), y = norm(b);
  if (!x || !y) return false;
  return x === y || x.indexOf(y) >= 0 || y.indexOf(x) >= 0;
}

function score(track, cand) {
  const tq = norm(track.title), tc = norm(cand.title);
  let s = 0;
  if (tq && tq === tc) s += 3;
  else if (tq && tc && (tq.indexOf(tc) >= 0 || tc.indexOf(tq) >= 0)) s += 1;
  else return -1;
  if (artistMatch(track.artist, cand.artist)) s += 2;
  if (track.duration && cand.duration) {
    const d = Math.abs(track.duration - cand.duration);
    if (d <= 4) s += 2;
    else if (d <= 10) s += 1;
    else if (d > 30) s -= 2;
  }
  return s;
}

function best(track, cands) {
  let top = null, topScore = 3; // 至少要歌名一致 + 歌手或时长之一吻合
  cands.forEach((c) => {
    const s = score(track, c);
    if (s > topScore) { top = c; topScore = s; }
  });
  return top;
}

// ---------- LRC 解析 ----------

function decodeEntities(s) {
  return s.replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

function parseLrc(text) {
  if (!text) return [];
  text = decodeEntities(text);
  let offset = 0;
  const m = text.match(/\[offset:\s*([+-]?\d+)\]/i);
  if (m) offset = parseInt(m[1], 10) / 1000;
  const out = [];
  text.split(/\r?\n/).forEach((line) => {
    const stamps = [];
    const re = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
    let mm, last = 0;
    while ((mm = re.exec(line))) {
      const frac = mm[3] ? parseInt(mm[3], 10) / Math.pow(10, mm[3].length) : 0;
      stamps.push(parseInt(mm[1], 10) * 60 + parseInt(mm[2], 10) + frac - offset);
      last = re.lastIndex;
    }
    if (!stamps.length) return;
    const words = line.slice(last).trim();
    if (!words || words === '//') return;
    stamps.forEach((t) => out.push({ t: Math.max(0, Math.round(t * 100) / 100), text: words }));
  });
  return out.sort((a, b) => a.t - b.t);
}

function mergeTranslation(lines, trans) {
  if (!trans.length) return lines;
  let j = 0;
  lines.forEach((l) => {
    while (j < trans.length && trans[j].t < l.t - 0.15) j++;
    if (j < trans.length && Math.abs(trans[j].t - l.t) <= 0.15 && trans[j].text !== l.text) l.tr = trans[j].text;
  });
  return lines;
}

// ---------- 歌词来源 ----------

async function fromQQ(track) {
  const q = encodeURIComponent(track.title + ' ' + (track.artist || ''));
  const H = { Referer: 'https://y.qq.com/' };
  const res = await fetchJson('https://c.y.qq.com/soso/fcgi-bin/client_search_cp?format=json&n=10&p=1&w=' + q, H);
  const list = res && res.data && res.data.song && res.data.song.list;
  if (!list || !list.length) return null;
  const hit = best(track, list.map((s) => ({
    title: s.songname, artist: (s.singer || []).map((x) => x.name).join('/'), duration: s.interval, mid: s.songmid, albummid: s.albummid,
  })));
  if (!hit) return null;
  const lr = await fetchJson('https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?format=json&nobase64=1&g_tk=5381&songmid=' + hit.mid, H);
  const lines = parseLrc(lr && lr.lyric);
  if (!lines.length) return null;
  return {
    source: 'QQ 音乐',
    lines: mergeTranslation(lines, parseLrc(lr.trans)),
    art: hit.albummid ? 'https://y.qq.com/music/photo_new/T002R500x500M000' + hit.albummid + '.jpg' : null,
  };
}

async function fromNetease(track) {
  const q = encodeURIComponent(track.title + ' ' + (track.artist || ''));
  const H = { Referer: 'https://music.163.com/' };
  const res = await fetchJson('https://music.163.com/api/search/get?type=1&limit=10&s=' + q, H);
  const list = res && res.result && res.result.songs;
  if (!list || !list.length) return null;
  const hit = best(track, list.map((s) => ({
    title: s.name, artist: (s.artists || []).map((x) => x.name).join('/'), duration: Math.round((s.duration || 0) / 1000), id: s.id,
  })));
  if (!hit) return null;
  const lr = await fetchJson('https://music.163.com/api/song/lyric?lv=1&tv=1&id=' + hit.id, H);
  const lines = parseLrc(lr && lr.lrc && lr.lrc.lyric);
  if (!lines.length) return null;
  const detail = await fetchJson('https://music.163.com/api/song/detail?ids=%5B' + hit.id + '%5D', H);
  const pic = detail && detail.songs && detail.songs[0] && detail.songs[0].album && detail.songs[0].album.picUrl;
  return {
    source: '网易云音乐',
    lines: mergeTranslation(lines, parseLrc(lr.tlyric && lr.tlyric.lyric)),
    art: pic ? pic.replace(/^http:/, 'https:') + '?param=500y500' : null,
  };
}

async function fromLrclib(track) {
  const qs = 'track_name=' + encodeURIComponent(track.title) + '&artist_name=' + encodeURIComponent(track.artist || '');
  let r = await fetchJson('https://lrclib.net/api/get?' + qs + (track.duration ? '&duration=' + Math.round(track.duration) : ''));
  if (!r || !r.syncedLyrics) {
    const list = await fetchJson('https://lrclib.net/api/search?' + qs);
    if (Array.isArray(list)) {
      const hit = best(track, list.filter((x) => x.syncedLyrics).map((x) => ({ title: x.trackName, artist: x.artistName, duration: x.duration, raw: x })));
      r = hit && hit.raw;
    }
  }
  const lines = parseLrc(r && r.syncedLyrics);
  return lines.length ? { source: 'LRCLIB', lines, art: null } : null;
}

// ---------- 播放信息来源 ----------

const MUSIC_SCRIPT = `
if application "Music" is running then
  tell application "Music"
    set st to player state as text
    if st is "stopped" then return "stopped"
    set t to current track
    return st & tab & (name of t) & tab & (artist of t) & tab & (album of t) & tab & (duration of t) & tab & (player position)
  end tell
end if
return "none"`;

function createNowPlaying(opts) {
  const { root, cacheDir, run, helperBin, isHelperReady, getSettings, log } = opts;
  const isActive = opts.isActive || (() => true);
  const lyricDir = path.join(cacheDir, 'lyrics');
  const artDir = path.join(cacheDir, 'art');
  fs.mkdirSync(lyricDir, { recursive: true });
  fs.mkdirSync(artDir, { recursive: true });

  let track = null;        // 当前曲目（已归一化）
  let info = null;         // 歌词与封面结果
  let source = null;
  let pollTimer = null;
  let child = null;
  let childRestart = null;

  function setTrack(t) {
    if (!t || !t.title) { track = null; return; }
    const id = sha([t.title, t.artist, Math.round(t.duration || 0)].join('|'));
    const changed = !track || track.id !== id;
    // 同一首歌、播放状态没变、推算位置与读到的位置相差不到 1.5 秒：沿用原来的计时基准，
    // 避免进度只精确到秒的播放器（QQ 音乐）让歌词来回抖动
    if (!changed && track.rate === t.rate) {
      const predicted = track.elapsed + (track.rate ? (Date.now() - track.timestamp) / 1000 * track.rate : 0);
      if (Math.abs(predicted - t.elapsed) < 1.5) { t.elapsed = track.elapsed; t.timestamp = track.timestamp; }
    }
    track = Object.assign({ id }, t);
    if (changed) loadLyrics(track);
  }

  // QQ 音乐：读取主窗口播放栏（辅助功能），结构大致为
  //   Button 打开<歌名>单曲窗口 / StaticText <歌名>-<歌手> / [StaticText 当前歌词] / StaticText 02:28 / StaticText 04:35 / Button 上一首 / Button 暂停|播放 / Button 下一首
  function toSec(s) { return s.split(':').reduce((a, b) => a * 60 + parseInt(b, 10), 0); }

  function parseQQ(out) {
    const rows = out.split('\n').filter(Boolean).map((l) => {
      const i = l.indexOf('\t');
      return { role: l.slice(0, i), text: l.slice(i + 1) };
    });
    const ctrl = rows.findIndex((r) => r.role === 'Button' && r.text === '上一首');
    if (ctrl < 0) return null;
    const times = [];
    for (let i = ctrl - 1; i >= Math.max(0, ctrl - 4) && times.length < 2; i--) {
      if (rows[i].role === 'StaticText' && /^\d{1,2}:\d{2}(:\d{2})?$/.test(rows[i].text)) times.unshift(rows[i].text);
    }
    let title = '', artist = '';
    for (let i = ctrl - 1; i >= 0; i--) {
      const m = rows[i].role === 'Button' && rows[i].text.match(/^打开(.+)单曲窗口$/);
      if (!m) continue;
      title = m[1];
      const next = rows[i + 1];
      if (next && next.role === 'StaticText' && next.text.indexOf(title + '-') === 0) artist = next.text.slice(title.length + 1);
      break;
    }
    if (!title) {
      // 退路：时间前面第一条「歌名-歌手」样式的文字
      for (let i = ctrl - 3; i >= Math.max(0, ctrl - 6); i--) {
        const m = rows[i].role === 'StaticText' && rows[i].text.match(/^(.+?)-([^-]+)$/);
        if (m) { title = m[1]; artist = m[2]; break; }
      }
    }
    if (!title) return null;
    const state = rows[ctrl + 1] && rows[ctrl + 1].text;
    return {
      title, artist, album: '',
      duration: times.length === 2 ? toSec(times[1]) : 0,
      elapsed: times.length >= 1 ? toSec(times[0]) : 0,
      rate: state === '暂停' ? 1 : 0, timestamp: Date.now(), app: 'com.tencent.QQMusicMac',
    };
  }

  async function readQQ() {
    if (!isHelperReady()) return null;
    const out = await run(helperBin, ['texts', 'com.tencent.QQMusicMac']).catch(() => '');
    return out ? parseQQ(out) : null;
  }

  // 自动：QQ 音乐优先（正在播放的那个优先），其次 Apple Music。没有 iPad 在看时不轮询。
  async function pollAuto() {
    if (!isActive()) return;
    const qq = await readQQ();
    if (qq && qq.rate > 0) return setTrack(qq);
    const before = track;
    await pollMusic();
    if ((!track || !track.rate) && qq) setTrack(qq); // 都没在播：显示 QQ 音乐暂停中的歌
    else if (!track && before && before.app) track = null;
  }

  // Apple Music：每 2 秒查询一次（未运行时只做一次很轻的 is running 检查）
  async function pollMusic() {
    const out = await run('/usr/bin/osascript', ['-e', MUSIC_SCRIPT]).catch(() => 'none');
    const parts = out.replace(/\n$/, '').split('\t');
    if (parts.length < 6) { setTrack(null); return; }
    setTrack({
      title: parts[1], artist: parts[2], album: parts[3],
      duration: parseFloat(parts[4]) || 0, elapsed: parseFloat(parts[5]) || 0,
      rate: parts[0] === 'playing' ? 1 : 0, timestamp: Date.now(), app: 'com.apple.Music',
    });
  }

  // 系统级：常驻 perl 进程，逐行输出 JSON
  async function startSystem() {
    const src = path.join(root, 'helper', 'nowplaying.m');
    const dylib = path.join(root, 'helper', 'nowplaying.dylib');
    let fresh = false;
    try { fresh = fs.statSync(dylib).mtimeMs >= fs.statSync(src).mtimeMs; } catch (e) { /* 需要编译 */ }
    if (!fresh) {
      try {
        await run('/usr/bin/clang', ['-fobjc-arc', '-O2', '-dynamiclib', '-framework', 'Foundation', src, '-o', dylib], { timeout: 120000 });
      } catch (e) {
        log('  编译 nowplaying.dylib 失败：' + e.message.split('\n')[0]);
        return;
      }
    }
    if (source !== 'system' || child) return;
    child = spawn('/usr/bin/perl', ['-e', 'use DynaLoader; DynaLoader::dl_load_file($ARGV[0], 0) or die DynaLoader::dl_error();', dylib], {
      env: Object.assign({}, process.env, { NP_RUN: '1', NP_ART_DIR: artDir }), stdio: ['pipe', 'pipe', 'pipe'],
    });
    let buf = '';
    child.stdout.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        try {
          const o = JSON.parse(line);
          setTrack(o.title ? {
            title: o.title, artist: o.artist || '', album: o.album || '', duration: +o.duration || 0,
            elapsed: +o.elapsed || 0, rate: +o.rate || 0, timestamp: +o.timestamp || Date.now(), artFile: o.artFile || null,
          } : null);
        } catch (e) { /* 忽略不完整的行 */ }
      }
    });
    child.stderr.on('data', (d) => log('  nowplaying: ' + String(d).trim()));
    child.on('exit', () => {
      child = null;
      if (source === 'system') childRestart = setTimeout(startSystem, 5000);
    });
  }

  function stopAll() {
    clearInterval(pollTimer);
    clearTimeout(childRestart);
    pollTimer = null;
    if (child) { const c = child; child = null; c.kill(); }
    track = null;
  }

  // 根据设置切换来源（设置变化时调用）
  function sync() {
    // NP_DEMO=1：开发调试用，模拟正在播放（不读取任何播放器）
    const want = process.env.NP_DEMO ? 'demo' : (getSettings().nowPlaying) || 'auto';
    if (want === source) return;
    stopAll();
    source = want;
    if (want === 'demo') setTrack({ title: '晴天', artist: '周杰伦', album: '叶惠美', duration: 269, elapsed: 26, rate: 1, timestamp: Date.now() });
    else if (want === 'auto') { pollAuto(); pollTimer = setInterval(pollAuto, 1500); }
    else if (want === 'music') { pollMusic(); pollTimer = setInterval(() => { if (isActive()) pollMusic(); }, 2000); }
    else if (want === 'system') startSystem();
  }

  // ---------- 歌词与封面 ----------

  async function loadLyrics(t) {
    const cacheFile = path.join(lyricDir, t.id + '.json');
    try {
      info = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      info.id = t.id;
      return;
    } catch (e) { /* 未缓存 */ }
    info = { id: t.id, status: 'loading', lines: [] };
    if (getSettings().lyricsOnline === false) { info = { id: t.id, status: 'none', lines: [] }; return; }

    // 中日韩歌曲 QQ 音乐最全；其它语言网易云常带中文翻译，优先网易云
    const cjk = /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(t.title + t.artist);
    let res = null;
    for (const fn of cjk ? [fromQQ, fromNetease, fromLrclib] : [fromNetease, fromQQ, fromLrclib]) {
      try { res = await fn(t); } catch (e) { res = null; }
      if (res) break;
    }
    if (!track || track.id !== t.id) return; // 期间已切歌

    const result = { id: t.id, status: res ? 'ok' : 'none', source: res && res.source, lines: res ? res.lines : [], art: false };
    // 封面：优先播放器自带，其次歌词来源提供的专辑图
    const artFile = path.join(artDir, t.id + '.jpg');
    let haveArt = false;
    if (t.artFile && fs.existsSync(t.artFile)) {
      haveArt = await run('/usr/bin/sips', ['-s', 'format', 'jpeg', '-Z', '500', t.artFile, '--out', artFile]).then(() => true, () => false);
    }
    if (!haveArt && res && res.art) haveArt = await download(res.art, artFile);
    if (haveArt && isHelperReady()) {
      await run(helperBin, ['blur', artFile, path.join(artDir, t.id + '-blur.jpg')]).catch(() => {});
      // 封面主色，用作歌词页的强调色（进度条、迷你播放器）
      try { result.tint = JSON.parse(await run(helperBin, ['color', artFile])).tint || null; } catch (e) { /* 无主色 */ }
    }
    result.art = haveArt;
    info = result;
    // 只缓存成功的结果；没找到的下次切到这首歌时会重试
    if (res) fs.writeFile(cacheFile, JSON.stringify(result), () => {});
  }

  function state() {
    if (!track) return { active: false, source };
    const now = Date.now();
    const pos = track.elapsed + (track.rate ? (now - track.timestamp) / 1000 * track.rate : 0);
    return {
      active: true,
      source,
      id: track.id,
      title: track.title,
      artist: track.artist,
      album: track.album,
      duration: track.duration,
      position: Math.max(0, track.duration ? Math.min(pos, track.duration) : pos),
      playing: track.rate > 0,
      app: track.app || null,
      lyrics: info && info.id === track.id ? info.status : 'loading',
      art: !!(info && info.id === track.id && info.art),
      tint: (info && info.id === track.id && info.tint) || null,
    };
  }

  function lyrics(id) {
    return info && info.id === id ? { status: info.status, source: info.source, lines: info.lines } : { status: 'loading', lines: [] };
  }

  function artPath(id, blur) {
    if (!/^[0-9a-f]{16}$/.test(id)) return null;
    const f = path.join(artDir, id + (blur ? '-blur' : '') + '.jpg');
    return fs.existsSync(f) ? f : null;
  }

  // 刚按了播放 / 切歌键后，尽快刷新一次
  function nudge() {
    if (source === 'music') setTimeout(pollMusic, 350);
    if (source === 'auto') { setTimeout(pollAuto, 300); setTimeout(pollAuto, 900); }
  }

  return { sync, state, lyrics, artPath, nudge };
}

// QQ 音乐主窗口里的「待播列表」：辅助功能文字里，「待播列表」「N首」之后是一串「播放 歌名」按钮
function parseQQQueue(texts) {
  const lines = String(texts || '').split('\n');
  const at = lines.findIndex((l) => l === 'StaticText\t待播列表');
  if (at < 0) return null;
  let total = 0, i = at + 1;
  const m = (lines[i] || '').match(/^StaticText\t(\d+)首$/);
  if (m) { total = Number(m[1]); i++; }
  const songs = [];
  for (; i < lines.length && songs.length < 100; i++) {
    const b = lines[i].match(/^Button\t播放 (.+)$/);
    if (!b) break;
    songs.push(b[1]);
  }
  return { total: total || songs.length, songs };
}

module.exports = { createNowPlaying, parseLrc, norm, score, fromQQ, fromNetease, fromLrclib, parseQQQueue };
