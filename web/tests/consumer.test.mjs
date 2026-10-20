import {test} from 'node:test';
import assert from 'node:assert/strict';
import {viewport,initialRoom,bounded,extents,movePiece,placePiece,earn,buy} from '../src/consumer/model.ts';

test('desktop retains the native phone ratio and fits short windows',()=>{
  for(const [w,h] of [[1440,1000],[1024,768],[700,500],[1920,1080]]){
    const v=viewport(w,h);
    assert.equal(v.mobile,false);
    assert.equal(v.width,402);assert.equal(v.height,874);
    assert.ok(414*v.scale<=w-44+.001);
    assert.ok(886*v.scale<=h-44+.001);
  }
  assert.deepEqual(viewport(390,844),{mobile:true,width:390,height:844,scale:1});
});

test('one challenge gives one reward, and an owned item cannot charge twice',()=>{
  const s={posts:[],leaves:0,ledger:[],rewards:[],roomItems:[],room:initialRoom()};
  assert.equal(buy(s,'口红展台',10),s);
  const earned=earn(s,'matching-v1','完成一关');
  assert.equal(earned.leaves,10);
  assert.equal(earn(earned,'matching-v1','完成一关'),earned);
  const bought=buy(earned,'口红展台',10);
  assert.equal(bought.leaves,0);assert.equal(bought.ledger.length,2);
  assert.equal(buy(bought,'口红展台',10),bought);
  assert.deepEqual(bought.roomItems,['口红展台']);
});

test('rotated furniture stays on the floor and cannot move into another piece',()=>{
  const room=initialRoom();
  for(const piece of room.pieces)for(const angle of [0,45,90,135,270,405]){
    const p=bounded({...piece,x:100,z:-100,angle}),e=extents(p);
    assert.ok(p.x+e.x<=3.13001);assert.ok(p.z-e.z>=-2.53001);
  }
  assert.equal(movePiece(room,'stool',{x:-.7,z:-2.08}),room);
  const moved=movePiece(room,'stool',{angle:45,x:-.5});
  assert.notEqual(moved,room);
  assert.equal(moved.pieces.find(p=>p.id==='stool').angle,45);
  assert.equal(room.pieces.find(p=>p.id==='stool').angle,0);
  const placed=placePiece(room,'lipstick');
  assert.equal(placed.pieces.filter(p=>p.kind==='lipstick').length,1);
  assert.equal(placePiece(placed,'lipstick'),placed);
});
