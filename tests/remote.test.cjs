const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { backend, frontend, encode, messages } = require('./helpers.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));

test('watch controls tolerate absent optional buttons', () => {
  const a = frontend(); a.api.ctl.kind = 'browser';
  assert.doesNotThrow(() => a.api.videoApply({ kind: 'browser', video: { ok: 1, d: 100, t: 1 }, tab: {} }));
});
test('busy gates work before request starts and restores button', async () => {
  const a = frontend(), b = a.element('button'); let calls = 0, finish;
  const work = () => { calls++; return new Promise(r => { finish = r; }); };
  const p1 = a.api.busy(b, work), p2 = a.api.busy(b, work); await tick();
  assert.equal(calls, 1); assert.equal(b.disabled, true); assert.equal(p1, p2);
  finish({ ok: true }); await p1; assert.equal(b.disabled, false);
});
test('same path at 30/60/120Hz yields the same pointer displacement', () => {
  const totals = [];
  for (const hz of [30,60,120]) {
    const a = frontend(); a.api.tp.mode = 'pad';
    a.element('tpPad').events.touchstart[0](a.event(0, 1, 'touchstart'));
    for (let i = 1; i <= hz; i++) { a.now(10000 + i * 1000 / hz); a.element('tpPad').events.touchmove[0](a.event(i * 120 / hz)); }
    totals.push(a.sent.filter(m => m.t === 'm').reduce((s,m) => s + m.x, 0));
  }
  assert(Math.max(...totals) - Math.min(...totals) < 0.02, JSON.stringify(totals));
});
test('touchcancel never clicks or starts inertia in either mode', () => {
  for (const mode of ['pad','screen']) {
    const a = frontend(); a.api.tp.mode = mode; a.api.scr.meta = { frameId: 'f1', wid: 11, w: 1024, h: 650, pw: 1024, ph: 650 };
    a.element('tpPad').events.touchstart[0](a.event(100,1,'touchstart')); a.now(10050);
    a.element('tpPad').events.touchcancel[0](a.event(100,0,'touchcancel'));
    assert(!a.sent.some(m => ['tap','c','s','sa'].includes(m.t))); assert(a.sent.some(m => m.t === 'release'));
  }
});
test('outside drag release and mode switch always release without coordinates', () => {
  const a = frontend(); a.api.tp.mode = 'screen'; a.api.scr.g = { mode: 'drag', t: 9000, x: 1500, y: 100 };
  a.api.scrTouchEnd(a.event(1500,0,'touchend')); assert(a.sent.some(m => m.t === 'pu'));
  a.api.scr.g = { mode: 'drag' }; a.api.tpSetMode('pad');
  assert.equal(a.api.scr.g, null); assert(a.sent.some(m => m.t === 'release'));
});
test('inertia integrates elapsed time and stops after a long scheduling pause', () => {
  const a = frontend(); a.api.tp.mode = 'pad'; a.api.tpInertia(1,0); a.advance(160);
  const distance = a.sent.filter(m => m.t === 's').reduce((s,m) => s + m.x, 0);
  assert(distance > 90 && distance < 120, distance);
  a.api.tpStopInertia(); const before = a.sent.length; a.advance(1000); assert.equal(a.sent.length,before);
});
test('iOS 12 subscription carries real 8fps and quality limits', () => {
  const a = frontend(); a.api.scr.on = true; a.api.scrSubscribe();
  const m = a.sent.find(m => m.t === 'screen' && m.on);
  assert.equal(m.fps,8); assert.equal(m.w,1024); assert.equal(m.q,0.55);
});
test('HTTP fallback batches and preserves movement before release', async () => {
  const a = frontend(); a.api.tp.ready = false;
  a.api.tpSend({ t:'m', x:2, y:0 }); a.api.tpSend({ t:'m', x:3, y:0 }); a.advance(30);
  assert.equal(a.requests.length,1); const first = JSON.parse(a.requests[0].body);
  assert.equal(first[0].x,5); assert(a.requests[0].headers['X-Deck-Client']);
  a.api.tpSend({ t:'u', b:'left' }); assert.equal(a.requests.length,1);
  a.requests[0].respond(200,{ok:true}); await tick(); assert.equal(a.requests.length,2);
  assert.equal(JSON.parse(a.requests[1].body)[0].t,'u');
});
test('stopped decode never commits or acknowledges a late frame', () => {
  const a = frontend(); a.api.scr.on = true; a.api.scr.streaming = true;
  a.api.scr.pendingMeta = { frameId:'f1',wid:11,x:0,y:0,w:1024,h:650,pw:1024,ph:650 };
  a.api.scrOnFrame({size:100}); const load = a.images[0].onload;
  a.api.scrStop(); load(); a.advance(20);
  assert.equal(a.api.scr.meta,null); assert(!a.sent.some(m => m.t === 'fack')); assert(a.revoked.length);
});
test('displayed frame id is attached to positioned input', () => {
  const a = frontend(); a.api.scr.meta = { frameId:'displayed-a' }; a.api.tpSend({t:'tap',nx:0.1234,ny:0.5});
  assert.equal(a.sent[0].frameId,'displayed-a');
});
test('sustained pressure lowers stream independently of UI', () => {
  const a = frontend({storage:{'deck-tier':'full'}}); const initialUI = a.api.PERF.uiTier;
  for (let i=0;i<12;i++) { a.now(10000+i*600); a.api.perfSample(140,200); }
  assert(a.api.PERF.level < 2); assert.equal(a.api.PERF.uiTier,initialUI);
});
test('HTTPS uses wss and includes the same HTTP client identity', () => {
  const a = frontend({protocol:'https:'}); a.api.tp.ws = null; a.api.tp.ready = false; a.api.tpConnect();
  assert(a.api.tp.ws.url.startsWith('wss://audit.invalid/ws?client='));
});
test('hidden page releases and unsubscribes, with no continued stream work', () => {
  const a = frontend(); a.api.boot(); a.api.tp.mode = 'screen'; a.api.scr.on = true; a.api.scr.streaming = true;
  a.context.document.hidden = true; a.docEvents.visibilitychange[0]();
  assert.equal(a.api.scr.on,false); assert(a.sent.some(m=>m.t==='release')); assert(a.sent.some(m=>m.t==='screen'&&!m.on));
});
test('backend preserves each displayed frame identity, not the newest captured geometry', () => {
  const a = backend(); try {
    const s = a.socket(); a.send(s,{t:'screen',on:true,w:1024,fps:8,q:.55});
    const c = a.children.find(c=>c.args[0]==='stream'); a.frame(c,{wid:11,x:0}); const old = messages(s).find(m=>m.t==='frame').meta;
    a.frame(c,{wid:22,x:2000}); a.send(s,{t:'tap',frameId:old.frameId,nx:.1234,ny:.5});
    const command = a.children.find(c=>c.args[0]==='serve').commands.at(-1);
    assert(command.startsWith('clickwin 11 0 0 1000 600 0.1234 0.5 '),command);
    a.send(s,{t:'tap',frameId:'not-delivered',nx:.5,ny:.5}); assert(messages(s).some(m=>m.t==='inputerr'));
  } finally {a.close();}
});
test('closing another client cannot release the active drag', () => {
  const a = backend(); try {
    const s1 = a.socket('client-test-a'), s2 = a.socket('client-test-b');
    a.send(s1,{t:'d',b:'left'}); s2.destroy();
    const c = a.children[0]; assert.equal(c.commands.filter(s=>s.startsWith('up ')).length,0);
    s1.destroy(); assert.equal(c.commands.at(-1),'up left');
  } finally {a.close();}
});
test('old process exit cannot clear a replacement stream; spawn errors are handled', async () => {
  const a = backend(); try {
    const s = a.socket(); a.send(s,{t:'screen',on:true,w:1024,fps:8});
    const old = a.children.find(c=>c.args[0]==='stream');
    a.send(s,{t:'screen',on:false}); await new Promise(r=>setTimeout(r,1050));
    a.send(s,{t:'screen',on:true,w:1024,fps:8}); const fresh = a.children.filter(c=>c.args[0]==='stream').at(-1);
    old.emit('exit',null,'SIGTERM'); a.frame(fresh); assert(messages(s).some(m=>m.t==='frame'));
    assert.doesNotThrow(()=>a.children[0].emit('error',new Error('mock ENOENT')));
  } finally {a.close();}
});
test('old and new devices get separate capture profiles and capture fps is honored', () => {
  const a = backend(); try {
    const old = a.socket('client-old-pad'), fast = a.socket('client-new-pad');
    a.send(old,{t:'screen',on:true,w:1024,fps:8,q:.55}); a.send(fast,{t:'screen',on:true,w:1600,fps:24,q:.65});
    const capture = a.children.filter(c=>c.args[0]==='stream');
    assert.equal(capture.length,2); assert.deepEqual(capture.map(c=>c.args[2]),['8','24']);
    assert(capture.every(c=>c.args[4]==='credit'));
  } finally {a.close();}
});
test('stream only requests another encoded frame after matching acknowledgement', async () => {
  const a = backend(); try {
    const s = a.socket(); a.send(s,{t:'screen',on:true,w:1024,fps:8}); const c = a.children.find(c=>c.args[0]==='stream');
    assert.equal(c.commands.filter(c=>c==='credit').length,1); a.frame(c);
    const fid = messages(s).find(m=>m.t==='frame').meta.frameId;
    a.send(s,{t:'fack',frameId:'old'}); assert.equal(c.commands.filter(c=>c==='credit').length,1);
    a.send(s,{t:'fack',frameId:fid}); await new Promise(r=>setTimeout(r,145));
    assert.equal(c.commands.filter(c=>c==='credit').length,2);
  } finally {a.close();}
});
test('HTTP capture after streaming returns real image bytes and a separate frame id', async () => {
  const a = backend(); try {
    const s = a.socket(); a.send(s,{t:'screen',on:true,w:1024,fps:8}); a.frame(a.children.find(c=>c.args[0]==='stream'));
    const pending = a.api.frame(768,'client-http-a');
    const cap = a.children.find(c=>c.args[0]==='capture'); assert(cap);
    const command = cap.commands[0]; const file = command.slice(command.indexOf(' ',6)+1);
    fs.writeFileSync(file,Buffer.from('HTTP-JPEG'));
    cap.stdout.emit('data',Buffer.from(JSON.stringify({ok:1,wid:11,x:0,y:0,w:1000,h:600,pw:768,ph:460})+'\n'));
    const f = await pending; assert.equal(f.jpg.toString(),'HTTP-JPEG'); assert(f.meta.frameId);
  } finally {a.close();}
});
test('capture output overflow rejects the pending frame instead of growing memory', async () => {
  const a = backend(); try {
    const pending = a.api.frame(768,'client-overflow');
    const cap = a.children.find(c=>c.args[0]==='capture'); assert(cap);
    cap.stdout.emit('data',Buffer.alloc(1024*1024+1,120));
    const result = await pending;
    assert.equal(result.error,'overflow');
  } finally {a.close();}
});
test('input sequence discards delayed movement after release', () => {
  const a = backend(); try {
    a.api.handle({t:'d',seq:1},'client-order-a'); a.api.handle({t:'release',seq:3},'client-order-a');
    assert.equal(a.api.handle({t:'m',seq:2,x:100,y:0},'client-order-a'),false);
    assert.equal(a.children[0].commands.at(-1),'up left');
  } finally {a.close();}
});
test('fragmented WebSocket commands and missing upgrade header are safe', () => {
  const a = backend(); try {
    const s = a.socket(), text = JSON.stringify({t:'m',x:2,y:0});
    s.emit('data',encode(text.slice(0,7),false,1)); s.emit('data',encode(text.slice(7),true,0));
    assert.equal(a.children[0].commands.at(-1),'move 2 0');
    assert.doesNotThrow(()=>a.api.upgrade({headers:{}},{ end() {} },()=>true));
  } finally {a.close();}
});

test('watch rendering removes hidden duplicate control ids', () => {
  const a = frontend(); a.api.tp.mode = 'screen'; a.api.tp.view = 'watch';
  a.element('tpCtrl').innerHTML = '<b id="cvCur">old</b>';
  a.api.ctlRender({kind:'browser'});
  assert.equal(a.element('tpCtrl').innerHTML,''); assert(a.element('tpOverlay').innerHTML.includes('id="cvCur"'));
});
test('an acknowledgement from an old subscription cannot unlock a new one', () => {
  const a=backend();try {
    const s=a.socket();a.send(s,{t:'screen',on:true,w:1024,fps:8,subscription:'old'});
    const c=a.children.find(c=>c.args[0]==='stream');a.frame(c);
    a.send(s,{t:'screen',on:true,w:1024,fps:8,subscription:'new'});
    const current=messages(s).filter(m=>m.t==='frame').at(-1);
    a.send(s,{t:'fack',frameId:current.meta.frameId,subscription:'old'});
    assert.equal(c.commands.filter(x=>x==='credit').length,1);
  } finally {a.close();}
});
test('IME confirmation does not send Enter to the Mac', () => {
  const a=frontend();a.api.tp.composing=true;
  a.element('tpInput').events.keydown[0]({keyCode:13,preventDefault(){}});
  assert(!a.sent.some(m=>m.t==='k'));
});
test('pointer precision survives the complete client and input-service path', () => {
  const totals=[];
  for(const hz of [30,60,120]) {
    const a=frontend(),b=backend();try {
      a.api.tp.mode='pad';a.element('tpPad').events.touchstart[0](a.event(0,1,'touchstart'));
      for(let i=1;i<=hz;i++){a.now(10000+i*1000/hz);a.element('tpPad').events.touchmove[0](a.event(i*120/hz));}
      for(const m of a.sent)b.api.handle(m,'client-precision');
      totals.push(b.children[0].commands.filter(c=>c.startsWith('move ')).reduce((s,c)=>s+Number(c.split(' ')[1]),0));
    }finally{b.close();}
  }
  assert(Math.max(...totals)-Math.min(...totals)<.02,JSON.stringify(totals));
});
test('failed HTTP input keeps a release barrier before accepting new movement', async () => {
  const a=frontend();a.api.tp.ready=false;
  a.api.tpSend({t:'d',b:'left'});a.requests[0].onerror();await tick();
  assert.equal(JSON.parse(a.requests[1].body).t,'release');
  a.api.tpSend({t:'m',x:20,y:0});a.advance(30);assert.equal(a.requests.length,2);
  a.requests[1].respond(200,{ok:true});await tick();assert.equal(a.requests.length,3);
  assert.equal(JSON.parse(a.requests[2].body)[0].t,'m');
});
test('restoring a minimized remote view reconnects after background socket loss', () => {
  const a=frontend();a.api.tp.size='min';a.api.tp.mode='pad';a.api.tp.ws=null;a.api.tp.ready=false;
  a.api.tpSetSize('split');assert(a.api.tp.ws);assert(a.api.tp.ws.url.includes('/ws?client='));
});
test('web tiles reuse an existing tab for the same site', () => {
  const { pickTab } = require('../remote.js');
  const tabs = [{ w: 1, t: 1, url: 'https://www.google.com/' }, { w: 1, t: 2, url: 'https://www.youtube.com/watch?v=abc' }, { w: 2, t: 1, url: 'https://github.com/sudawhw/iPadDuo' }];
  assert.equal(pickTab('youtube.com', tabs).t, 2);
  assert.equal(pickTab('https://github.com/sudawhw/iPadDuo', tabs).w, 2);
  assert.equal(pickTab('https://github.com/sudawhw', tabs).w, 2);
  assert.equal(pickTab('https://github.com/other', tabs), null);
  assert.equal(pickTab('https://bilibili.com', tabs), null);
  assert.equal(pickTab('google.com', tabs).t, 1);
});
test('denied screen-recording permission is reported as a permission error, not a retry', () => {
  const { captureError } = require('../input.js');
  assert.equal(captureError('用户拒绝了应用程序、窗口、显示器捕捉的TCC'), 'screen-permission');
  assert.equal(captureError('The user declined TCCs for application, window, display capture'), 'screen-permission');
  assert.equal(captureError('no-window'), 'no-window');
  assert.equal(captureError(undefined), 'capture');
});
test('QQ Music up-next list is read from accessibility texts and stops at the first non-song button', () => {
  const { parseQQQueue } = require('../nowplaying.js');
  const q = parseQQQueue(['StaticText\t04:34', 'Button\t下一首', 'StaticText\t待播列表', 'StaticText\t50首',
    'Button\t播放 两只恋人', 'Button\t播放 High Fidelity (Album Version)', 'Button\t开启新对话', 'Button\t播放 《别的歌》'].join('\n'));
  assert.deepEqual(q, { total: 50, songs: ['两只恋人', 'High Fidelity (Album Version)'] });
  assert.equal(parseQQQueue('StaticText\t别的页面'), null);
});
