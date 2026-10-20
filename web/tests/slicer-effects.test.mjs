import test from 'node:test';
import assert from 'node:assert/strict';
import {access} from 'node:fs/promises';
import {claims,createRun,cut,intersects,advance,CUT_SECONDS} from '../src/consumer/games/sliceEngine.ts';
import {cheer,cosmeticOf,flight,halfPolygon,impactOf,newSweep,recordSweep,screenPoint,EFFECT_SECONDS} from '../src/consumer/games/sliceEffects.ts';
const target=(id,claim,x,y=190,angle=0)=>({id,claim,x,y,angle,lane:id%2,drift:0,born:0});
test('touch coordinates account for the desktop phone scale and mobile viewport',()=>{
  assert.deepEqual(screenPoint({x:250,y:200},{left:100,top:100,width:300,height:200}),{x:180,y:200});
  assert.equal(screenPoint({x:1,y:2},{left:0,top:0,width:0,height:200}),null);
  assert.equal(screenPoint({x:NaN,y:2},{left:0,top:0,width:300,height:200}),null);
});
test('fast reverse swipe processes targets in contact order, preserving streak semantics',()=>{
  const r=createRun('reverse','easy');r.combo=3;r.targets=[target(0,claims[0],90),target(1,claims[12],270)];
  const hits=cut(r,{x:360,y:190},{x:0,y:190});
  assert.deepEqual(hits.map(h=>h.id),[1,0]);assert.equal(r.combo,1);assert.equal(r.score,10);assert.equal(r.hearts,2);assert.equal(hits[0].cutAngle,180);
});
test('captured pointers outside the arena cannot cut an offscreen card',()=>{
  const r=createRun('outside','easy');r.targets=[target(0,claims[0],90,470)];
  assert.equal(cut(r,{x:90,y:500},{x:90,y:430}).length,0);
  assert.equal(cut(r,{x:90,y:200},{x:90,y:600}).length,0);
  r.targets=[target(1,claims[0],90,190)];assert.equal(cut(r,{x:90,y:-100},{x:90,y:600}).length,1);
});
test('collision respects a rotated card instead of its unrotated bounding box',()=>{
  const t={x:180,y:190,angle:45};
  assert.equal(intersects({x:235,y:240},{x:235,y:240},t),false);
  assert.equal(intersects({x:180,y:190},{x:180,y:190},t),true);
  assert.equal(intersects({x:0,y:0},{x:360,y:380},t),true);
});
test('diagonal cuts preserve their direction and removed cards do not reward again',()=>{
  const r=createRun('diagonal','easy');r.targets=[target(0,claims[0],180,200)];
  const hits=cut(r,{x:0,y:20},{x:360,y:380});assert.equal(hits.length,1);assert.equal(hits[0].cutAngle,45);
  const score=r.score;assert.equal(cut(r,{x:0,y:20},{x:360,y:380}).length,0);assert.equal(r.score,score);
  r.nextWave=999;for(let i=0;i<10;i++)advance(r,.1);assert.equal(r.targets.length,0);assert.ok(CUT_SECONDS>.6);
});
test('one sweep across two correct cards earns double-cut feedback with actual points',()=>{
  const r=createRun('double','easy');r.targets=[target(0,claims[0],90),target(1,claims[1],270)];
  const hits=cut(r,{x:0,y:190},{x:360,y:190}),s=recordSweep(newSweep(),hits,2);
  assert.equal(s.count,2);assert.equal(s.points,22);assert.equal(cheer(r.combo,s,true).title,'一刀双切！');
});
test('different frames in the same gesture combine, but waiting or a fresh gesture does not',()=>{
  const a={...target(0,claims[0],90),points:10},b={...target(1,claims[1],270),points:12};
  const first=recordSweep(newSweep(),[a],1),second=recordSweep(first,[b],1.3);
  assert.equal(second.count,2);assert.equal(first.count,1);
  assert.equal(recordSweep(first,[b],2).count,1);assert.equal(recordSweep(newSweep(),[b],1.3).count,1);
});
test('a sweep that hits a reasonable statement never gets a double-cut celebration',()=>{
  const bad=target(0,claims[0],90),good=target(1,claims[12],270);
  const s=recordSweep(newSweep(),[bad,good,bad],1);assert.equal(s.spoiled,true);assert.equal(cheer(2,s,true).tone,'wrong');
  assert.equal(cheer(5,recordSweep(newSweep(),[bad],1),true).tone,'fever');
});
test('each teaching card contains a real existing cosmetic sprite that can fly out',async()=>{
  for(const name of new Set(claims.map(cosmeticOf))){assert.ok(['lipstick','compact','perfume','mascara'].includes(name));await access(new URL('../public/app/'+name+'.png',import.meta.url));}
});
test('split polygons stay inside the card for all swipe angles',()=>{
  for(const angle of [-180,-90,-24,0,45,90,179])for(const side of [0,1]){
    const p=halfPolygon(angle,side),values=Array.from(p.matchAll(/(-?\d+(?:\.\d+)?)%/g),m=>Number(m[1]));
    assert.ok(values.length>=6);assert.ok(values.every(v=>v>=0&&v<=100));
  }
  assert.notEqual(halfPolygon(0,0),halfPolygon(90,0));
});
test('flight starts at the cut, expands visibly and then fully disappears',()=>{
  const t={...target(0,claims[0],90,210),points:10,cutAngle:20};const hit=impactOf(t,1,3);
  const early=flight(hit,0),pop=flight(hit,.22),end=flight(hit,EFFECT_SECONDS);
  assert.equal(early.x,90);assert.ok(pop.scale>early.scale*2);assert.ok(pop.y<early.y);assert.equal(end.opacity,0);
  for(const age of [0,.1,.3,.8,2])assert.ok(Object.values(flight(hit,age)).every(Number.isFinite));
});
