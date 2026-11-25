// 生命/保护与休战人物的纯渲染回归；无需服务器、DOM或浏览器。
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const WORLD = require('./shared/world.js');
const { drawHealthBar } = require('./public/js/render/combat.js');
const motion = { matches: false };
const browser = { window: { Image: class { complete = true; naturalWidth = 1280; }, matchMedia: () => motion } };
vm.runInNewContext(readFileSync(new URL('./public/js/render/combat.js', import.meta.url), 'utf8'), browser);
const { drawProtectionCocoon } = browser.window.SID.combatVisuals;
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('PASS', name); }
function context() {
  const stack = [], calls = [];
  return {
    calls, globalAlpha: .8, fillStyle: '#123456', strokeStyle: '#654321', lineWidth: 3,
    imageSmoothingEnabled: true,
    save() { stack.push([this.globalAlpha, this.fillStyle, this.strokeStyle, this.lineWidth, this.imageSmoothingEnabled]); },
    restore() { assert.ok(stack.length, 'restore must match save'); [this.globalAlpha, this.fillStyle, this.strokeStyle, this.lineWidth, this.imageSmoothingEnabled] = stack.pop(); },
    drawImage(image, ...coordinates) { calls.push(['image', image.src, ...coordinates, this.globalAlpha, this.imageSmoothingEnabled]); },
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
test('光茧仅在有效受击保护期间绘制，敲击眩晕和休战不触发', () => {
  for (const p of [null,{...player,protected:false,stunUntil:9999},{...player,alive:false},{...player,truce:true},{...player,x:NaN}]) {
    const g = context(), before = stateOf(g);
    assert.equal(drawProtectionCocoon(g,p,1),false); assert.equal(g.calls.length,0); assert.deepEqual(stateOf(g),before);
  }
  const g = context(), before = stateOf(g);
  assert.equal(drawProtectionCocoon(g,player,1),true);
  assert.deepEqual(g.calls[0].slice(0,10), ['image','/assets/fx/protection-cocoon-frames.png',480,0,80,100,40,21,80,100]);
  assert.equal(g.calls.length, 1);
  assert.equal(g.calls[0].at(-1), false);
  assert.deepEqual(stateOf(g),before);
});
test('光茧播放动画、离线降低透明度且绘制不读阵营，减少动态效果时显示静态首帧', () => {
  const safe = new Proxy(player,{get(p,key){assert.notEqual(key,'faction');return p[key];}});
  const a = context(), b = context(), offline = context();
  drawProtectionCocoon(a,safe,0); drawProtectionCocoon(b,safe,.4); drawProtectionCocoon(offline,{...player,online:false},0);
  assert.deepEqual(a.calls[0].slice(3,10), b.calls[0].slice(3,10));
  assert.ok(b.calls[0][2] > a.calls[0][2]);
  const alpha = g => g.calls[0].at(-2);
  assert.ok(alpha(offline)<alpha(a));
  const old = context(); drawProtectionCocoon(old,player,0,53);
  assert.ok(old.calls[0][8] < a.calls[0][8]);
  motion.matches = true;
  const still = context(); drawProtectionCocoon(still,player,1);
  motion.matches = false;
  assert.equal(still.calls[0][2], 0);
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
test('无图片环境使用像素幽灵后备绘制，四向挥锤保留', () => {
  const ghost = {...player,alive:false,truce:true,colors:undefined};
  for (const direction of ['front','left','right','back']) {
    const idle = body(ghost,direction,null);
    assert.ok(idle.rects.some(c=>c[3]===26&&c[4]===22&&c[5]==='#a8ccf0'),'后备蓝色灵体主体');
    const swing = body(ghost,direction,90,'male');
    assert.deepEqual(swing.rects.slice(0,idle.rects.length),idle.rects);
    assert.ok(swing.rects.some(c=>c[5]==='#986039'),'显示木锤握柄');
    assert.deepEqual(swing.bodies,[]);
  }
});
test('休战学士帽贴图围绕地面锚点悬浮，保留挥锤和离线透明度', () => {
  const source = readFileSync(new URL('./shared/world/sprite.js', import.meta.url), 'utf8');
  const ghost = {...player, id:0, alive:false, truce:true, colors:undefined};
  class Image {
    complete = true;
    naturalWidth = 56;
  }
  for (const base of ['https://game.test/shared/world/', 'file:///game/online/shared/world/']) {
    const env = { URL, window: { Image, document: { currentScript: { src: base + 'sprite.js' } } } };
    vm.runInNewContext(source,env);
    const { drawCharacterBody, ghostBodyBounds, ghostBodyBob } = env.window.SID_WORLD_PARTS;
    assert.equal(ghostBodyBounds(player),null);
    assert.deepEqual({...ghostBodyBounds(ghost)}, { x:-28, y:-81, w:56, h:78 });
    const idle = context(), swing = context(), offline = context(), before = stateOf(idle);
    drawCharacterBody(idle,ghost,0);
    drawCharacterBody(swing,ghost,0,90,'front');
    const clock = Math.PI/4.8;
    drawCharacterBody(offline,{...ghost,online:false},clock);
    const imageCall = g => g.calls.find(call => call[0]==='image');
    assert.deepEqual(imageCall(idle), ['image',base+'assets/scholar-ghost.png',52,32,56,72,.88,false]);
    assert.equal(ghostBodyBob(ghost,clock),3);
    assert.equal(imageCall(offline)[3],imageCall(idle)[3]+ghostBodyBob(ghost,clock));
    assert.equal(imageCall(offline).at(-2),.52);
    assert.ok(swing.calls.slice(swing.calls.indexOf(imageCall(swing))+1).some(call => call[5]==='#986039'));
    assert.deepEqual(stateOf(idle),before);
  }
});
test('离线对抗玩家保留半透明人形，离线休战玩家显示黯淡的幽灵', () => {
  const active = body(player,'front',null,'male');
  const offline = body({...player,online:false},'front',null,'male');
  assert.deepEqual(active.bodies,[{facing:'front',alpha:1,holes:false}]);
  assert.deepEqual(offline.bodies,[{facing:'front',alpha:.55,holes:false}]);
  const offlineGhost = body({...player,truce:true,online:false},'front',null,'male');
  assert.deepEqual(offlineGhost.bodies,[]);
  assert.ok(offlineGhost.rects.some(c=>c[3]===26&&c[4]===22&&c[5]==='#9aa2b2'&&c[6]===.52));
});
test('浏览器与Node使用同一零依赖绘制API', () => {
  const env = { window: {} };
  vm.runInNewContext(readFileSync(new URL('./public/js/render/combat.js',import.meta.url),'utf8'),env);
  assert.equal(typeof env.window.SID.combatVisuals.drawProtectionCocoon,'function');
  assert.equal(typeof env.window.SID.combatVisuals.drawHealthBar,'function');
});
console.log(`对抗视觉轻量检查 ${passed} PASS；未启动HTTP或Chrome。`);
