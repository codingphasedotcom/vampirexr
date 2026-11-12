import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { EnemyManager } from '../src/enemies.js';
import { LightBake } from '../src/world.js';

test('frozen enemies hold still and deal no contact damage, then resume', () => {
  const m = new EnemyManager(new THREE.Scene());
  const player = new THREE.Vector3(0, 0, 0);
  const e = m.spawn('ghoul', 0.9, 0, 1, 0, { scale: 1 });
  e.age = 1;
  e.frozenUntil = 5;
  const x0 = e.x;
  let contact = 0;
  for (let i = 0; i < 30; i++) contact += m.update(1 / 60, player, 1 + i / 60);
  assert.equal(contact, 0);
  assert.equal(e.x, x0);
  for (let i = 0; i < 30; i++) contact += m.update(1 / 60, player, 6 + i / 60);
  assert.ok(contact > 0, 'thawed enemies bite again');
});

test('light probes darken in baked shadow and brighten in light pools', () => {
  const b = new LightBake(), S = 1024, out = new THREE.Color();
  b.data = new Uint8Array(S * S * 4);
  for (let i = 0; i < S * S; i++) b.data[i * 4 + 3] = 255;           // fully open everywhere
  const px = (x, z) => ((Math.floor((z / 200 + 0.5) * S)) * S + Math.floor((x / 200 + 0.5) * S)) * 4;
  b.data[px(10, 10) + 3] = 0;                                          // deep shadow at (10, 10)
  b.data[px(-5, 3)] = 255; b.data[px(-5, 3) + 1] = 128;                 // orange light pool at (-5, 3)
  assert.deepEqual(b.probe(0, 0, out).toArray(), [1, 1, 1]);
  assert.ok(b.probe(10, 10, out).r < 0.5);
  const lit = b.probe(-5, 3, out);
  assert.ok(lit.r > 2 && lit.g > 1.5 && lit.b === 1);
  assert.deepEqual(b.probe(500, 0, out).toArray(), [1, 1, 1], 'outside the baked square is neutral');
  assert.ok(b.probe(10, 10, out, 0).r === 1, 'shadow strength 0 disables darkening');
});
