const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseVmStat, parseNetstat, parseBattery, parseTop } = require('../stats.js');
const { createUsage, blocks } = require('../usage.js');

test('system status parsers read macOS command output', () => {
  const vm = 'Mach Virtual Memory Statistics: (page size of 16384 bytes)\nPages free: 100.\nPages active: 1000.\nPages inactive: 50.\nPages wired down: 500.\nPages occupied by compressor: 250.\nPages purgeable: 10.\n';
  assert.equal(parseVmStat(vm).used, (1000 + 500 + 250) * 16384);
  const net = [
    'Name       Mtu   Network       Address            Ipkts Ierrs     Ibytes    Opkts Oerrs     Obytes  Coll',
    'lo0        16384 <Link#1>                       2024753     0 11487308128  2024753     0 11487308128     0',
    'en0        1500  <Link#11>   aa:bb:cc:dd:ee:ff  100     0     5000      90     0     3000     0',
    'en0        1500  192.168.5     192.168.5.198    100     -     5000      90     -     3000     -',
    'en1        1500  <Link#12>   aa:bb:cc:dd:ee:00  10      0     700       9      0     300      0',
    'utun3      1500  <Link#20>                       10      0     99999     9      0     99999    0',
  ].join('\n');
  assert.deepEqual(parseNetstat(net), { rx: 5700, tx: 3300 }); // 只算物理网卡的 Link 行
  assert.equal(parseBattery("Now drawing from 'AC Power'\n"), null); // 台式机
  assert.deepEqual(parseBattery(" -InternalBattery-0 (id=1)\t87%; charging; 0:42 remaining present: true"), { percent: 87, state: 'charging', ac: false });
  assert.equal(parseTop(' %CPU %MEM COMM\n 40.5  0.6 WindowServer\n 31.8  4.9 Claude Helper (Renderer)\n').map((p) => p.name).join('|'), 'WindowServer|Claude Helper (Renderer)');
});

test('Claude usage is split into 5-hour windows starting on the hour', () => {
  const H = 3600000, t0 = Date.UTC(2026, 9, 25, 9, 20);
  const bs = blocks([{ t: t0, total: 10, output: 1 }, { t: t0 + 2 * H, total: 5, output: 1 }, { t: t0 + 6 * H, total: 7, output: 2 }]);
  assert.equal(bs.length, 2);
  assert.equal(new Date(bs[0].start).getUTCMinutes(), 0);
  assert.equal(bs[0].end - bs[0].start, 5 * H);
  assert.equal(bs[0].tokens, 15);
  assert.equal(bs[1].tokens, 7);
});

test('usage reads only numbers from local logs, dedupes, and reports Codex reset times', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ipadduo-usage-'));
  const proj = path.join(home, '.claude', 'projects', 'p');
  fs.mkdirSync(proj, { recursive: true });
  const now = new Date().toISOString();
  const line = (id) => JSON.stringify({ type: 'assistant', timestamp: now, requestId: 'r' + id, message: { id: 'm' + id, model: 'claude-x', content: [{ type: 'text', text: '秘密内容' }], usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 100, cache_creation_input_tokens: 0 } } });
  fs.writeFileSync(path.join(proj, 's.jsonl'), [line(1), line(1), line(2), '{"type":"user"}'].join('\n') + '\n');
  const day = new Date(); const dir = path.join(home, '.codex', 'sessions', String(day.getFullYear()), String(day.getMonth() + 1).padStart(2, '0'), String(day.getDate()).padStart(2, '0'));
  fs.mkdirSync(dir, { recursive: true });
  const reset = Math.floor(Date.now() / 1000) + 3600;
  fs.writeFileSync(path.join(dir, 'rollout.jsonl'), JSON.stringify({ timestamp: now, type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { total_tokens: 1234 } }, rate_limits: { primary: { used_percent: 47, window_minutes: 300, resets_at: reset }, secondary: { used_percent: 7, window_minutes: 10080, resets_at: reset + 86400 } } } }) + '\n');
  const u = await createUsage({ home }).get();
  assert.equal(u.claude.today.tokens, 230); // 重复记录只算一次
  assert.equal(u.claude.today.messages, 2);
  assert(u.claude.block && u.claude.block.end > Date.now());
  assert.equal(u.codex.primary.used, 47);
  assert.equal(u.codex.primary.resetsAt, reset * 1000);
  assert.equal(u.codex.todayTokens, 1234);
  assert(!JSON.stringify(u).includes('秘密内容'));
});
