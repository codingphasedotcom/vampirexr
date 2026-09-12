import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceWalk } from '../src/animation.js';
const enemy=()=>({x:0,z:0,walkX:0,walkZ:0,scale:1,t:{speed:2}});
function run(e,speed,dt=1/60){for(let i=0;i<Math.round(1/dt);i++){e.x+=speed*dt;advanceWalk(e,dt);}return e.walkTime;}
test('walk clock follows distance and remains frame-rate independent',()=>{
  assert.ok(Math.abs(run(enemy(),2)-1)<1e-8);
  assert.ok(Math.abs(run(enemy(),2,1/30)-1)<1e-8);
  assert.ok(Math.abs(run(enemy(),4)-2)<1e-8);
});
test('stationary creatures idle slowly; larger stride needs slower cadence',()=>{
  assert.ok(Math.abs(run(enemy(),0)-0.2)<1e-8);
  const large=enemy();large.scale=2;assert.ok(Math.abs(run(large,2)-0.5)<1e-8);
});
test('teleports do not accelerate walking and pauses do not advance it',()=>{
  const e=enemy();e.x=100;assert.ok(advanceWalk(e,1/60)<0.01);
  const before=e.walkTime;assert.equal(advanceWalk(e,0),before);
});
