import test from 'node:test';
import assert from 'node:assert/strict';
import { CastleSiege, ROOMS, confine } from '../src/siege.js';
function fixture() {
  const gates = [false,false,false], rewards=[];
  const g={player:{pos:{x:0,z:0}},world:{ambient:{setGate(i,v){if(i>=0)gates[i]=v;}}},bossFx:{reset(){}},hud:{toast(){}},sfx:{roar(){},levelup(){}},
    enemies:{list:[],get alive(){return this.list.length;},spawn(){const e={dead:false};this.list.push(e);return e;},spawnBoss(def){const e={t:def,dead:false};this.list.push(e);return e;}},
    chests:{reset(){},spawn(){rewards.push('chest');}},gems:{spawnHeal(){}},pickType(){return 'ghoul';},victory(){this.won=true;}};
  return {g,s:new CastleSiege(g),gates,rewards};
}
test('all four rooms require their complete encounter; bosses precede completion',()=>{
  const {g,s,gates,rewards}=fixture();
  for(let i=0;i<4;i++) {
    s.enter(i);s.update(2.1);
    assert.equal(s.cleared,false);
    for(let f=0;f<100;f++){g.enemies.list=[];s.update(1);if(s.cleared||g.boss)break;}
    if(ROOMS[i].boss){assert.equal(g.boss.t.name,ROOMS[i].boss);assert.equal(s.cleared,false);g.enemies.list=[];g.boss=null;s.update(0.1);}
    assert.equal(s.spawned,ROOMS[i].count);assert.equal(s.cleared,true);
    if(i<3)assert.equal(gates[i],true);
  }
  assert.equal(g.won,true);assert.equal(rewards.length,3);
});
test('locked room confines player; open gate permits passage and starts next room',()=>{
  const {g,s,gates}=fixture();s.enter(0);
  assert.equal(s.constrainPlayer(0,-15).z,-9.8);
  s.cleared=true;assert.equal(s.constrainPlayer(10,-14).x,2.5);
  g.player.pos.z=-13.5;s.update(0.1);assert.equal(s.index,1);assert.equal(gates[0],false);
});
test('summons and teleports are confined within current room',()=>{
  const p={x:300,z:50};confine(p,3);assert.deepEqual(p,{x:12.5,z:-56.5});
});
