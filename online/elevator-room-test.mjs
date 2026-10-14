import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {createRoom,WORLD:W}=require('./room.js');
function fixture(){const r=createRoom();for(let i=0;i<4;i++)r.join('lift-'+i,'电梯'+i);return r;}
function body(r,a,p,target){return {commandId:'lift-'+target,roundId:r.room.roundId,expectedFloorId:a.floorId,expectedFloorRevision:a.floorRevision,portalId:p.id,targetFloorId:target};}
for(let from=1;from<=7;from++)for(let to=1;to<=7;to++)if(from!==to)for(const side of ['left','right']){
  const r=fixture(),a=r.room.players[0],p=W.floorPortal(from,side);a.floorId=from;a.x=p.x;a.y=p.y+14;a.spriteFacing='back';
  const req=body(r,a,p,to),before=a.floorRevision,res=r.floorChange(a.sessionId,req);
  assert.equal(res.ok,true,`${from}->${to}/${side}: ${res.error}`);assert.equal(a.floorId,to);assert.equal(res.floor.id,to);assert.equal(res.floor.name,W.floorById(to).name);assert.equal(a.floorRevision,before+1);
  assert.ok(W.inHall(to,side,a.x,a.y));assert.equal(W.floorCollides(to,a.x,a.y),false);
  assert.deepEqual(r.floorChange(a.sessionId,req),res);assert.equal(a.floorRevision,before+1);
  assert.equal(r.floorChange(a.sessionId,{...req,targetFloorId:from}).ok,false);
}
{
  const r=fixture(),a=r.room.players[0],p=W.floorPortal(1,'right');a.x=p.x;a.y=p.y+14;a.spriteFacing='front';
  assert.equal(r.floorChange(a.sessionId,body(r,a,p,5)).ok,false,'server must reject facing away');
  a.spriteFacing='back';for(const target of [0,8,1.5,1])assert.equal(r.floorChange(a.sessionId,body(r,a,p,target)).ok,false);
  a.x=1400;a.y=W.floorById(1).halls.find(h=>h.side==='right').entryY;
  assert.equal(r.floorChange(a.sessionId,body(r,a,p,5)).ok,false,'main floor is not lift hall');
  const d=W.floorById(1).glassDoors.find(d=>d.side==='right');a.x=d.x-20;a.y=d.y;
  r.step(.05);const s=r.publicSnapshot(a.id);assert.ok(Array.isArray(s.glassDoors));assert.equal(s.glassDoors.find(q=>q.id===d.id).open,true);
  assert.deepEqual(Object.keys(s.glassDoors[0]).sort(),['id','open']);
  assert.equal(r.publicSnapshot().glassDoors.length,0,'no viewer must not project all-floor occupancy');
}
console.log('PASS elevator-room: 84 same-side routes, idempotency, facing, hall admission, floor validation and privacy-safe doors');
