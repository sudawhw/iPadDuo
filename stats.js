// Mac 系统状态（主屏幕状态磁贴用）：CPU、内存、磁盘、网络、电池、运行时间、最忙的应用。
// 只在有 iPad 正在显示状态磁贴时按需采样（接口被调用才计算），结果缓存 1.5 秒，不常驻轮询。
'use strict';

const os = require('os');
const fs = require('fs');

function parseVmStat(out) {
  const page = Number((out.match(/page size of (\d+) bytes/) || [])[1]) || 16384;
  const get = (name) => Number((out.match(new RegExp('Pages ' + name + ':\\s+(\\d+)')) || [])[1]) || 0;
  // 与「活动监视器」的「已使用内存」口径接近：App 内存（活跃）+ 联动（wired）+ 被压缩
  const used = (get('active') + get('wired down') + get('occupied by compressor')) * page;
  return { used, cached: (get('inactive') + get('purgeable')) * page };
}

// netstat -ibn：每个接口一行 <Link#n>，累计收发字节；只统计物理网卡（en*），不算回环、VPN 隧道
function parseNetstat(out) {
  let rx = 0, tx = 0;
  out.split('\n').forEach((line) => {
    const c = line.trim().split(/\s+/);
    if (c.length < 10 || !/^en\d+$/.test(c[0]) || !/^<Link#/.test(c[2])) return;
    // 有 MAC 地址的行多一列：从右往左数更稳
    const ib = Number(c[c.length - 5]), ob = Number(c[c.length - 2]);
    if (Number.isFinite(ib)) rx += ib;
    if (Number.isFinite(ob)) tx += ob;
  });
  return { rx, tx };
}

function parseBattery(out) {
  const m = out.match(/(\d+)%;\s*([^;]+);/);
  if (!m) return null; // 台式机（Mac mini / Studio）没有电池
  return { percent: Number(m[1]), state: m[2].trim(), ac: /AC Power/.test(out) };
}

function parseTop(out) {
  return out.split('\n').slice(1).map((l) => l.trim().match(/^([\d.]+)\s+([\d.]+)\s+(.+)$/)).filter(Boolean)
    .map((m) => ({ cpu: Number(m[1]), mem: Number(m[2]), name: m[3] })).filter((p) => p.name !== 'kernel_task').slice(0, 3);
}

function createStats({ run }) {
  let last = null, lastAt = 0, pending = null, prevCpu = null, prevNet = null;
  const model = { chip: '', name: os.hostname().replace(/\.local$/, '') };
  run('/usr/sbin/sysctl', ['-n', 'machdep.cpu.brand_string']).then((o) => { model.chip = o.trim(); }, () => {});

  function cpuSample() {
    const t = os.cpus().reduce((a, c) => { const x = c.times; a.idle += x.idle; a.total += x.user + x.nice + x.sys + x.irq + x.idle; return a; }, { idle: 0, total: 0 });
    const p = prevCpu; prevCpu = t;
    if (!p || t.total <= p.total) return null;
    return Math.max(0, Math.min(100, 100 * (1 - (t.idle - p.idle) / (t.total - p.total))));
  }

  async function sample() {
    const now = Date.now();
    const [vm, net, batt, top, swap] = await Promise.all([
      run('/usr/bin/vm_stat', []).catch(() => ''),
      run('/usr/sbin/netstat', ['-ibn']).catch(() => ''),
      run('/usr/bin/pmset', ['-g', 'batt']).catch(() => ''),
      run('/bin/ps', ['-Aceo', 'pcpu,pmem,comm', '-r']).then((o) => o.split('\n').slice(0, 6).join('\n')).catch(() => ''),
      run('/usr/sbin/sysctl', ['-n', 'vm.swapusage']).catch(() => ''),
    ]);
    const mem = parseVmStat(vm), total = os.totalmem();
    const n = parseNetstat(net), pn = prevNet; prevNet = { at: now, rx: n.rx, tx: n.tx };
    const dt = pn ? (now - pn.at) / 1000 : 0;
    let disk = null;
    try {
      const s = fs.statfsSync('/System/Volumes/Data');
      disk = { total: s.blocks * s.bsize, free: s.bavail * s.bsize };
    } catch (e) { /* 旧版 Node 没有 statfs */ }
    const swapUsed = Number((swap.match(/used = ([\d.]+)M/) || [])[1]) || 0;
    return {
      at: now, host: model.name, chip: model.chip,
      cpu: { usage: cpuSample(), cores: os.cpus().length, load: os.loadavg().map((x) => Math.round(x * 100) / 100) },
      mem: { total, used: Math.min(total, mem.used), swap: swapUsed * 1048576 },
      disk,
      net: pn && dt > 0.2 ? { rx: Math.max(0, (n.rx - pn.rx) / dt), tx: Math.max(0, (n.tx - pn.tx) / dt) } : { rx: 0, tx: 0 },
      battery: parseBattery(batt),
      uptime: Math.round(os.uptime()),
      top: parseTop(top),
    };
  }

  // 两次采样之间至少隔 1.5 秒（CPU 与网速需要差值）；并发请求共用一次采样
  async function get() {
    if (last && Date.now() - lastAt < 1500) return last;
    if (pending) return pending;
    if (!prevCpu) { cpuSample(); }
    pending = sample().then((r) => { last = r; lastAt = Date.now(); pending = null; return r; }, (e) => { pending = null; throw e; });
    return pending;
  }

  return { get };
}

module.exports = { createStats, parseVmStat, parseNetstat, parseBattery, parseTop };
