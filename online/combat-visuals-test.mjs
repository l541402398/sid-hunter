// 生命/保护与休战人物的纯渲染回归；无需服务器、DOM或浏览器。
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const WORLD = require('./shared/world.js');
const { drawShield, drawHealthBar } = require('./public/js/render/combat.js');
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('PASS', name); }
function context() {
  const stack = [], calls = [];
  return {
    calls, globalAlpha: .8, fillStyle: '#123456', strokeStyle: '#654321', lineWidth: 3,
    imageSmoothingEnabled: true,
    save() { stack.push([this.globalAlpha, this.fillStyle, this.strokeStyle, this.lineWidth, this.imageSmoothingEnabled]); },
    restore() { assert.ok(stack.length, 'restore must match save'); [this.globalAlpha, this.fillStyle, this.strokeStyle, this.lineWidth, this.imageSmoothingEnabled] = stack.pop(); },
    fillRect(x, y, w, h) { assert.ok([x,y,w,h].every(Number.isFinite)); calls.push(['rect',x,y,w,h,this.fillStyle,this.globalAlpha]); },
    beginPath() { calls.push(['begin']); },
    moveTo(x,y) { assert.ok(Number.isFinite(x) && Number.isFinite(y)); calls.push(['move',x,y]); },
    lineTo(x,y) { assert.ok(Number.isFinite(x) && Number.isFinite(y)); calls.push(['line',x,y]); },
    closePath() { calls.push(['close']); },
    fill() { calls.push(['fill',this.fillStyle,this.globalAlpha]); },
    stroke() { calls.push(['stroke',this.strokeStyle,this.lineWidth,this.globalAlpha]); },
    get depth() { return stack.length; }
  };
}
const stateOf = g => [g.globalAlpha,g.fillStyle,g.strokeStyle,g.lineWidth,g.imageSmoothingEnabled,g.depth];
const colors = Object.fromEntries(Object.entries(WORLD.PALETTES).map(([key,palette]) => [key,palette[0]]));
const player = { id: 1, x: 80, y: 110, colors, alive: true, protected: true, online: true, moving: true, walk: 20, spriteFacing: 'front' };
test('保护罩仅在有效保护且对抗中绘制，无保护/休战/非法坐标零绘制', () => {
  for (const p of [null,{...player,protected:false},{...player,alive:false},{...player,truce:true},{...player,x:NaN}]) {
    const g = context(), before = stateOf(g);
    assert.equal(drawShield(g,p,1),false); assert.equal(g.calls.length,0); assert.deepEqual(stateOf(g),before);
  }
  const g = context(), before = stateOf(g);
  assert.equal(drawShield(g,player,1),true); assert.equal(g.calls.filter(c=>c[0]==='stroke').length,3);
  assert.deepEqual(stateOf(g),before);
});
test('保护罩不读取阵营，轮廓固定、呼吸仅改透明度，离线仍降低透明度', () => {
  const safe = new Proxy(player,{get(p,key){assert.notEqual(key,'faction');return p[key];}});
  const a = context(), b = context(), offline = context();
  drawShield(a,safe,0); drawShield(b,safe,1); drawShield(offline,{...player,online:false},0);
  assert.deepEqual(a.calls.filter(c=>['move','line'].includes(c[0])),b.calls.filter(c=>['move','line'].includes(c[0])));
  const alpha = g => g.calls.filter(c=>c[0]==='stroke')[1].at(-1);
  assert.notEqual(alpha(a),alpha(b)); assert.ok(alpha(offline)<alpha(a));
  assert.ok(a.calls.find(c=>c[0]==='fill').at(-1)<.03,'内衬不遮挡角色配色');
  const old = context(); drawShield(old,player,0,53);
  assert.ok(old.calls.find(c=>c[0]==='move')[2]>a.calls.find(c=>c[0]==='move')[2]);
});
test('分格生命条覆盖1–20格，0生命/休战空槽，保护颜色不依赖阵营', () => {
  for (const maxHp of [1,3,8,20]) for (const hp of [0,1,maxHp]) {
    const g = context(), before = stateOf(g);
    assert.equal(drawHealthBar(g,{x:5,y:7,width:82,hp,maxHp}),true);
    const rects = g.calls.filter(c=>c[0]==='rect');
    assert.ok(rects.every(c=>c[1]>=5&&c[2]>=7&&c[1]+c[3]<=87&&c[2]+c[4]<=13));
    assert.equal(rects.length,2+(hp>0?2:0)+maxHp-1);
    assert.deepEqual(stateOf(g),before);
  }
  const active = context(), truce = context(), shielded = context();
  drawHealthBar(active,{x:0,y:0,width:80,hp:3,maxHp:3});
  drawHealthBar(truce,{x:0,y:0,width:80,hp:3,maxHp:3,truce:true});
  drawHealthBar(shielded,{x:0,y:0,width:80,hp:3,maxHp:3,protected:true});
  assert.equal(truce.calls.filter(c=>c[0]==='rect').length,4,'休战即使传入旧生命值也只画空槽');
  assert.notEqual(active.calls[2][5],shielded.calls[2][5]);
  const invalid = context(); assert.equal(drawHealthBar(invalid,{x:0,y:0,width:NaN}),false); assert.equal(invalid.calls.length,0);
});
function body(p, direction, age, renderer) {
  const g = context(), before = stateOf(g), bodies = [];
  if (renderer) global.window = { SID: { characterSprites: {
    status: 'ready', style: () => renderer, bodyBob: () => 1,
    drawBody(ctx,person,facing,clock,options) { bodies.push({facing,alpha:ctx.globalAlpha,holes:!!options?.holes}); return true; }
  } } };
  try { WORLD.drawCharacterBody(g,{...p,spriteFacing:direction},1,age,direction); }
  finally { delete global.window; }
  assert.deepEqual(stateOf(g),before);
  return { rects:g.calls.filter(c=>c[0]==='rect'), bodies };
}
test('新旧人物休战仍播放四向J挥锤，同样的手臂/锤头几何、轻度透明且ctx恢复', () => {
  for (const renderer of [null,'male','female']) for (const direction of ['front','left','right','back']) {
    const active = body(player,direction,90,renderer);
    const truce = body({...player,alive:false,truce:true},direction,90,renderer);
    assert.deepEqual(truce.rects.map(c=>c.slice(0,6)),active.rects.map(c=>c.slice(0,6)),'休战不能删除挥锤几何');
    assert.ok(truce.rects.length>50,'挥锤必须实际画出手臂与木锤');
    if (renderer) {
      assert.equal(truce.bodies.length,1); assert.equal(truce.bodies[0].holes,true);
      assert.equal(truce.bodies[0].alpha,.7); assert.equal(active.bodies[0].alpha,1);
      const offline = body({...player,alive:false,online:false},direction,null,renderer);
      assert.equal(offline.bodies[0].alpha,.7*.55);
    }
  }
});
test('旧人物休战移动仍有交替抬脚，不会换成幽灵或定格', () => {
  const a = body({...player,alive:false,walk:0},'front',null);
  const b = body({...player,alive:false,walk:12},'front',null);
  assert.notDeepEqual(a.rects.map(c=>c.slice(1,5)),b.rects.map(c=>c.slice(1,5)));
  assert.equal(a.rects[1].at(-1),.7);
});
test('浏览器与Node使用同一零依赖绘制API', () => {
  const env = { window: {} };
  vm.runInNewContext(readFileSync(new URL('./public/js/render/combat.js',import.meta.url),'utf8'),env);
  assert.equal(typeof env.window.SID.combatVisuals.drawShield,'function');
  assert.equal(typeof env.window.SID.combatVisuals.drawHealthBar,'function');
});
console.log(`对抗视觉轻量检查 ${passed} PASS；未启动HTTP或Chrome。`);
