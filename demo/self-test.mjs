// 零依赖真实Chrome/CDP自测，不由index.html加载。
// 运行：node /absolute/path/demo/self-test.mjs
import {spawn} from 'node:child_process';
import {writeFile,rm,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {createServer} from 'node:net';
const root=dirname(fileURLToPath(import.meta.url));
const port=await new Promise((resolve,reject)=>{const server=createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const p=server.address().port;server.close(()=>resolve(p));});});
const profile=await mkdtemp(join(tmpdir(),'sid-demo-chrome-'));
const chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',[
  '--headless=new','--no-sandbox','--no-first-run','--no-default-browser-check','--disable-background-networking',
  '--disable-component-update','--disable-sync',`--remote-debugging-port=${port}`,
  '--remote-debugging-address=127.0.0.1',`--user-data-dir=${profile}`,'about:blank'
],{stdio:['ignore','ignore','pipe']});
let chromeLog='';chrome.stderr.on('data',chunk=>{chromeLog=(chromeLog+chunk.toString()).slice(-6000);});
let ws,id=0;const inflight=new Map(),errors=[],results=[];
const clipboard={systemReadback:false,permissionGrant:false,mode:'未尝试'};
const timeout=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function send(method,params={}) {return new Promise((resolve,reject)=>{const n=++id;const timer=setTimeout(()=>{inflight.delete(n);reject(Error('CDP timeout: '+method));},15000);inflight.set(n,{resolve:r=>{clearTimeout(timer);resolve(r);},reject:e=>{clearTimeout(timer);reject(e);}});ws.send(JSON.stringify({id:n,method,params}));});}
async function ev(expression) {const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text+' '+JSON.stringify(r.exceptionDetails.exception));return r.result.value;}
async function key(type,key,code,modifiers=0) {await send('Input.dispatchKeyEvent',{type,key,code,modifiers,windowsVirtualKeyCode:key==='Shift'?16:key===' '?32:key==='Enter'?13:key==='Escape'?27:key==='ArrowRight'?39:key.length===1?key.toUpperCase().charCodeAt(0):0});}
async function downShift(){await key('keyDown','Shift','ShiftLeft',8);}
async function upShift(){await key('keyUp','Shift','ShiftLeft',0);}
async function click(selector,modifiers=0){const r=await ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('missing '+${JSON.stringify(selector)});e.scrollIntoView({block:'nearest',inline:'nearest'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);await point(r.x,r.y,modifiers);}
async function point(x,y,modifiers=0){await send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1,modifiers});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1,modifiers});}
async function canvasClick(x,y){const r=await ev(`(()=>{const r=document.querySelector('canvas').getBoundingClientRect();const s=Math.min(r.width/960,r.height/640);return {x:r.x+(r.width-960*s)/2+${x}*s,y:r.y+(r.height-640*s)/2+${y}*s}})()`);await point(r.x,r.y);}
const snapshot=()=>ev('__sidTest.snapshot()');
const reset=(mode='good')=>ev(`__sidTest.reset('${mode}')`);
const select=n=>ev(`__sidTest.select(${n})`);
const advance=n=>ev(`__sidTest.advance(${n})`);
const query=value=>ev(`(()=>{const s=document.querySelector('#search');s.value=${JSON.stringify(value)};s.dispatchEvent(new Event('input'));return [...document.querySelectorAll('#roster-items [data-player]')].map(e=>+e.dataset.player)})()`);
// 名单搜索：真实 input 事件驱动，返回当前命中顺序；命中来源取行内渲染文本。
const setSearch=value=>ev(`(()=>{const s=document.querySelector('#search');s.value=${JSON.stringify(value)};s.dispatchEvent(new Event('input'));return [...document.querySelectorAll('#roster-items [data-player]')].map(e=>+e.dataset.player)})()`);
const hintOf=id=>ev(`(()=>{const e=document.querySelector('#roster [data-player="${id}"] .roster-match');return e?e.textContent:null})()`);
const openRoster=async()=>{if(await ev("document.querySelector('#roster').hidden"))await click('#roster-toggle');};
const closeRoster=async()=>{if(!(await ev("document.querySelector('#roster').hidden")))await click('#roster-close');};
// 独立验收 oracle：只描述固定测试数据的真值，不读取生产搜索函数。
const traitPools={saying:['先喝口水','马上就好','有点意思','稳住别慌','让我想想'],food:['番茄面','饺子','咖喱饭','火锅','三明治'],sport:['羽毛球','游泳','骑行','篮球','跑步']};
const traitLabels={saying:'口头禅',food:'爱吃的食物',sport:'喜欢的运动'};
const colorLabels={hair:'发色',top:'上衣颜色',pants:'裤子颜色',shoes:'鞋颜色'};
const expectedTrait=(id,key)=>traitPools[key][id%5];
const initiallyPublic=(id,key)=>id===5||(key==='saying'&&id%3===0)||(key==='food'&&id%4===0);
function expectedNonNameHits(p,rawQuery){
  const q=String(rawQuery).trim().toLowerCase(),hits=[];
  for(const [key,label] of Object.entries(colorLabels))if(p.colors[key][0].toLowerCase().includes(q))hits.push(`${label}：${p.colors[key][0]}`);
  for(const [key,label] of Object.entries(traitLabels))if(p.traits[key]!=='***'&&(p.traits[key].toLowerCase().includes(q)||label===q))hits.push(`${label}：${p.traits[key]}`);
  return hits;
}
function parseHint(text){
  if(!text||/\*\*\*|未公开|隐藏|未知/.test(text))return null;
  const match=text.match(/^(.*?)(?: 等(\d+)项)?$/);if(!match)return null;
  const shown=match[1].split(' · ').filter(Boolean);return {shown,total:match[2]?Number(match[2]):shown.length};
}
const judgeSamples=[
  {name:'精确字段名命中',actual:'口头禅'==='口头禅',expected:true},
  {name:'字段名前缀不命中',actual:'口头'==='口头禅',expected:false},
  {name:'隐藏真值枚举',actual:expectedTrait(10,'food')==='番茄面',expected:true},
  {name:'公开性命中',actual:initiallyPublic(5,'sport'),expected:true},
  {name:'公开性不命中',actual:initiallyPublic(0,'sport'),expected:false},
  {name:'单来源解析',actual:JSON.stringify(parseHint('口头禅：先喝口水')),expected:JSON.stringify({shown:['口头禅：先喝口水'],total:1})},
  {name:'多来源总数解析',actual:JSON.stringify(parseHint('发色：银白 · 上衣颜色：米白 等3项')),expected:JSON.stringify({shown:['发色：银白','上衣颜色：米白'],total:3})},
  {name:'泄露提示拒绝',actual:parseHint('口头禅：***')===null,expected:true}
];
const judgeSelfCheck={passed:judgeSamples.filter(x=>x.actual===x.expected).length,total:judgeSamples.length,samples:judgeSamples.map(x=>({name:x.name,pass:x.actual===x.expected}))};
async function test(name,fn){try{await fn();results.push({name,pass:true});console.log('PASS',name);}catch(e){results.push({name,pass:false,error:e.message});console.log('FAIL',name,e.message);}}
async function openPrivate(){if(!(await snapshot()).hold)await click('#private-gate');}
async function skill(button,input){await openPrivate();await click(button);if(input!==undefined){await click('#sid-input');await send('Input.insertText',{text:input});}await click('#confirm');}
async function settleCopy(){await ev('new Promise(resolve=>setTimeout(resolve,25))');}
async function mockCopy(selector,keyboard){
  const expected=await ev(`document.querySelector(${JSON.stringify(selector)}).textContent`);
  const count=await ev('__copyWrites.length');
  if(keyboard){await ev(`document.querySelector(${JSON.stringify(selector)}).focus()`);await key('keyDown',keyboard==='Space'?' ':'Enter',keyboard);await key('keyUp',keyboard==='Space'?' ':'Enter',keyboard);}
  else await click(selector);
  await settleCopy();
  assert.equal(await ev('__copyWrites.length'),count+1);
  assert.equal(await ev('__copyWrites.at(-1)'),expected);
  assert.equal(await ev("document.querySelector('#copy-toast').textContent"),'已复制');
  assert.equal(await ev("document.querySelector('#copy-toast').hidden"),false);
  return expected;
}
function checkLabels(s){for(const l of s.labels){assert.equal(l.ids.length,1);const p=s.projections[l.ids[0]];assert.equal(p.alive,true);assert.equal(l.x,p.x-72);assert.equal(l.y,p.y+12);assert.equal(l.w,144);assert.equal(l.h,31);}}
async function checkColors(panel,id){
  const colors=(await snapshot()).projections[id].colors;
  assert.equal(await ev(`document.querySelectorAll('${panel} .attribute').length`),4);
  assert.equal(await ev(`document.querySelectorAll('${panel} .swatch').length`),4);
  const values=await ev(`(()=>{return [...document.querySelectorAll('${panel} .attribute')].map(e=>({name:e.textContent.trim(),color:getComputedStyle(e.querySelector('.swatch')).backgroundColor}))})()`);
  const fields=['发色','上衣颜色','裤子颜色','鞋颜色'];
  Object.values(colors).forEach((c,i)=>{assert.equal(values[i].name,fields[i]+c[0]);const rgb=c[1].slice(1).match(/../g).map(v=>parseInt(v,16));assert.equal(values[i].color,`rgb(${rgb.join(', ')})`);});
}
try {
  let pages;
  for(let tries=0;tries<40;tries++){try{pages=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();break;}catch{await timeout(75);}}
  if(!pages)throw Error('Chrome CDP did not start');
  const page=pages.find(p=>p.type==='page'&&p.url==='about:blank')||pages.find(p=>p.type==='page');if(!page)throw Error('No Chrome page target');
  ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=inflight.get(m.id);if(p){inflight.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}if(m.method==='Runtime.exceptionThrown')errors.push(m.params);};
  await send('Runtime.enable');await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});await send('Page.bringToFront');
  await send('Page.navigate',{url:pathToFileURL(join(root,'index.html')).href+'?test'});
  await ev(`new Promise((resolve,reject)=>{let n=0;const f=()=>window.__sidTest?resolve(true):n++>150?reject(Error('Demo boot failed')):setTimeout(f,20);f()})`);
  await test(`判定工具自验：已知答案样本 ${judgeSelfCheck.passed}/${judgeSelfCheck.total} 通过`,async()=>{
    assert.equal(judgeSelfCheck.passed,judgeSelfCheck.total,JSON.stringify(judgeSelfCheck.samples.filter(x=>!x.pass)));
  });
  await test('file直接启动：20份公开投影、19存活、默认面板关闭',async()=>{
    const s=await snapshot();assert.equal(s.projections.length,20);assert.equal(s.projections.filter(p=>p.alive).length,19);
    assert.equal(await ev("['roster','logs','bad-slots','mine','target'].every(x=>document.getElementById(x).hidden)"),true);
  });
  await test('所有SID三段三位、未知公开段保持星号',async()=>{
    assert.equal(await ev("__sidTest.snapshot().projections.every(p=>/^[A-Z0-9*]{3}-[A-Z0-9*]{3}-[A-Z0-9*]{3}$/.test(p.sid))"),true);
    assert.match((await snapshot()).projections[0].sid,/^[A-Z0-9]{3}-\*\*\*-\*\*\*$/);
  });
  await test('真实WASD移动；搜索输入焦点阻止移动',async()=>{
    await reset();await ev("document.querySelector('#office').focus()");await key('keyDown','d','KeyD');await timeout(180);await key('keyUp','d','KeyD');assert((await snapshot()).self.x>480);
    await click('#roster-toggle');await click('#search');await key('keyDown','d','KeyD');const x=(await snapshot()).self.x;await timeout(100);await key('keyUp','d','KeyD');assert.equal((await snapshot()).self.x,x);await click('#roster-close');await ev('document.activeElement.blur()');
  });
  await test('对角线归一化、dt上限及镜头两端钳制',async()=>{
    await reset();await ev("__sidTest.key('KeyD',true);__sidTest.key('KeyS',true);__sidTest.step(5);__sidTest.key('KeyD',false);__sidTest.key('KeyS',false)");
    let s=await snapshot();assert(Math.abs(Math.hypot(s.self.x-480,s.self.y-405)-8)<.01);
    await ev('__sidTest.setPosition(20,400)');assert.equal((await snapshot()).cameraX,0);
    await ev('__sidTest.setPosition(3820,400)');assert.equal((await snapshot()).cameraX,2880);
    await ev('__sidTest.setPosition(1900,400)');s=await snapshot();assert.equal(s.self.x-s.cameraX,480);
  });
  await test('家具AABB阻挡；人物可以互穿',async()=>{
    await reset();await ev("__sidTest.setPosition(210,252);__sidTest.key('KeyW',true);for(let i=0;i<20;i++)__sidTest.step(.05);__sidTest.key('KeyW',false)");assert((await snapshot()).self.y>=245);
    await ev("__sidTest.setPosition(635,407);__sidTest.key('KeyD',true);for(let i=0;i<10;i++)__sidTest.step(.05);__sidTest.key('KeyD',false)");assert((await snapshot()).self.x>680);
  });
  await test('真实身体点击：三名重叠候选按ID排序、先选候选',async()=>{
    await reset();await canvasClick(655,390);assert.equal(await ev("document.querySelectorAll('#candidates [data-player]').length"),3);assert.equal((await snapshot()).selectedId,null);
    assert.deepEqual(await ev("[...document.querySelectorAll('#candidates [data-player]')].map(e=>+e.dataset.player)"),[1,2,3]);await click('#candidates [data-player="2"]');assert.equal((await snapshot()).selectedId,2);
  });
  await test('重叠标签下半行先展示三名候选、不自动复制或选人',async()=>{
    await reset();await canvasClick(655,442);assert.equal(await ev("document.querySelectorAll('#candidates [data-player]').length"),3);assert.equal((await snapshot()).selectedId,null);assert.equal(await ev("document.querySelector('#copy-toast').hidden"),true);await click('#candidate-close');
  });
  await test('标签固定144x31、各一人；经过他人时双方不避让',async()=>{
    await reset();for(const x of [580,625,655,685,730]){await ev(`__sidTest.setPosition(${x},407)`);const s=await snapshot();checkLabels(s);assert.deepEqual(s.labels.filter(l=>[1,2,3].includes(l.ids[0])).map(l=>({x:l.x,y:l.y,w:l.w,h:l.h})),Array(3).fill({x:583,y:419,w:144,h:31}));}
  });
  await test('远端与四边缘标签不钳制、允许裁切',async()=>{
    for(const [x,y] of [[20,135],[20,0],[3820,616],[3520,407]]){await ev(`__sidTest.setPosition(${x},${y})`);const s=await snapshot();checkLabels(s);const l=s.labels.find(l=>l.ids[0]===0);assert(l);assert.equal(l.x,x-72);assert.equal(l.y,y+12);if(x===20)assert(l.x<0);if(y===616)assert(l.y+l.h>640);if(x===3520){const remote=s.labels.find(l=>l.ids[0]===18);assert(remote);assert.equal(remote.x,3448);assert.equal(remote.y,419);}}
  });
  await test('名单选远端目标不瞬移、不改变镜头，远距可探查',async()=>{
    await reset();const before=await snapshot();await click('#roster-toggle');await ev("document.querySelector('#roster [data-player=\"18\"]').scrollIntoView()");await click('#roster [data-player="18"]');let after=await snapshot();assert.equal(after.selectedId,18);assert.equal(after.cameraX,before.cameraX);assert.equal(after.self.x,before.self.x);await click('#roster-close');
    await skill('#probe');after=await snapshot();assert.equal(after.self.probes,1);assert.notEqual(after.projections[18].traits.food,'***');
  });
  await test('目标恰好四项精准颜色名称及色块；隐藏特征为星号',async()=>{
    await reset();await select(1);await checkColors('#target',1);assert.equal(await ev("[...document.querySelectorAll('#target .trait strong')].every(e=>e.textContent==='***')"),true);
  });
  await test('名单检索：公开颜色、已公开隐藏属性值与字段名精确命中数（初始态，未探查）',async()=>{
    await reset();await click('#roster-toggle');
    const cases=[['银白',4],['番茄面',2],['先喝口水',3],['马上就好',1],['有点意思',1],['稳住别慌',2],['让我想想',1],
      ['饺子',1],['咖喱饭',1],['火锅',1],['三明治',1],['羽毛球',1],['游泳',0],['骑行',0],['篮球',0],['跑步',0],
      ['口头禅',8],['爱吃的食物',6],['喜欢的运动',1],['',20],
      ['颜色',0],['姓',0],['姓名',0],['口头',0],['喜欢',0],['色',20]]; // 字段名只认三个隐藏属性的完全相等；色走鞋颜色值命中
    for(const [value,expected] of cases){const ids=await query(value);assert.equal(ids.length,expected,`query "${value}" -> ${ids}`);if(expected===20)assert.deepEqual(ids,Array.from({length:20},(_,i)=>i));}
    await query('');await click('#roster-close');
  });
  await test('红线：真实值猜未公开属性永不命中；自己不享特权',async()=>{
    await reset();await click('#roster-toggle');
    const leaks=await ev(`(()=>{const pools={saying:['先喝口水','马上就好','有点意思','稳住别慌','让我想想'],food:['番茄面','饺子','咖喱饭','火锅','三明治'],sport:['羽毛球','游泳','骑行','篮球','跑步']};const s=document.querySelector('#search');const bad=[];
      for(const p of __sidTest.snapshot().projections)for(const k of ['saying','food','sport'])if(p.traits[k]==='***')for(const v of pools[k]){s.value=v;s.dispatchEvent(new Event('input'));if([...document.querySelectorAll('#roster-items [data-player]')].some(e=>+e.dataset.player===p.id))bad.push({id:p.id,k,v});}
      s.value='';s.dispatchEvent(new Event('input'));return bad;})()`);
    assert.deepEqual(leaks,[]);
    assert(!(await query('羽毛球')).includes(0));
    assert.deepEqual(await query('***'),[]);assert.deepEqual(await query('*'),[]);assert.deepEqual(await query('**'),[]);
    await query('');await click('#roster-close');
  });
  await test('泄露专项：逐人逐项搜索45个未公开隐藏属性真实值，含自己',async()=>{
    await reset();await click('#roster-toggle');const projections=(await snapshot()).projections;const leaks=[];let checked=0,selfChecked=0;
    for(const p of projections)for(const key of Object.keys(traitPools))if(p.traits[key]==='***'){
      checked++;if(p.id===0)selfChecked++;
      const value=expectedTrait(p.id,key),ids=await query(value);
      if(ids.includes(p.id))leaks.push({id:p.id,key,value,ids});
    }
    assert.equal(checked,45);assert.equal(selfChecked,1);assert.deepEqual(leaks,[]);
    await query('');await click('#roster-close');
  });
  await test('S-ID不纳入搜索；占位串不命中',async()=>{
    await reset();await click('#roster-toggle');const fullSID=(await ev('__sidTest.secret(0)')).sid;
    for(const value of ['a7c','A7C',fullSID,fullSID.toLowerCase(),'小序'])assert.deepEqual(await query(value),value==='小序'?[0]:[],`query ${value}`);
    await query('');await click('#roster-close');
  });
  await test('命中来源展示：仅查询非空出现、最多两条、姓名不渲染来源、不阻断点击',async()=>{
    await reset();await click('#roster-toggle');await query('');assert.equal(await ev("document.querySelectorAll('.roster-match').length"),0);
    await query('口头禅');const hints=await ev("[...document.querySelectorAll('#roster-items .roster-match')].map(e=>e.textContent)");
    assert.equal(hints.length,8);
    for(const h of hints)assert.match(h,/^(发色|上衣颜色|裤子颜色|鞋颜色|口头禅|爱吃的食物|喜欢的运动)：[^：·]+( · [^：·]+)?( 等\d+项)?$/,h);
    assert(hints.every(h=>h.startsWith('口头禅：')));
    assert(!hints.some(h=>/\*\*\*|姓名|未公开|隐藏|未知|生命|阵营/.test(h)));
    assert.equal(await ev("document.querySelectorAll('#roster-items [data-player]').length"),8);
    await query('小序');assert.equal(await ev("document.querySelectorAll('#roster-items [data-player]').length"),1);
    assert.equal(await ev("document.querySelector('#roster-items [data-player=\"0\"] .roster-match')"),null); // 姓名命中不渲染来源
    await query('白');const wide=await ev("[...document.querySelectorAll('#roster-items .roster-match')].map(e=>e.textContent)");
    assert.equal(wide.length,11);for(const h of wide)assert(h.split(' · ').length<=2);
    assert.equal(await ev("document.querySelector('#roster-items [data-player=\"5\"] .roster-match').textContent"),'发色：银白 · 鞋颜色：白色');
    await click('#roster-items [data-player="5"] .roster-match');assert.equal((await snapshot()).selectedId,5); // 来源文本不阻断整行点击
    await query('');await click('#roster-close');
  });
  await test('命中来源计数：最多展示2条，等N项与真实命中字段总数一致',async()=>{
    await reset();await click('#roster-toggle');const projections=(await snapshot()).projections;
    for(const value of ['白','口头禅']){
      const ids=await query(value);
      for(const id of ids){
        const p=projections[id],expected=expectedNonNameHits(p,value),hint=await hintOf(id);
        assert(expected.length>0,`player ${id} query ${value} 没有非姓名来源`);
        const parsed=parseHint(hint);assert(parsed,`player ${id} query ${value} invalid hint ${hint}`);
        assert.deepEqual(parsed.shown,expected.slice(0,2),`player ${id} query ${value}`);
        assert.equal(parsed.shown.length,Math.min(2,expected.length),`player ${id} query ${value}`);
        assert.equal(parsed.total,expected.length,`player ${id} query ${value}`);
      }
    }
    await query('白');assert.equal(await hintOf(5),'发色：银白 · 鞋颜色：白色');
    await query('');await click('#roster-close');
  });
  await test('命中行整行可点击选中远处目标；坏人与淘汰者行无阵营或坑位字样',async()=>{
    await reset();await click('#roster-toggle');await query('稳住别慌');assert.deepEqual(await query('稳住别慌'),[3,18]);
    const text=await ev("[...document.querySelectorAll('#roster-items [data-player]')].map(e=>e.textContent).join('|')");assert(!/阵营|坑位|坏人|好人|生命/.test(text));
    // 行几何中心落在可复制的SID span上（按设计复制而不选人），因此点击头像与姓名验证整行可选。
    assert.equal(await ev("(()=>{const r=document.querySelector('#roster-items [data-player=\"18\"]').getBoundingClientRect();const e=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return e&&e.getAttribute('data-copy-sid')!==null})()"),true);
    await click('#roster-items [data-player="18"] .portrait');assert.equal((await snapshot()).selectedId,18);
    await click('#roster-items [data-player="18"] strong');assert.equal((await snapshot()).selectedId,18);await click('#roster-close');
    await reset();await click('#roster-toggle');await query('余温');assert.deepEqual(await query('余温'),[19]);await click('#roster-items [data-player="19"] .portrait');assert.equal((await snapshot()).selectedId,19);
    await query('');await click('#roster-close');
  });
  await test('探查公开某项后，带查询词的名单结果即时变化',async()=>{
    await reset();await click('#roster-toggle');assert.deepEqual(await query('有点意思'),[12]);
    await click('#roster-close');await select(2);await skill('#probe');
    assert.notEqual((await snapshot()).projections[2].traits.saying,'***');
    await click('#roster-toggle');assert.deepEqual(await query('有点意思'),[2,12]);await query('');await click('#roster-close');
  });
  await test('搜索值不进入日志、snapshot、URL或localStorage；重置清空搜索框',async()=>{
    await reset();await click('#roster-toggle');await query('番茄面');
    assert.equal((await snapshot()).logs.some(l=>l.includes('番茄面')),false);assert.equal(await ev("document.body.textContent.includes('番茄面的面')||false"),false);
    assert.equal(await ev("location.search.includes('番茄面')"),false);assert.equal(await ev("(localStorage.getItem('search')||sessionStorage.getItem('search')||'')===''"),true);
    await ev("__sidTest.reset('good')");assert.equal(await ev("document.querySelector('#search').value"),'');assert.equal(await ev("document.querySelectorAll('#roster-items [data-player]').length"),20);
    await click('#roster-close');
  });
  await test('只读与无痕：搜索不消耗资源、不触发冷却、不写任意存储或状态快照',async()=>{
    await reset();await click('#roster-toggle');const before=await snapshot(),token='qa-query-7f91';
    await query(token);const after=await snapshot();
    assert.equal(after.self.probes,before.self.probes);assert.equal(after.self.probeUntil,before.self.probeUntil);assert.equal(after.self.actionUntil,before.self.actionUntil);
    assert.deepEqual(after.logs,before.logs);assert.equal(after.selectedId,before.selectedId);assert(!JSON.stringify(after).includes(token));
    assert.equal(await ev(`location.href.includes(${JSON.stringify(token)})`),false);
    assert.deepEqual(await ev('({local:[...Array(localStorage.length)].map((_,i)=>localStorage.key(i)),session:[...Array(sessionStorage.length)].map((_,i)=>sessionStorage.key(i))})'),{local:[],session:[]});
    assert.equal(await ev(`document.querySelector('#search').getAttribute('value')`),null);
    await query('');await click('#roster-close');
  });
  await test('搜索输入无建议容器、无自动填充提示；查询词不写入DOM属性',async()=>{
    await reset();await click('#roster-toggle');await query('银白');
    assert.equal(await ev("document.querySelector('#search').getAttribute('autocomplete')"),'off');assert.equal(await ev("document.querySelector('#search').getAttribute('spellcheck')"),'false');
    assert.equal(await ev("document.querySelectorAll('datalist').length"),0);assert.equal(await ev("document.querySelectorAll('[list],#search-no-suggest').length"),0);
    assert.equal(await ev("!!document.querySelector('#search').list"),false);assert.equal(await ev("document.querySelector('#search').form"),null);
    assert.equal(await ev("document.querySelector('#search').getAttribute('value')"),null);
    await query('');await click('#roster-close');
  });
  await test('现状记录：Esc与关闭名单不清空搜索框，仅重置清空',async()=>{
    await reset();await click('#roster-toggle');await query('银白');await key('keyDown','Escape','Escape');await key('keyUp','Escape','Escape');
    assert.equal(await ev("document.querySelector('#search').value"),'银白');assert.equal(await ev("document.querySelectorAll('#roster-items [data-player]').length"),4);
    await click('#roster-close');await click('#roster-toggle');assert.equal(await ev("document.querySelector('#search').value"),'银白');
    await ev("__sidTest.reset('good')");assert.equal(await ev("document.querySelector('#search').value"),'');await click('#roster-close');
  });
  await test('补充：番茄面未公开时只命中2人，探查公开松子后命中3人且命中来源正确',async()=>{
    await reset();await click('#roster-toggle');
    assert.deepEqual(await query('番茄面'),[0,5]);                 // 松子(10)、小满(15)同值未公开，不命中
    await click('#roster-close');
    await select(10);await skill('#probe');                        // 公开松子的口头禅：先喝口水
    assert.equal((await snapshot()).projections[10].traits.saying,'先喝口水');
    await advance(9);await skill('#probe');                        // 再公开爱吃的食物：番茄面
    assert.equal((await snapshot()).projections[10].traits.food,'番茄面');
    await click('#roster-toggle');
    assert.deepEqual(await query('番茄面'),[0,5,10]);
    assert.equal(await ev("document.querySelector('#roster-items [data-player=\"10\"] .roster-match').textContent"),'爱吃的食物：番茄面');
    assert.deepEqual(await query('番茄面'),[0,5,10]);              // 重复同一查询幂等，不新增命中
    await query('');await click('#roster-close');
  });
  await test('恶意边界：公开值部分子串仅命中公开者，切换阵营不扩大结果',async()=>{
    await reset();await click('#roster-toggle');
    assert.deepEqual(await query('茄面'),[0,5]);assert(!(await query('茄面')).includes(10));assert(!(await query('茄面')).includes(15));
    assert.deepEqual(await query('先喝'),[0,5,15]);
    await ev("document.querySelector('#my-info').focus()");await key('keyDown',' ','Space');await click('#mode-bad');await key('keyUp',' ','Space');
    assert.equal((await snapshot()).self.role,'bad');assert.equal(await ev("document.querySelector('#search').value"),'先喝');assert.deepEqual(await query('先喝'),[0,5,15]);
    assert.deepEqual(await query(' 茄面 '),[0,5]);await query('');await click('#roster-close');
  });
  await test('恶意交互：选中私密待确认时连续快速搜索不改目标、不销毁私密、不注入DOM',async()=>{
    await reset();await select(1);await openPrivate();await click('#probe');assert.equal((await snapshot()).pending,'probe');await click('#roster-toggle');
    const ids=await ev(`(()=>{const s=document.querySelector('#search'),values=['番茄面','口头禅','<img data-qa=x onerror=1>','***','银白','稳住别慌'];for(let i=0;i<240;i++){s.value=values[i%values.length];s.dispatchEvent(new Event('input'));}return [...document.querySelectorAll('#roster-items [data-player]')].map(e=>+e.dataset.player)})()`);
    assert.deepEqual(ids,[3,18]);const after=await snapshot();assert.equal(after.selectedId,1);assert.equal(after.hold,true);assert.equal(after.pending,'probe');
    assert(await ev("document.querySelector('#private-content').childNodes.length>0"));assert.equal(await ev("document.querySelector('img[data-qa]')"),null);assert.equal(errors.length,0);
    await query('');await click('#roster-close');await click('#private-gate');
  });
  await test('补充：淘汰者仍可按已公开隐藏属性搜到（非仅姓名），命中来源照常显示',async()=>{
    await reset();await click('#roster-toggle');assert.deepEqual(await query('有点意思'),[12]);
    await click('#roster-close');await select(12);await skill('#action');   // 正确指认一血坏人即淘汰
    assert.equal((await ev('__sidTest.secret(12)')).alive,false);
    await click('#roster-toggle');assert.deepEqual(await query('有点意思'),[12]);
    assert.equal(await ev("document.querySelector('#roster-items [data-player=\"12\"] .roster-match').textContent"),'口头禅：有点意思');
    assert.equal(await ev("document.querySelector('#roster-items [data-player=\"12\"]').textContent.includes('淘汰')"),true);
    await query('');await click('#roster-close');
  });
  await test('点击展开和再次收起；Shift按下不展开、松开不关闭',async()=>{
    await reset();await select(1);await downShift();assert.equal((await snapshot()).hold,false);await upShift();await openPrivate();assert.equal((await snapshot()).hold,true);assert.equal(await ev("document.querySelector('#private-gate').getAttribute('aria-expanded')"),'true');
    await downShift();await upShift();assert.equal((await snapshot()).hold,true);await click('#probe');assert.equal((await snapshot()).pending,'probe');await click('#private-gate');assert.equal((await snapshot()).hold,false);assert.equal((await snapshot()).pending,undefined);assert.equal(await ev("document.querySelector('#private-content').childNodes.length"),0);assert.equal(await ev("document.querySelector('#private-gate').getAttribute('aria-expanded')"),'false');
  });
  await test('好人探查成功才消耗、次数上限、冷却及无未知边界',async()=>{
    await reset();await select(1);await skill('#probe');let s=await snapshot();assert.equal(s.self.probes,1);assert.notEqual(s.projections[1].traits.saying,'***');assert(await ev("document.querySelector('#probe').disabled"));
    await advance(9);await select(5);await openPrivate();assert(await ev("document.querySelector('#probe').disabled"));assert.equal((await snapshot()).self.probes,1);
    await select(1);await skill('#probe');assert.equal((await snapshot()).self.probes,0);await advance(9);assert(await ev("document.querySelector('#probe').disabled"));
  });
  await test('正确指认扣血、冷却，第二次淘汰',async()=>{
    await reset();await select(3);await skill('#action');assert.equal((await ev('__sidTest.secret(3)')).hp,1);assert.equal((await ev('__sidTest.secret(3)')).alive,true);assert(await ev("document.querySelector('#action').disabled"));
    await advance(13);await skill('#action');assert.equal((await ev('__sidTest.secret(3)')).alive,false);assert.equal((await snapshot()).projections.filter(p=>p.alive).length,18);
  });
  await test('错指认公开自己一段SID；公开日志不含原因与操作者',async()=>{
    await reset();await select(1);await skill('#action');const s=await snapshot();assert.notEqual(s.projections[0].sid.split('-')[1],'***');assert.equal(s.self.actionUntil>0,true);
    assert(s.logs.some(l=>l.startsWith('小序的S-ID已公开')));assert(s.logs.some(l=>l==='阿澈被指认一次。'));assert(!s.logs.some(l=>/错指认|命中|扣|操作者|冷却/.test(l)));
  });
  await test('一血坏人一次正确指认即淘汰',async()=>{await reset();await select(12);await skill('#action');assert.equal((await ev('__sidTest.secret(12)')).alive,false);});
  await test('坏人探查只公开一段SID、不公开隐藏特征',async()=>{
    await reset('bad');await select(1);const old=(await snapshot()).projections[1];await skill('#probe');const s=await snapshot();assert.notEqual(s.projections[1].sid.split('-')[1],'***');assert.deepEqual(s.projections[1].traits,old.traits);assert.equal(s.self.probes,1);
  });
  await test('击杀格式错误免费、有效错SID进入冷却、精确匹配淘汰',async()=>{
    await reset('bad');await select(1);await skill('#action','ABC');assert.equal((await snapshot()).self.actionUntil,0);assert.equal((await snapshot()).pending,'kill');
    await ev("document.querySelector('#sid-input').value='AAA-AAA-AAA'");await click('#confirm');assert.equal((await ev('__sidTest.secret(1)')).alive,true);assert((await snapshot()).self.actionUntil>0);
    await advance(13);const sid=(await ev('__sidTest.secret(1)')).sid;await skill('#action',sid);assert.equal((await ev('__sidTest.secret(1)')).alive,false);assert.equal((await snapshot()).logs[0],'阿澈已淘汰。');
  });
  await test('SID自由输入不需Shift，输入焦点阻止WASD移动',async()=>{
    await reset('bad');await select(2);await openPrivate();await click('#action');await click('#sid-input');const x=(await snapshot()).self.x;
    await key('keyDown','a','KeyA');await send('Input.insertText',{text:'A7C-9K2-3M8'});await key('keyUp','a','KeyA');await timeout(60);assert.equal((await snapshot()).self.x,x);assert.equal(await ev("document.querySelector('#sid-input').value"),'A7C-9K2-3M8');assert.equal((await snapshot()).hold,true);
  });
  await test('真实无Shift数字与减号按键可以输入SID字符',async()=>{
    await reset('bad');await select(2);await openPrivate();await click('#action');await click('#sid-input');
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'7',code:'Digit7',text:'7',unmodifiedText:'7',windowsVirtualKeyCode:55});await key('keyUp','7','Digit7');
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'-',code:'Minus',text:'-',unmodifiedText:'-',windowsVirtualKeyCode:189});await key('keyUp','-','Minus');assert.equal(await ev("document.querySelector('#sid-input').value"),'7-');
  });
  await test('小写完整SID仍格式错误、不进入冷却',async()=>{
    await reset('bad');await select(1);const sid=(await ev('__sidTest.secret(1)')).sid.toLowerCase();await skill('#action',sid);assert.equal((await snapshot()).self.actionUntil,0);assert.equal((await ev('__sidTest.secret(1)')).alive,true);
  });
  await test('真实连续两次确认不重复扣血或提交日志',async()=>{
    await reset();await select(3);await openPrivate();await click('#action');const r=await ev("(()=>{const r=document.querySelector('#confirm').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");await point(r.x,r.y);await point(r.x,r.y);
    assert.equal((await ev('__sidTest.secret(3)')).hp,1);assert.equal((await snapshot()).logs.filter(l=>l==='七禾被指认一次。').length,1);
  });
  await test('我的信息鼠标按住显示、松开销毁；四颜色精准名称及色块',async()=>{
    await reset();const r=await ev("(()=>{const r=document.querySelector('#my-info').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");
    await send('Input.dispatchMouseEvent',{type:'mousePressed',x:r.x,y:r.y,button:'left',clickCount:1});assert(await ev("document.querySelector('#mine').textContent.includes('A7C-9K2-3M8')"));await checkColors('#mine',0);
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:r.x,y:r.y,button:'left',clickCount:1});assert.equal(await ev("document.querySelector('#mine').childNodes.length"),0);assert.equal(await ev("document.querySelector('#mine').hidden"),true);
  });
  await test('我的信息聚焦Space按住、松开销毁及切阵营重置控件',async()=>{
    await reset();await select(1);await openPrivate();assert.equal(await ev("document.querySelector('#mine').childNodes.length"),0);await click('#private-gate');
    await ev("document.querySelector('#my-info').focus()");await key('keyDown',' ','Space');assert(await ev("document.querySelector('#mine').textContent.includes('A7C-9K2-3M8')"));await checkColors('#mine',0);await click('#mode-bad');assert.equal((await snapshot()).self.role,'bad');await key('keyUp',' ','Space');assert.equal(await ev("document.querySelector('#mine').childNodes.length"),0);assert.equal(await ev("document.querySelector('#mode-bad')"),null);
    await ev("document.querySelector('#my-info').focus()");await key('keyDown',' ','Space');await click('#reset');assert.equal((await snapshot()).self.probes,2);await key('keyUp',' ','Space');
  });
  await test('收起销毁私密输入、待确认和结果；已提交资源不回滚',async()=>{
    await reset('bad');await select(2);await openPrivate();await click('#action');await click('#sid-input');await send('Input.insertText',{text:'AAA-AAA-AAA'});await click('#private-gate');assert.equal(await ev("document.querySelector('#private-content').childNodes.length"),0);assert.equal(await ev("document.querySelector('#sid-input')"),null);assert.equal((await snapshot()).pending,undefined);assert.equal((await snapshot()).self.actionUntil,0);
    await skill('#probe');await click('#private-gate');assert.equal((await snapshot()).self.probes,1);assert.equal(await ev("document.querySelector('#private-content').textContent"),'');
  });
  await test('blur销毁私密与我的信息并清移动键；visibility hidden同样销毁',async()=>{
    await reset();await select(1);await openPrivate();await click('#probe');await ev("document.querySelector('#my-info').focus()");await key('keyDown',' ','Space');await key('keyDown','d','KeyD');await ev("window.dispatchEvent(new Event('blur'))");let s=await snapshot();assert.equal(s.keys.length,0);assert.equal(s.hold,false);assert.equal(s.pending,undefined);assert.equal(await ev("document.querySelector('#private-content').textContent"),'');assert.equal(await ev("document.querySelector('#mine').childNodes.length"),0);await key('keyUp','d','KeyD');await key('keyUp',' ','Space');
    await openPrivate();await click('#probe');await ev("Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));delete document.hidden");s=await snapshot();assert.equal(s.hold,false);assert.equal(s.pending,undefined);assert.equal(await ev("document.querySelector('#private-content').textContent"),'');
  });
  await test('换人、Escape及空地图点击销毁私密且不消耗',async()=>{
    await reset();await select(1);await openPrivate();await click('#probe');await select(2);assert.equal((await snapshot()).hold,false);assert.equal((await snapshot()).self.probes,2);assert.equal(await ev("document.querySelector('#private-content').textContent"),'');
    await openPrivate();await click('#probe');await key('keyDown','Escape','Escape');assert.equal((await snapshot()).pending,undefined);assert.equal((await snapshot()).hold,false);await key('keyUp','Escape','Escape');
    await openPrivate();await click('#probe');await canvasClick(40,480);assert.equal((await snapshot()).selectedId,null);assert.equal((await snapshot()).hold,false);assert.equal((await snapshot()).pending,undefined);assert.equal((await snapshot()).self.probes,2);
  });
  await test('淘汰者保留名单档案但技能禁用；自己不可操作',async()=>{
    await reset();await click('#roster-toggle');await ev("document.querySelector('#roster [data-player=\"19\"]').scrollIntoView()");await click('#roster [data-player="19"]');assert.equal((await snapshot()).selectedId,19);await click('#roster-close');await openPrivate();assert(await ev("document.querySelector('#probe').disabled&&document.querySelector('#action').disabled"));await select(0);await openPrivate();assert(await ev("document.querySelector('#probe').disabled&&document.querySelector('#action').disabled"));
  });
  await test('初始及刚淘汰者从地图sprite、labels、命中候选全部过滤',async()=>{
    await reset();await ev('__sidTest.setPosition(3100,450)');let s=await snapshot();assert(!s.mapIds.includes(19));assert(!s.labels.some(l=>l.ids.includes(19)));const p=s.projections[19];await canvasClick(p.x-s.cameraX,p.y-15);assert.equal((await snapshot()).selectedId,null);
    await reset('bad');await select(1);await skill('#action',(await ev('__sidTest.secret(1)')).sid);await ev('__sidTest.draw()');s=await snapshot();assert(!s.mapIds.includes(1));assert(!s.labels.some(l=>l.ids.includes(1)));await canvasClick(655,390);assert.deepEqual(await ev("[...document.querySelectorAll('#candidates [data-player]')].map(e=>+e.dataset.player)"),[2,3]);
    await canvasClick(655,442);assert.deepEqual(await ev("[...document.querySelectorAll('#candidates [data-player]')].map(e=>+e.dataset.player)"),[2,3]);await click('#candidate-close');
  });
  await test('匿名坏人槽不泄露映射名字或完整SID',async()=>{
    await reset();await click('#bad-toggle');const text=await ev("document.querySelector('#bad-slots').textContent");for(const n of ['七禾','柚子','秋白','竹青'])assert(!text.includes(n));assert(!/[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{3}/.test(text));await click('#bad-toggle');
  });
  await test('中性公开DOM无私密SID、生命、阵营或测试控件',async()=>{
    await reset();await select(1);const markup=await ev('document.body.innerHTML');assert(!markup.includes('A7C-9K2-3M8'));assert(!markup.includes('生命</span>'));assert(!markup.includes('好人技能'));assert(!markup.includes('坏人技能'));assert(!markup.includes('id="mode-bad"'));
  });
  // 优先尝试真实系统剪贴板读回；不可用时明确降级，不能假称系统复制已验证。
  await reset();await select(1);await openPrivate();
  try{
    await send('Browser.grantPermissions',{origin:'file://',permissions:['clipboardReadWrite','clipboardSanitizedWrite']});clipboard.permissionGrant=true;
    const text=await ev("document.querySelector('#target [data-copy-sid]').textContent");await click('#target [data-copy-sid]');await settleCopy();
    const read=await ev('navigator.clipboard.readText()');assert.equal(read,text);assert.equal(await ev("document.querySelector('#copy-toast').textContent"),'已复制');clipboard.systemReadback=true;
    results.push({name:'真实系统剪贴板：file上下文权限授权后点击并精确读回公开SID',pass:true});
  }catch(error){clipboard.systemFailure=error.message;console.log('CLIPBOARD 系统读回不可用，后续使用明确标注的异步mock：',error.message);}
  if(clipboard.systemReadback)await test('真实系统剪贴板复制及读回不销毁已展开私密',async()=>{assert.equal((await snapshot()).hold,true);assert.equal((await snapshot()).selectedId,1);assert(await ev("document.querySelector('#private-content').childNodes.length>0"));});
  clipboard.mode=clipboard.systemReadback?'系统读回已验证；以下交互使用异步mock精准检查写入参数与拒绝分支':'系统读回不可用；异步mock精准检查写入参数与拒绝分支';
  await ev(`window.__copyWrites=[];window.__copyReject=false;Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{await new Promise(resolve=>setTimeout(resolve,5));if(window.__copyReject)throw new DOMException('权限拒绝','NotAllowedError');window.__copyWrites.push(text);}}})`);
  await test('公开档案SID为span、pointerdown复制当前DOM文本且不含隐藏段（异步mock）',async()=>{
    await reset();await select(1);await openPrivate();assert.equal(await ev("document.querySelector('#target [data-copy-sid]').tagName"),'SPAN');const text=await mockCopy('#target [data-copy-sid]');assert.equal(text,(await snapshot()).projections[1].sid);assert(text.includes('***'));assert.notEqual(text,(await ev('__sidTest.secret(1)')).sid);assert.equal((await snapshot()).hold,true);assert.equal((await snapshot()).selectedId,1);
    await ev("document.querySelector('#target [data-copy-sid]').textContent='DOM-***-***'");assert.equal(await mockCopy('#target [data-copy-sid]'),'DOM-***-***');
  });
  await test('仅pointerdown即可复制，尚未pointerup即完成（异步mock）',async()=>{
    await reset();await select(2);const text=await ev("document.querySelector('#target [data-copy-sid]').textContent");const count=await ev('__copyWrites.length');const r=await ev("(()=>{const r=document.querySelector('#target [data-copy-sid]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");
    await send('Input.dispatchMouseEvent',{type:'mousePressed',x:r.x,y:r.y,button:'left',clickCount:1});await settleCopy();assert.equal(await ev('__copyWrites.length'),count+1);assert.equal(await ev('__copyWrites.at(-1)'),text);await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:r.x,y:r.y,button:'left',clickCount:1});assert.equal(await ev('__copyWrites.length'),count+1);
  });
  await test('公开SID键盘Space和Enter均复制、不启动移动（异步mock）',async()=>{
    await reset();await select(2);await mockCopy('#target [data-copy-sid]','Space');await mockCopy('#target [data-copy-sid]','Enter');assert.equal((await snapshot()).selectedId,2);assert.deepEqual((await snapshot()).keys,[]);
  });
  await test('名单SID复制不触发选人、不关闭原私密（鼠标与键盘，异步mock）',async()=>{
    await reset();await select(1);await openPrivate();await click('#roster-toggle');const selector='#roster [data-player="2"] [data-copy-sid]';await ev(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView()`);const text=await mockCopy(selector);assert.equal(text,(await snapshot()).projections[2].sid);await mockCopy(selector,'Enter');await mockCopy(selector,'Space');assert.equal((await snapshot()).selectedId,1);assert.equal((await snapshot()).hold,true);await click('#roster-close');
  });
  await test('候选名单SID复制不选人，重叠地图下半行不复制（异步mock）',async()=>{
    await reset();const count=await ev('__copyWrites.length');await canvasClick(655,442);assert.equal(await ev('__copyWrites.length'),count);assert.equal((await snapshot()).selectedId,null);await mockCopy('#candidates [data-player="2"] [data-copy-sid]');await mockCopy('#candidates [data-player="3"] [data-copy-sid]','Space');assert.equal((await snapshot()).selectedId,null);assert.equal(await ev("document.querySelector('#candidates').hidden"),false);await click('#candidate-close');
  });
  await test('地图单标签下半行只复制公开SID、上半行选择（异步mock）',async()=>{
    await reset();await select(1);await openPrivate();let count=await ev('__copyWrites.length');await canvasClick(480,438);await settleCopy();assert.equal(await ev('__copyWrites.length'),count+1);assert.equal(await ev('__copyWrites.at(-1)'),(await snapshot()).projections[0].sid);assert.equal((await snapshot()).selectedId,1);assert.equal((await snapshot()).hold,true);
    count=await ev('__copyWrites.length');await canvasClick(480,425);assert.equal((await snapshot()).selectedId,0);assert.equal((await snapshot()).hold,false);assert.equal(await ev('__copyWrites.length'),count);
  });
  await test('我的信息完整SID span可复制当前显示文本并保留Space按住（异步mock）',async()=>{
    await reset();await ev("document.querySelector('#my-info').focus()");await key('keyDown',' ','Space');assert.equal(await ev("document.querySelector('#mine [data-copy-sid]').tagName"),'SPAN');const text=await mockCopy('#mine [data-copy-sid]');assert.equal(text,(await ev('__sidTest.secret(0)')).sid);assert.equal((await snapshot()).myHeld,true);await mockCopy('#mine [data-copy-sid]','Enter');await key('keyUp',' ','Space');assert.equal(await ev("document.querySelector('#mine').childNodes.length"),0);
    await ev("document.querySelector('#my-info').focus()");await key('keyDown','Enter','Enter');await mockCopy('#mine [data-copy-sid]','Space');assert.equal((await snapshot()).myHeld,true);await key('keyUp','Enter','Enter');assert.equal(await ev("document.querySelector('#mine').childNodes.length"),0);
  });
  await test('剪贴板权限拒绝只提示失败、不能假已复制且保持私密（异步mock拒绝）',async()=>{
    await reset();await select(1);await openPrivate();await ev('__copyReject=true');const count=await ev('__copyWrites.length');await click('#target [data-copy-sid]');await settleCopy();assert.equal(await ev('__copyWrites.length'),count);const text=await ev("document.querySelector('#copy-toast').textContent");assert.equal(text,'复制失败，请允许剪贴板权限或手动复制');assert(!text.includes('已复制'));assert.equal((await snapshot()).hold,true);await ev('__copyReject=false');
  });
  await test('已复制toast到期隐藏并清空',async()=>{
    await reset();await select(1);await mockCopy('#target [data-copy-sid]');await timeout(1900);assert.equal(await ev("document.querySelector('#copy-toast').hidden"),true);assert.equal(await ev("document.querySelector('#copy-toast').textContent"),'');
  });
  const perf=await ev('__sidTest.benchmark()');results.push({name:'600帧CPU更新+Canvas绘制命令提交，非GPU呈现',pass:perf.frames===600&&perf.p95<=16.7,...perf});console.log('PERF',perf);
  await reset();await select(1);await ev('window.scrollTo(0,0);new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(join(root,'self-test-desktop.png'),Buffer.from(shot.data,'base64'));
  await send('Emulation.setDeviceMetricsOverride',{width:820,height:900,deviceScaleFactor:1,mobile:false});await ev('__sidTest.draw();window.scrollTo(0,0);new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  const small=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(join(root,'self-test-compact.png'),Buffer.from(small.data,'base64'));
  await test('820px响应式无横向页面溢出',async()=>{assert(await ev('document.documentElement.scrollWidth<=innerWidth'));});
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await ev('__sidTest.draw()');
  await test('390px窄屏无横向页面溢出，私密展开按钮可用',async()=>{assert(await ev('document.documentElement.scrollWidth<=innerWidth'));await openPrivate();assert.equal((await snapshot()).hold,true);await click('#private-gate');assert.equal((await snapshot()).hold,false);});
  await send('Page.navigate',{url:pathToFileURL(join(root,'index.html')).href});await ev("new Promise(resolve=>document.readyState==='complete'?resolve():window.addEventListener('load',resolve,{once:true}))");
  await test('正常URL不暴露诊断test hook',async()=>{assert.equal(await ev('typeof window.__sidTest'),'undefined');});
  const report={date:new Date().toISOString(),engine:'System Google Chrome headless, native Node CDP, file://',browser:await send('Browser.getVersion'),clipboard,judgeSelfCheck,results,runtimeErrors:errors,summary:{passed:results.filter(r=>r.pass).length,failed:results.filter(r=>!r.pass).length,total:results.length},limitations:['物理Alt-Tab未测；blur与visibility仅由真实DOM事件及属性变更模拟','Safari与Firefox未测，本轮只覆盖系统Chrome headless','性能只测CPU更新及Canvas绘制命令提交，不含高DPI GPU呈现与整帧显示耗时','各浏览器密码管理器/历史记录驱动的自动补全行为未测；仅验证DOM autocomplete=off、无datalist/list/form','剪贴板真实读回结果见clipboard字段；其余成功/拒绝分支为明确标注的异步mock','未增加行走动画专项测试；地图sprite过滤按test hook mapIds及真实点击交叉验证']};
  await writeFile(join(root,'self-test-results.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report.summary));if(results.some(r=>!r.pass)||errors.length)process.exitCode=1;
} catch (error) {
  console.error('SELF-TEST ERROR',error,'Runtime errors:',JSON.stringify(errors),'Chrome:',chromeLog);if(ws)console.error('PAGE:',await ev('({url:location.href,ready:document.readyState,text:document.body?.textContent?.slice(0,500)})').catch(()=>null));
  await writeFile(join(root,'self-test-results.json'),JSON.stringify({date:new Date().toISOString(),engine:'System Google Chrome headless, native Node CDP, file://',clipboard,judgeSelfCheck,results,runtimeErrors:errors,fatalError:error.message,summary:{passed:results.filter(r=>r.pass).length,failed:results.filter(r=>!r.pass).length,total:results.length},limitations:['测试未正常完成，不能据此前旧报告宣称通过','物理Alt-Tab、Safari/Firefox、高DPI GPU呈现、各浏览器自动补全行为均未测']},null,2));process.exitCode=1;
} finally {
  if(ws)ws.close();
  if(chrome.exitCode===null){const exited=new Promise(resolve=>chrome.once('exit',resolve));chrome.kill('SIGTERM');await Promise.race([exited,timeout(1500)]);}
  await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100}).catch(error=>console.error('Temporary browser profile cleanup:',error.message));
}
