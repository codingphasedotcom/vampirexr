import * as THREE from 'three';
import { batGeometry, ghoulGeometry, wraithGeometry, bruteGeometry, creatureMaterial, tagForShaderAnim, enemyTime } from './creatures.js';
import { loadVATModel, vatMaterial, loadStaticModel } from './models.js';

// `y` is the model's visual centre (used for particles / damage numbers); models stand on y = 0.
export const ENEMY_TYPES = {
  bat:    { hp: 6,   speed: 3.2, dmg: 3,  size: 0.45, y: 1.35, color: 0x9b5de5, xp: 1, fly: true,
            build: batGeometry, anim: ['FLAP'],
            model: { url: '/models/bat.glb', height: 0.5, lift: 1.1, yaw: 0, animated: false } },
  ghoul:  { hp: 22,  speed: 2.1, dmg: 6,  size: 0.8,  y: 1.0,  color: 0x7fd36a, xp: 2,
            build: ghoulGeometry, anim: ['SHAMBLE', { speed: 7, hip: 0.55 }],
            model: { url: '/models/ghoul.glb', height: 1.7, yaw: 0, rate: 1.0 } },
  wraith: { hp: 40,  speed: 2.8, dmg: 9,  size: 0.9,  y: 1.3,  color: 0x7ff3ff, xp: 4, fly: true,
            build: wraithGeometry, anim: ['WAVE'],
            model: { url: '/models/wraith.glb', height: 1.9, lift: 0.25, yaw: 0, animated: false } },
  brute:  { hp: 130, speed: 1.4, dmg: 16, size: 1.5,  y: 1.4,  color: 0xff4d5a, xp: 8,
            build: bruteGeometry, anim: ['SHAMBLE', { speed: 4.5, hip: 0.6 }],
            model: { url: '/models/brute.glb', height: 2.4, yaw: 0, rate: 0.9 } },
};
const MAX = { bat: 320, ghoul: 220, wraith: 120, brute: 60 };
const CELL = 2;
const dummy = new THREE.Object3D();
const _c = new THREE.Color();
const cellKey = (cx, cz) => (cx + 2048) * 4096 + (cz + 2048);

export class EnemyManager {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.meshes = {};
    this.phases = {};
    this.counts = {};
    this.grid = new Map();
    for (const [name, t] of Object.entries(ENEMY_TYPES)) {
      const geo = t.build();
      const phase = new THREE.InstancedBufferAttribute(new Float32Array(MAX[name]), 1).setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('aPhase', phase);
      const mesh = new THREE.InstancedMesh(geo, creatureMaterial(t.anim[0], t.anim[1]), MAX[name]);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.setColorAt(0, _c.setScalar(1)); // allocates instanceColor; used as a brightness multiplier for hit flashes
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      scene.add(mesh);
      this.meshes[name] = mesh;
      this.phases[name] = phase;
      this.counts[name] = 0;
    }
    this.counts.boss = 0;
  }

  get alive() { return this.list.length; }

  // Swap procedural horde meshes for baked-animation GLB models where one is configured.
  // Runs in the background; a type keeps its procedural look if its model fails to load.
  // Loads one configured model. Animated GLBs are baked to a VAT; static ones get the procedural
  // creature shader (flap / wave / shamble) driven by the type's `anim` mode.
  async loadModel(t) {
    if (t.model.animated === false) {
      const m = await loadStaticModel(t.model.url, t.model);
      tagForShaderAnim(m.geometry);
      return { geometry: m.geometry, material: creatureMaterial(t.anim[0], t.anim[1], m.map) };
    }
    const vat = await loadVATModel(t.model.url, t.model);
    return { geometry: vat.geometry, material: vatMaterial(vat, enemyTime, { rate: t.model.rate }) };
  }

  async loadModels(bossDefs = []) {
    this.bossModels = {};
    for (const def of bossDefs) {
      if (!def.model) continue;
      this.loadModel(def).then((m) => { this.bossModels[def.name] = m; })
        .catch((err) => console.warn(`Boss model for ${def.name} not loaded, keeping procedural:`, err.message || err));
    }
    for (const [name, t] of Object.entries(ENEMY_TYPES)) {
      if (!t.model) continue;
      try {
        const { geometry, material } = await this.loadModel(t);
        geometry.setAttribute('aPhase', this.phases[name]);
        const mesh = new THREE.InstancedMesh(geometry, material, MAX[name]);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.frustumCulled = false;
        mesh.setColorAt(0, _c.setScalar(1));
        mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
        mesh.count = 0;
        this.scene.remove(this.meshes[name]);
        this.scene.add(mesh);
        this.meshes[name] = mesh;
      } catch (err) {
        console.warn(`Model for ${name} not loaded, keeping procedural:`, err.message || err);
      }
    }
  }

  // Bosses get their own Mesh (not instanced) and drive their own movement via t.ai.
  spawnBoss(def, x, z, hpMul = 1) {
    let geo, material;
    const loaded = this.bossModels?.[def.name];
    if (loaded) {
      geo = loaded.geometry.clone();
      material = loaded.material;
    } else {
      geo = def.build();
      material = creatureMaterial(def.anim[0], def.anim[1]);
    }
    geo.setAttribute('aPhase', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count), 1));
    const mesh = new THREE.Mesh(geo, material);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    const t = { ...def, boss: true };
    const hp = def.hp * hpMul;
    const e = { type: 'boss', t, x, z, hp, maxHp: hp, flash: 0, phase: 0, kx: 0, kz: 0, orbHit: -1, dead: false, mesh, s: {}, dmgMul: 1 };
    this.list.push(e);
    this.counts.boss++;
    return e;
  }

  spawn(type, x, z, hpMul = 1) {
    if (this.counts[type] >= MAX[type]) return null;
    const t = ENEMY_TYPES[type];
    const e = { type, t, x, z, hp: t.hp * hpMul, flash: 0, phase: Math.random() * Math.PI * 2, kx: 0, kz: 0, orbHit: -1, dead: false };
    this.list.push(e);
    this.counts[type]++;
    return e;
  }

  // Returns true if the hit killed the enemy.
  damage(e, amount) {
    if (e.dead) return false;
    e.hp -= amount;
    e.flash = 1;
    if (e.hp <= 0) { e.dead = true; return true; }
    return false;
  }

  knockback(e, fromX, fromZ, force) {
    if (e.t.boss) return;
    const dx = e.x - fromX, dz = e.z - fromZ, d = Math.hypot(dx, dz) || 1;
    force /= e.t.size; // big enemies barely budge
    e.kx += dx / d * force; e.kz += dz / d * force;
  }

  forEachNear(x, z, r, cb) {
    const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL);
    const z0 = Math.floor((z - r) / CELL), z1 = Math.floor((z + r) / CELL);
    for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
      const a = this.grid.get(cellKey(cx, cz));
      if (a) for (const e of a) if (!e.dead) cb(e);
    }
  }

  nearestN(pos, maxDist, n) {
    const out = [];
    this.forEachNear(pos.x, pos.z, maxDist, (e) => {
      const d = Math.hypot(e.x - pos.x, e.z - pos.z);
      if (d <= maxDist) out.push({ e, d });
    });
    out.sort((a, b) => a.d - b.d);
    return out.slice(0, n).map((o) => o.e);
  }

  // Moves everyone toward the player, keeps them from stacking, and returns contact damage dealt this frame.
  update(dt, playerPos, time) {
    enemyTime.value = time;
    let w = 0;
    for (const e of this.list) {
      if (e.dead) { this.counts[e.type]--; if (e.mesh) this.scene.remove(e.mesh); }
      else this.list[w++] = e;
    }
    this.list.length = w;

    this.grid.clear();
    for (const e of this.list) {
      const k = cellKey(Math.floor(e.x / CELL), Math.floor(e.z / CELL));
      let a = this.grid.get(k);
      if (!a) { a = []; this.grid.set(k, a); }
      a.push(e);
    }

    const px = playerPos.x, pz = playerPos.z;
    let contact = 0;
    for (const e of this.list) {
      const dx = px - e.x, dz = pz - e.z, d = Math.hypot(dx, dz) || 0.001;
      const stop = e.t.size * 0.5 + 0.45;
      if (!e.t.boss && d > stop) {
        const s = Math.min(e.t.speed * dt, d - stop);
        e.x += dx / d * s; e.z += dz / d * s;
      }
      if (d < stop + 0.3) contact += e.t.dmg * (e.dmgMul || 1) * dt;

      if (e.kx || e.kz) {
        e.x += e.kx * dt; e.z += e.kz * dt;
        const f = Math.max(0, 1 - dt * 6);
        e.kx *= f; e.kz *= f;
        if (Math.abs(e.kx) < 0.01) e.kx = 0;
        if (Math.abs(e.kz) < 0.01) e.kz = 0;
      }

      if (e.t.boss) continue; // bosses shove the horde, never the reverse
      const cx = Math.floor(e.x / CELL), cz = Math.floor(e.z / CELL);
      for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) {
        const a = this.grid.get(cellKey(cx + ox, cz + oz));
        if (!a) continue;
        for (const o of a) {
          if (o === e) continue;
          const sx = e.x - o.x, sz = e.z - o.z, dd = sx * sx + sz * sz;
          const min = (e.t.size + o.t.size) * 0.5;
          if (dd < min * min && dd > 1e-6) {
            const l = Math.sqrt(dd), push = (min - l) * 0.5;
            e.x += sx / l * push; e.z += sz / l * push;
          }
        }
      }
    }

    const idx = {};
    for (const n in this.meshes) idx[n] = 0;
    for (const e of this.list) {
      if (e.mesh) {
        e.mesh.position.set(e.x, e.t.fly ? Math.sin(time * 3 + e.phase) * 0.3 : 0, e.z);
        e.mesh.rotation.y = Math.atan2(px - e.x, pz - e.z);
        e.mesh.material.emissive.setScalar(e.flash * 0.8);
        if (e.flash > 0) e.flash = Math.max(0, e.flash - dt * 7);
        continue;
      }
      const m = this.meshes[e.type], i = idx[e.type]++;
      const bob = e.t.fly ? Math.sin(time * 5 + e.phase) * 0.18 : 0;
      dummy.position.set(e.x, bob, e.z);
      dummy.rotation.set(0, Math.atan2(px - e.x, pz - e.z), 0);
      dummy.scale.setScalar(1 + e.flash * 0.12);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      m.setColorAt(i, _c.setScalar(1 + e.flash * 3));
      this.phases[e.type].array[i] = e.phase;
      if (e.flash > 0) e.flash = Math.max(0, e.flash - dt * 7);
    }
    for (const n in this.meshes) {
      const m = this.meshes[n];
      m.count = idx[n];
      m.instanceMatrix.needsUpdate = true;
      m.instanceColor.needsUpdate = true;
      this.phases[n].needsUpdate = true;
    }
    return contact;
  }

  reset() {
    for (const e of this.list) if (e.mesh) this.scene.remove(e.mesh);
    this.list.length = 0;
    this.grid.clear();
    for (const n in this.meshes) { this.counts[n] = 0; this.meshes[n].count = 0; }
    this.counts.boss = 0;
  }
}
