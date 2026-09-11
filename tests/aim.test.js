import test from 'node:test';
import assert from 'node:assert/strict';
import { traceEnemy } from '../src/aim.js';
const dir = { x: 0, y: 0, z: -1 };
const enemy = (extra = {}) => ({ x: 0, z: -10, size: 1, scale: 1, phase: 0, t: { y: 1 }, ...extra });
const ray = (x = 0, y = 1, e = enemy(), range = 60) => traceEnemy({ x, y, z: 0 }, dir, e, 0, range);
test('center shots earn precision; edge hits do not', () => {
  assert.equal(ray().precision, true);
  assert.equal(ray(0.4).precision, false);
  assert.equal(ray(0.7), null);
  assert.ok(Math.abs(ray().t - 9.4) < 1e-8);
});
test('large and small enemies use their scaled center', () => {
  assert.equal(ray(0, 2, enemy({ scale: 2, size: 2 })).precision, true);
  assert.equal(ray(0, 0.5, enemy({ scale: 0.5, size: 0.5 })).precision, true);
});
test('flight bob and bosses use their render motion', () => {
  for (const boss of [false, true]) {
    const e = enemy({ phase: Math.PI / 2, t: { y: 1, fly: true, boss } });
    assert.equal(ray(0, 1 + (boss ? 0.3 : 0.18), e).precision, true);
  }
});
test('reject dead, behind and beyond range targets', () => {
  assert.equal(ray(0, 1, enemy({ dead: true })), null);
  assert.equal(ray(0, 1, enemy({ z: 10 })), null);
  assert.equal(ray(0, 1, enemy(), 9), null);
  assert.ok(ray(0, 1, enemy({ z: -60.3 })));
});
test('inside-sphere hit has nonnegative distance', () => {
  assert.equal(ray(0, 1, enemy({ z: 0.1 })).t, 0);
});
