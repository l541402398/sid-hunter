import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const W = require('./shared/world.js');
assert.equal(W.FLOOR_W / W.X_SPAN, .96);
assert.equal(W.FLOOR_H / W.Y_SPAN, .4);
assert.equal(W.floorById(0), null);
assert.equal(W.floorById(8), null);
assert.deepEqual(W.floorOptions().map(f => f.id), [1, 2, 3, 4, 5, 6, 7]);
const expectedContainers = ['reception-132-173', 'counter-1990-165', 'table-2010-514', 'cabinet-785-160', 'desk-1035-172', 'desk-1690-172', 'desk-2940-172', 'table-2535-513', 'desk-3600-172', 'locker-7000-770', 'hall1-340-300', 'printer2-590-370', 'docs3-590-290', 'ticket4-590-280', 'duty5-610-305', 'safe6-640-355', 'bar7-480-300'];
// 阶段4（需求③）：每层大量新增可搜容器，因此这里从"精确等于 17 个"改成
// "登记过的 17 个经济容器必须全部仍在"（经济键不能被增删悄悄改掉），再校验总量只增不减。
const floorContainerIds = Object.values(W.FLOORS).flatMap(f => W.floorContainers(f.id).map(c => c.id));
for (const id of expectedContainers) assert.ok(floorContainerIds.includes(id), `经济容器丢失：${id}`);
assert.equal(new Set(floorContainerIds).size, floorContainerIds.length, '容器 ID 必须唯一');
assert.ok(floorContainerIds.length >= expectedContainers.length, '容器数量不应减少');
assert.deepEqual(W.NPCS.map(n => n.id).sort(), ['npc-archive', 'npc-reception']);
function reachable(id, start, end, doors) {
  const b = W.floorBounds(id), blockers = W.floorBlockers(id, doors), step = 4;
  const originX = b.minX, originY = b.minY;
  const snap = p => [Math.round((p.x-originX)/step), Math.round((p.y-originY)/step)];
  const [sx,sy] = snap(start), [ex,ey] = snap(end), queue = [[sx,sy]], seen = new Set([sx+':'+sy]);
  for(let i=0;i<queue.length;i++) {
    const [x,y]=queue[i]; if(Math.abs(x-ex)<=1&&Math.abs(y-ey)<=1) return true;
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx=x+dx,ny=y+dy,px=originX+nx*step,py=originY+ny*step,k=nx+':'+ny;
      if(px<b.minX||px>b.maxX||py<b.minY||py>b.maxY||seen.has(k)||W.floorCollides(id,px,py,blockers)) continue;
      seen.add(k);queue.push([nx,ny]);
    }
  }
  return false;
}
for(const f of Object.values(W.FLOORS)) {
  assert.equal(f.width,1440); assert.equal(f.height,400);
  assert.equal(f.halls.length,2);
  assert.deepEqual(f.portals.map(p=>p.id),[`f${f.id}:portal:left`,`f${f.id}:portal:right`]);
  for(const h of f.halls) {
    assert.equal(h.w,144);assert.equal(h.h,96);
    assert.ok(h.side==='left'?h.x+h.w===0:h.x===1440);
    const door=f.glassDoors.find(d=>d.hallId===h.id);
    assert.equal(door.opening,48);
    const p=W.floorPortal(f.id,h.side),landing=W.elevatorLanding(f.id,h.side);
    assert.ok(W.inHall(f.id,h.side,p.x,p.y));assert.ok(W.inHall(f.id,h.side,landing.x,landing.y));
    assert.equal(W.floorCollides(f.id,landing.x,landing.y),false);
    const open=W.advanceGlassDoors(f.id,{},[{floorId:f.id,online:true,alive:true,x:door.x,y:door.y}],1000);
    assert.equal(open[door.id].open,true);
    assert.equal(W.floorCollides(f.id,door.x,door.y,W.floorBlockers(f.id,open)),false);
    assert.equal(W.floorCollides(f.id,door.x,door.y,W.floorBlockers(f.id,{})),true);
    assert.equal(W.advanceGlassDoors(f.id,open,[],1100)[door.id].open,true);
    assert.equal(W.advanceGlassDoors(f.id,open,[],2000)[door.id].open,false);
    assert.equal(W.advanceGlassDoors(f.id,open,[{floorId:f.id,online:true,alive:true,x:door.x,y:door.y}],2000)[door.id].open,true);
    assert.ok(reachable(f.id,h.approach,landing,open),`${f.id}F ${h.side} approach -> lift`);
    const seed=W.floorSpawns(f.id).find(s=>reachable(f.id,s,h.approach,open));
    assert.ok(seed,`${f.id}F ${h.side} spawn -> approach`);
  }
  assert.equal(W.inFloor(f.id,-160,100),false);
  if(f.id>=2&&f.id<=6) assert.equal(W.inFloor(f.id,20,350),false,'preserve southwest notch');
}
console.log('PASS elevator-world: 14 halls, openings, anti-pinch, BFS, bounds, IDs and 1-based floor contract');
