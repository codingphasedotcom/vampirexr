import test from 'node:test';
import assert from 'node:assert/strict';
import { radarHeading } from '../src/minimap.js';
test('radar keeps targets in front above player at every cardinal heading',()=>{
  for(const dir of [{x:0,z:-1},{x:1,z:0},{x:0,z:1},{x:-1,z:0}]){
    const a=radarHeading(dir), c=Math.cos(a),s=Math.sin(a);
    const project=(x,z)=>({x:x*c-z*s,y:x*s+z*c});
    const front=project(dir.x*10,dir.z*10),behind=project(-dir.x*10,-dir.z*10),right=project(-dir.z*10,dir.x*10);
    assert.ok(Math.abs(front.x)<1e-8 && front.y<0);
    assert.ok(behind.y>0);
    assert.ok(right.x>0 && Math.abs(right.y)<1e-8);
  }
});
