import test from 'node:test';
import assert from 'node:assert/strict';
import {actFarm,newFarm,syncFarm,growth,nourish,contentKey} from '../src/consumer/farm.ts';
import {initialRoom} from '../src/consumer/model.ts';
const t=Date.parse('2026-10-16T02:00:00Z');
const base=()=>({farm:newFarm(t),reports:[],settings:{},social:{posts:[],leaves:15,rewards:['growth-v1'],ledger:[],roomItems:['lamp'],room:initialRoom()}});
test('harvest empties the plot, pays once and allows repeated planting without touching old rewards',()=>{
 let s=base();assert.equal(actFarm(s,{type:'harvest',plot:0},t+1000),s);
 s=actFarm(s,{type:'harvest',plot:0},t+45000);assert.equal(s.farm.plots[0],null);assert.equal(s.social.leaves,17);assert.deepEqual(s.social.roomItems,['lamp']);
 assert.equal(actFarm(s,{type:'harvest',plot:0},t+45000),s);
 s=actFarm(s,{type:'plant',plot:0,flower:'rose'},t+45000);s=actFarm(s,{type:'harvest',plot:0},t+90000);assert.equal(s.farm.harvested,2);assert.equal(s.social.leaves,19);
});
test('watering costs one drop and only shortens each planting once; reload preserves growth',()=>{
 let s=base();s=actFarm(s,{type:'water',plot:0},t+1000);assert.equal(s.farm.water,5);assert.equal(actFarm(s,{type:'water',plot:0},t+2000),s);
 assert.equal(growth(s.farm.plots[0],t+15000),1);const restored=JSON.parse(JSON.stringify(s));assert.equal(growth(restored.farm.plots[0],t+16000),1);
 const dry={...s,farm:{...s.farm,water:0}};assert.equal(actFarm(dry,{type:'water',plot:1},t+2000),dry);
});
test('daily allowances are capped and cannot reset by moving time backwards',()=>{
 let s=base();for(let i=0;i<9;i++)s=nourish(s,'check','content'+i,t);assert.equal(s.farm.water,12);assert.equal(s.farm.tasks.check.length,3);
 const next=syncFarm(s.farm,t+86400000);assert.equal(next.water,18);assert.deepEqual(next.tasks.check,[]);
 assert.equal(syncFarm(next,t+86400000).water,18);assert.equal(syncFarm(next,t).water,18);assert.equal(syncFarm(next,t).day,next.day);
 let game=base();game=nourish(game,'learn','one',t);game=nourish(game,'learn','one',t);assert.equal(game.farm.water,8);game=nourish(game,'learn','two',t);game=nourish(game,'learn','three',t);assert.equal(game.farm.water,10);
 assert.equal(contentKey('same'),contentKey('same'));assert.notEqual(contentKey('same'),contentKey('different'));
});
test('season and collection keep growing after daily leaf cap; rare seeds unlock through harvests',()=>{
 let s=base();assert.equal(actFarm(s,{type:'plant',plot:2,flower:'camellia'},t),s);
 for(let i=0;i<15;i++){let at=t+(i+1)*45000;s=actFarm(s,{type:'harvest',plot:0},at);s=actFarm(s,{type:'plant',plot:0,flower:'rose'},at);}
 assert.equal(s.farm.harvested,15);assert.equal(s.farm.collection.rose,15);assert.equal(s.farm.dailyLeaves,20);assert.equal(s.social.leaves,35);
 s=actFarm(s,{type:'plant',plot:2,flower:'camellia'},t+16*45000);assert.equal(s.farm.plots[2].flower,'camellia');assert.equal(actFarm(s,{type:'plant',plot:2,flower:'rose'},t+16*45000),s);
 assert.equal(actFarm(s,{type:'plant',plot:99,flower:'rose'},t),s);
});
test('old state receives a garden; daily water has a storage ceiling and old plots do not reset',()=>{
 const fresh=syncFarm(undefined,t);assert.equal(fresh.water,6);assert.equal(fresh.plots.length,4);
 const next=syncFarm({...fresh,water:23},t+86400000);assert.equal(next.water,24);assert.deepEqual(next.plots,fresh.plots);
});
