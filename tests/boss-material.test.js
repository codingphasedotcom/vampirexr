import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { EnemyManager } from '../src/enemies.js';
import { BOSSES } from '../src/bosses.js';

test('every boss keeps finite material colors at spawn, warning, hit and death', () => {
  const manager = new EnemyManager(new THREE.Scene());
  for (const def of BOSSES) {
    const boss = manager.spawnBoss(def, 0, -10);
    assert.equal(boss.warn, 0);
    const check = () => {
      manager.update(1/60, new THREE.Vector3(), 1);
      for (const v of boss.mesh.material.emissive.toArray()) assert.ok(Number.isFinite(v), `${def.name}: invalid emissive`);
    };
    check();
    assert.deepEqual(boss.mesh.material.emissive.toArray(), [0, 0, 0]);
    boss.warn = 1; check();
    boss.flash = 1; check();
    boss.dead = true; check();
    manager.reset();
  }
});
