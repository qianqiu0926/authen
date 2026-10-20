import test from 'node:test';
import assert from 'node:assert/strict';
import {advance,claims,createRun,cut,intersects,resultOf,settings,settle,targetPosition} from '../src/consumer/games/sliceEngine.ts';
import {initialRoom,growthProgress} from '../src/consumer/model.ts';
import {newFarm} from '../src/consumer/farm.ts';
const now=Date.parse('2026-10-16T04:00:00Z');
const base=()=>({social:{posts:[],leaves:0,ledger:[],rewards:[],roomItems:[],room:initialRoom()},farm:newFarm(now),reports:[],settings:{}});
const place=(claim,id=0,x=90)=>({id,claim,lane:id%2,born:0,x,y:180,angle:0,drift:0});
test('fast diagonal and horizontal swipes hit the swept card, not nearby cards',()=>{
 const target={x:180,y:200};
 assert.equal(intersects({x:0,y:0},{x:360,y:400},target),true);
 assert.equal(intersects({x:0,y:200},{x:360,y:200},target),true);
 assert.equal(intersects({x:180,y:200},{x:180,y:200},target),true);
 assert.equal(intersects({x:0,y:120},{x:360,y:120},target),false);
 assert.equal(intersects({x:20,y:0},{x:20,y:400},target),false);
});
test('a swipe can slice two claims; a cut target never awards twice',()=>{
 const run=createRun('combo','easy');run.targets=[place(claims[0]),place(claims[1],1,270)];
 assert.equal(cut(run,{x:0,y:180},{x:360,y:180}).length,2);
 assert.equal(run.score,22);assert.equal(run.hits,2);assert.equal(run.bestCombo,2);
 assert.equal(cut(run,{x:0,y:180},{x:360,y:180}).length,0);assert.equal(run.score,22);
});
test('mistakes cost hearts and reset combo; game stops at zero hearts',()=>{
 const run=createRun('mistakes','easy');run.combo=4;
 for(let i=0;i<3;i++){run.targets=[place(claims[12],i)];cut(run,{x:90,y:180},{x:90,y:180});}
 assert.equal(run.hearts,0);assert.equal(run.combo,0);assert.equal(run.ended,true);assert.equal(resultOf(run).passed,false);
 run.targets=[place(claims[0])];assert.deepEqual(cut(run,{x:90,y:180},{x:90,y:180}),[]);
});
test('missing dubious content breaks streak; leaving reasonable content alone does not penalize',()=>{
 const run=createRun('miss','easy');run.nextWave=999;run.combo=5;run.elapsed=6;
 run.targets=[place(claims[12])];advance(run,.05);assert.equal(run.combo,5);assert.equal(run.hearts,3);
 run.targets=[place(claims[0])];advance(run,.05);assert.equal(run.combo,0);assert.equal(run.reviews[0].action,'miss');assert.equal(run.hearts,3);
});
test('full rounds have enough targets to pass and passive waiting cannot earn rewards',()=>{
 for(const speed of ['easy','rush']){
  const active=createRun(speed,speed,()=>.4), passive=createRun('passive',speed,()=>.4);
  for(let i=0;i<1300&&!active.ended;i++){
   advance(active,.05);
   for(const t of active.targets)if(t.claim.cut&&t.cutAt===undefined&&t.y<280&&t.y>100)cut(active,t,t);
  }
  assert.equal(active.ended,true);assert.equal(resultOf(active).passed,true);assert.ok(active.hits>=6);
  for(let i=0;i<1300&&!passive.ended;i++)advance(passive,.05);
  assert.equal(resultOf(passive).passed,false);assert.equal(passive.score,0);
 }
});
test('an unfinished or heartless round cannot pass even with enough points',()=>{
 const run=createRun('early','easy');run.score=100;run.hits=7;assert.equal(resultOf(run).passed,false);
 run.ended=true;run.hearts=0;assert.equal(resultOf(run).passed,false);
 run.hearts=1;assert.equal(resultOf(run).passed,true);
 run.hits=5;assert.equal(resultOf(run).passed,false);
});
test('reduced motion keeps cards stationary without stacking different claims',()=>{
 const target=place(claims[0]);assert.deepEqual(targetPosition(target,1,settings.easy.lifetime,true),targetPosition(target,4,settings.easy.lifetime,true));
 assert.notDeepEqual(targetPosition(target,1,settings.easy.lifetime),targetPosition(target,2,settings.easy.lifetime));
 for(const speed of ['easy','rush']){
  const run=createRun('still',speed,()=>.3);
  for(let i=0;i<1300&&!run.ended;i++){
   advance(run,.05,true);
   const live=run.targets.filter(t=>t.cutAt===undefined&&t.born<=run.elapsed);
   assert.ok(live.filter(t=>t.lane===0).length<=1);assert.ok(live.filter(t=>t.lane===1).length<=1);
   for(const t of live)if(t.claim.cut)cut(run,t,t);
  }
  assert.equal(run.hearts,3);assert.equal(resultOf(run).passed,true);
 }
});
test('completion pays once per round, leaves once per game and respects daily water cap',()=>{
 const result={id:'r1',score:100,hits:8,bestCombo:4,reviews:[],passed:true};let state=settle(base(),result,now);
 assert.equal(state.social.leaves,10);assert.equal(state.farm.water,8);assert.equal(state.slicerBest,100);assert.deepEqual(growthProgress(state),['learn']);
 state=settle(state,result,now);assert.equal(state.social.leaves,10);assert.equal(state.farm.water,8);
 state=settle(state,{...result,id:'r2',score:120},now);assert.equal(state.farm.water,10);assert.equal(state.slicerBest,120);
 state=settle(state,{...result,id:'r3'},now);assert.equal(state.farm.water,10);assert.equal(state.social.ledger.length,1);
 const fail=settle(base(),{...result,passed:false},now);assert.equal(fail.social.leaves,0);assert.equal(fail.farm.water,6);assert.equal(fail.slicerBest,100);
});
test('new game keeps past matching rewards, room purchases and other progress',()=>{
 const prior=base();prior.social.rewards=['matching-v1'];prior.social.leaves=27;prior.social.roomItems=['lamp'];
 const next=settle(prior,{id:'new',score:80,hits:6,bestCombo:2,reviews:[],passed:true},now);
 assert.equal(next.social.leaves,37);assert.deepEqual(next.social.rewards,['matching-v1','slicer-v1']);assert.deepEqual(next.social.roomItems,['lamp']);
});
