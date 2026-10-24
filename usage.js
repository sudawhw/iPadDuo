// AI 用量（主屏幕「AI 用量」磁贴）：只读取本机日志里的数字，不读取对话内容。
//   Claude Code：~/.claude/projects/**/*.jsonl 里每条回复的 usage；按 ccusage 的做法划分 5 小时计费窗口
//   Codex：~/.codex/sessions/年/月/日/*.jsonl 里最新的 token_count 事件，自带 5 小时 / 每周额度的已用百分比与重置时间
// 增量读取（记住每个文件读到的位置），最多 30 秒刷新一次；文件不存在时对应部分返回 null。
'use strict';

const fs = require('fs');
const path = require('path');

const HOUR = 3600 * 1000;
const BLOCK = 5 * HOUR;

function dayStart(now) { const d = new Date(now); d.setHours(0, 0, 0, 0); return d.getTime(); }

// 5 小时窗口：从第一条消息所在整点开始；超过 5 小时或中间空闲超过 5 小时就开新窗口
function blocks(entries) {
  const out = [];
  let cur = null;
  entries.slice().sort((a, b) => a.t - b.t).forEach((e) => {
    if (!cur || e.t >= cur.start + BLOCK || e.t - cur.last >= BLOCK) {
      const s = new Date(e.t); s.setMinutes(0, 0, 0);
      cur = { start: s.getTime(), end: s.getTime() + BLOCK, last: e.t, tokens: 0, output: 0, messages: 0 };
      out.push(cur);
    }
    cur.last = e.t; cur.tokens += e.total; cur.output += e.output; cur.messages++;
  });
  return out;
}

function sumTokens(u) {
  return (u.input_tokens || 0) + (u.output_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
}

function createUsage({ home }) {
  const claudeDir = path.join(home, '.claude', 'projects');
  const codexDir = path.join(home, '.codex', 'sessions');
  const files = new Map(); // 路径 → { offset, rest }
  const entries = new Map(); // 去重键 → { t, total, output, model }
  let cache = null, cacheAt = 0, pending = null;

  function listJsonl(dir, depth, since, out) {
    let names;
    try { names = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
    for (const d of names) {
      const p = path.join(dir, d.name);
      if (d.isDirectory() && depth > 0) listJsonl(p, depth - 1, since, out);
      else if (d.isFile() && d.name.endsWith('.jsonl')) {
        try { const s = fs.statSync(p); if (s.mtimeMs >= since) out.push({ p, size: s.size, mtime: s.mtimeMs }); } catch (e) { /* 刚被删除 */ }
      }
    }
    return out;
  }

  // 只解析含 usage 的行；按 消息 id + 请求 id 去重（同一条回复可能被记录多次）
  function readClaude(now) {
    const since = now - 30 * HOUR;
    for (const f of listJsonl(claudeDir, 3, since, [])) {
      const st = files.get(f.p) || { offset: 0, rest: '' };
      if (f.size < st.offset) { st.offset = 0; st.rest = ''; } // 文件被重写
      if (f.size === st.offset) { files.set(f.p, st); continue; }
      const fd = fs.openSync(f.p, 'r');
      try {
        const len = Math.min(f.size - st.offset, 64 * 1024 * 1024);
        const buf = Buffer.alloc(len);
        fs.readSync(fd, buf, 0, len, st.offset);
        st.offset += len;
        const text = st.rest + buf.toString('utf8');
        const lines = text.split('\n');
        st.rest = lines.pop();
        for (const line of lines) {
          if (line.indexOf('"usage"') < 0 || line.indexOf('"timestamp"') < 0) continue;
          let d; try { d = JSON.parse(line); } catch (e) { continue; }
          const u = d.message && d.message.usage;
          const t = Date.parse(d.timestamp);
          if (!u || !t || t < since) continue;
          const key = (d.message.id || d.uuid) + ':' + (d.requestId || '');
          entries.set(key, { t, total: sumTokens(u), output: u.output_tokens || 0, model: d.message.model || '' });
        }
      } finally { fs.closeSync(fd); }
      files.set(f.p, st);
    }
    entries.forEach((e, k) => { if (e.t < since) entries.delete(k); });
    if (!fs.existsSync(claudeDir)) return null;
    const list = [...entries.values()];
    const today = dayStart(now);
    const todayList = list.filter((e) => e.t >= today);
    const bs = blocks(list), lastBlock = bs[bs.length - 1];
    const active = lastBlock && now < lastBlock.end && now - lastBlock.last < BLOCK ? lastBlock : null;
    const models = {};
    todayList.forEach((e) => { const m = e.model.replace(/^claude-/, '').replace(/-\d{8}$/, ''); models[m] = (models[m] || 0) + e.total; });
    return {
      today: { tokens: todayList.reduce((s, e) => s + e.total, 0), output: todayList.reduce((s, e) => s + e.output, 0), messages: todayList.length, models },
      block: active ? { start: active.start, end: active.end, tokens: active.tokens, messages: active.messages } : null,
    };
  }

  function tail(p, bytes) {
    const s = fs.statSync(p), len = Math.min(s.size, bytes), buf = Buffer.alloc(len);
    const fd = fs.openSync(p, 'r');
    try { fs.readSync(fd, buf, 0, len, s.size - len); } finally { fs.closeSync(fd); }
    return buf.toString('utf8');
  }

  function lastTokenCount(text) {
    const lines = text.split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].indexOf('"token_count"') < 0) continue;
      try {
        const d = JSON.parse(lines[i]);
        const p = d.payload || d;
        if (p.type === 'token_count') return { at: Date.parse(d.timestamp) || 0, info: p.info, rate: p.rate_limits };
      } catch (e) { /* 截断的第一行 */ }
    }
    return null;
  }

  function readCodex(now) {
    if (!fs.existsSync(codexDir)) return null;
    const list = listJsonl(codexDir, 3, now - 8 * 24 * HOUR, []).sort((a, b) => b.mtime - a.mtime);
    let rate = null, rateAt = 0, todayTokens = 0;
    const today = dayStart(now);
    for (const f of list) {
      if (rate && f.mtime < today) break;
      let tc;
      try { tc = lastTokenCount(tail(f.p, 256 * 1024)); } catch (e) { continue; }
      if (!tc) continue;
      if (!rate && tc.rate && tc.rate.primary) { rate = tc.rate; rateAt = tc.at || f.mtime; }
      if (f.mtime >= today && tc.info && tc.info.total_token_usage) todayTokens += tc.info.total_token_usage.total_tokens || 0;
    }
    const win = (w) => w ? { used: w.used_percent, minutes: w.window_minutes, resetsAt: w.resets_at ? w.resets_at * 1000 : (w.resets_in_seconds ? rateAt + w.resets_in_seconds * 1000 : 0) } : null;
    return { at: rateAt, primary: rate ? win(rate.primary) : null, secondary: rate ? win(rate.secondary) : null, todayTokens };
  }

  async function get() {
    if (cache && Date.now() - cacheAt < 30000) return cache;
    if (pending) return pending;
    pending = new Promise((resolve) => setImmediate(() => {
      const now = Date.now();
      let claude = null, codex = null;
      try { claude = readClaude(now); } catch (e) { claude = null; }
      try { codex = readCodex(now); } catch (e) { codex = null; }
      cache = { at: now, claude, codex }; cacheAt = now; pending = null;
      resolve(cache);
    }));
    return pending;
  }

  return { get };
}

module.exports = { createUsage, blocks };
