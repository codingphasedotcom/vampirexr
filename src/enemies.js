import * as THREE from 'three';
import { advanceWalk } from './animation.js';
import { batGeometry, ghoulGeometry, wraithGeometry, bruteGeometry, creatureMaterial, tagForShaderAnim, enemyTime } from './creatures.js';
import { loadVATModel, vatMaterial, loadStaticModel } from './models.js';

// `y` is the model's visual centre (used for particles / damage numbers); models stand on y = 0.
export const ENEMY_TYPES = {
  bat:    { hp: 6,   speed: 3.2, dmg: 3,  size: 0.45, y: 1.35, color: 0x9b5de5, xp: 1, fly: true,
            build: batGeometry, anim: ['FLAP'],
            model: { url: '/models/bat.glb', height: 0.5, lift: 1.1, yaw: 0, animated: false } },
  ghoul:  { hp: 22,  speed: 2.1, dmg: 6,  size: 0.8,  y: 1.0,  color: 0x7fd36a, xp: 2,
            build: ghoulGeometry, anim: ['SHAMBLE', { speed: 7, hip: 0.55 }],
            model: { url: '/models/ghoul.glb', height: 1.7, yaw: 0, rate: 1.8 } },
  wraith: { hp: 40,  speed: 2.8, dmg: 9,  size: 0.9,  y: 1.3,  color: 0x7ff3ff, xp: 4, fly: true,
            build: wraithGeometry, anim: ['WAVE'],
            model: { url: '/models/wraith.glb', height: 1.9, lift: 0.25, yaw: 0, animated: false } },
  brute:  { hp: 130, speed: 1.4, dmg: 16, size: 1.5,  y: 1.4,  color: 0xff4d5a, xp: 8,
            build: bruteGeometry, anim: ['SHAMBLE', { speed: 4.5, hip: 0.6 }],
            model: { url: '/models/brute.glb', height: 2.4, yaw: 0, rate: 1.9 } },
};
const MAX = { bat: 320, ghoul: 220, wraith: 120, brute: 60 };
const CELL = 2;
const dummy = new THREE.Object3D();
const _c = new THREE.Color();
// Elemental casters keep their distance and lob projectiles; tinted so you can pick them out of the horde.
export const KINDS = {
  normal: { tint: null, range: 0, dmg: 0 },
  fire: { tint: new THREE.Color(1.6, 0.55, 0.3), color: 0xff6a1a, range: 9, cooldown: 3.0, speed: 9, dmg: 14, effect: null },
  ice: { tint: new THREE.Color(0.6, 1.1, 1.7), color: 0x7fe8ff, range: 10, cooldown: 3.4, speed: 8, dmg: 8, effect: 'slow' },
};
const cellKey = (cx, cz) => (cx + 2048) * 4096 + (cz + 2048);
const _out = { x: 0, z: 0 };

export class EnemyManager {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.meshes = {};
    this.phases = {};
    this.walkTimes = {};
    this.counts = {};
    this.grid = new Map();
    this.dying = [];          // killed enemies play a short collapse before leaving the render
    this.outlines = {};       // ink-outline companions (desktop only; too many vertices for the Quest)
    this.outlinesVisible = true;
    for (const [name, t] of Object.entries(ENEMY_TYPES)) {
      const geo = t.build();
      const phase = new THREE.InstancedBufferAttribute(new Float32Array(MAX[name]), 1).setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('aPhase', phase);
      this.walkTimes[name] = new THREE.InstancedBufferAttribute(new Float32Array(MAX[name]), 1).setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('aWalkTime', this.walkTimes[name]);
      this.phases[name] = phase;
      this.setTypeMesh(name, geo, creatureMaterial(t.anim[0], t.anim[1]), creatureMaterial(t.anim[0], t.anim[1], null, { outline: 0.03 }));
      this.counts[name] = 0;
    }
    this.counts.boss = 0;
  }

  // Installs (or replaces) the instanced mesh for a type, plus an outline mesh sharing its instance buffers.
  setTypeMesh(name, geometry, material, outlineMaterial) {
    const mesh = new THREE.InstancedMesh(geometry, material, MAX[name]);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.setColorAt(0, _c.setScalar(1)); // allocates instanceColor: per-enemy tint × hit flash
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    const outline = new THREE.InstancedMesh(geometry, outlineMaterial, MAX[name]);
    outline.instanceMatrix = mesh.instanceMatrix;
    outline.instanceColor = mesh.instanceColor;
    outline.frustumCulled = false;
    outline.count = 0;
    if (this.meshes[name]) this.scene.remove(this.meshes[name], this.outlines[name]);
    this.scene.add(mesh, outline);
    this.meshes[name] = mesh;
    this.outlines[name] = outline;
  }

  get alive() { return this.list.length; }

  // Swap procedural horde meshes for baked-animation GLB models where one is configured.
  // Runs in the background; a type keeps its procedural look if its model fails to load.
  // Loads one configured model. Animated GLBs are baked to a VAT; static ones get the procedural
  // creature shader (flap / wave / shamble) driven by the type's `anim` mode.
  async loadModel(t, outline = 0.02) {
    if (t.model.animated === false) {
      const m = await loadStaticModel(t.model.url, t.model);
      tagForShaderAnim(m.geometry);
      return { geometry: m.geometry, material: creatureMaterial(t.anim[0], t.anim[1], m.map),
        outlineMaterial: creatureMaterial(t.anim[0], t.anim[1], m.map, { outline }) };
    }
    const vat = await loadVATModel(t.model.url, t.model);
    return { vat, geometry: vat.geometry, material: vatMaterial(vat, enemyTime, { rate: t.model.rate }),
      outlineMaterial: vatMaterial(vat, enemyTime, { rate: t.model.rate, outline }) };
  }

  async loadModels(bossDefs = [], onDone = null) {
    this.bossModels = {};
    this.modelReport = { ok: [], failed: [] };
    const report = (name, err) => {
      if (err) this.modelReport.failed.push(`${name}: ${(err.message || err).toString().slice(0, 60)}`);
      else this.modelReport.ok.push(name);
    };
    for (const def of bossDefs) {
      if (!def.model) continue;
      this.loadModel(def, 0.035).then((m) => { this.bossModels[def.name] = m; report(def.name); })
        .catch((err) => { console.warn(`Boss model for ${def.name} not loaded, keeping procedural:`, err.message || err); report(def.name, err); });
    }
    for (const [name, t] of Object.entries(ENEMY_TYPES)) {
      if (!t.model) continue;
      try {
        const { geometry, material, outlineMaterial } = await this.loadModel(t);
        geometry.setAttribute('aPhase', this.phases[name]);
        geometry.setAttribute('aWalkTime', this.walkTimes[name]);
        this.setTypeMesh(name, geometry, material, outlineMaterial);
        report(name);
      } catch (err) {
        console.warn(`Model for ${name} not loaded, keeping procedural:`, err.message || err);
        report(name, err);
      }
    }
    onDone?.(this.modelReport);
  }

  // Bosses get their own Mesh (not instanced) and drive their own movement via t.ai.
  spawnBoss(def, x, z, hpMul = 1) {
    let geo, material;
    const walkClock = { value: 0 };
    const loaded = this.bossModels?.[def.name];
    let outlineMat;
    if (loaded) {
      geo = loaded.geometry.clone();
      material = loaded.vat ? vatMaterial(loaded.vat, walkClock, { rate: def.model.rate }) : loaded.material;
      outlineMat = loaded.vat ? vatMaterial(loaded.vat, walkClock, { rate: def.model.rate, outline: 0.035 }) : loaded.outlineMaterial;
    } else {
      geo = def.build();
      material = creatureMaterial(def.anim[0], def.anim[1]);
      outlineMat = creatureMaterial(def.anim[0], def.anim[1], null, { outline: 0.04 });
    }
    geo.setAttribute('aPhase', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count), 1));
    const mesh = new THREE.Mesh(geo, material);
    mesh.userData.ownsMaterial = !!loaded?.vat;
    mesh.frustumCulled = false;
    const outline = new THREE.Mesh(geo, outlineMat);
    outline.frustumCulled = false;
    mesh.add(outline); // bosses keep their outline in VR too: one extra draw call
    this.scene.add(mesh);
    const t = { ...def, boss: true };
    const hp = def.hp * hpMul;
    const e = { type: 'boss', t, x, z, hp, maxHp: hp, kind: 'normal', scale: 1, size: def.size, speed: def.size ? def.speed : 0, xp: def.xp, flash: 0, phase: 0, kx: 0, kz: 0, orbHit: -1, dead: false, mesh, walkClock, walkX: x, walkZ: z, s: {}, dmgMul: 1, age: 0 };
    this.list.push(e);
    this.counts.boss++;
    return e;
  }

  // `casterChance` (0–1) is the share of spawns that become fire/ice casters; bosses summon with 0.
  spawn(type, x, z, hpMul = 1, casterChance = 0) {
    if (this.list.filter(e => !e.dead).length >= 200 || this.counts[type] >= MAX[type]) return null;
    const t = ENEMY_TYPES[type];
    const r = Math.random();
    const scale = r < 0.06 ? 1.7 : 0.75 + Math.random() * 0.6; // rare giants, otherwise 0.75–1.35
    const kind = Math.random() < casterChance ? (Math.random() < 0.5 ? 'fire' : 'ice') : 'normal';
    const k = KINDS[kind];
    const tint = k.tint ? k.tint.clone() : new THREE.Color().setHSL(Math.random(), 0.5, 0.5).lerp(new THREE.Color(1, 1, 1), 0.7);
    const e = {
      type, t, x, z, kind, scale, tint, walkX: x, walkZ: z,
      size: t.size * scale,
      speed: t.speed * (1.25 - 0.25 * scale), // small ones are quick, giants lumber
      hp: t.hp * hpMul * Math.pow(scale, 1.5),
      dmgMul: scale,
      xp: Math.max(1, Math.round(t.xp * scale)),
      shootT: k.cooldown ? Math.random() * k.cooldown : 0,
      flash: 0, phase: Math.random() * Math.PI * 2, kx: 0, kz: 0, orbHit: -1, dead: false, age: 0,
    };
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
    force /= e.size; // big enemies barely budge
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
  // `shoot(e, k)` is called when a caster fires.
  update(dt, playerPos, time, colliders = null, shoot = null) {
    enemyTime.value = time;
    let w = 0;
    for (const e of this.list) {
      if (e.dead) { this.counts[e.type]--; e.dieT = e.dieMax = e.t.boss ? 1.4 : 0.42; this.dying.push(e); }
      else this.list[w++] = e;
    }
    this.list.length = w;
    w = 0;
    for (const e of this.dying) {
      e.dieT -= dt;
      if (e.dieT > 0) { this.dying[w++] = e; continue; }
      if (e.mesh) this.disposeBoss(e);
    }
    this.dying.length = w;

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
      const stop = e.size * 0.5 + 0.45;
      const k = KINDS[e.kind];
      if (!e.t.boss) {
        if (k.range && d < k.range) {
          // casters hold their range and fire; if you close in they back off slowly
          if (d < k.range * 0.6) { e.x -= dx / d * e.speed * 0.5 * dt; e.z -= dz / d * e.speed * 0.5 * dt; }
          e.shootT -= dt;
          if (e.shootT <= 0 && shoot) { e.shootT = k.cooldown; shoot(e, k); }
        } else if (d > stop) {
          const s = Math.min(e.speed * dt, d - stop);
          e.x += dx / d * s; e.z += dz / d * s;
        }
      }
      if (d < stop + 0.3) contact += e.t.dmg * (e.dmgMul || 1) * dt;

      if (e.kx || e.kz) {
        e.x += e.kx * dt; e.z += e.kz * dt;
        const f = Math.max(0, 1 - dt * 6);
        e.kx *= f; e.kz *= f;
        if (Math.abs(e.kx) < 0.01) e.kx = 0;
        if (Math.abs(e.kz) < 0.01) e.kz = 0;
      }

      if (colliders && !e.t.fly && !e.t.boss) { colliders.resolve(e.x, e.z, e.size * 0.35, _out); e.x = _out.x; e.z = _out.z; }
      if (e.t.boss) continue; // bosses shove the horde, never the reverse
      const cx = Math.floor(e.x / CELL), cz = Math.floor(e.z / CELL);
      for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) {
        const a = this.grid.get(cellKey(cx + ox, cz + oz));
        if (!a) continue;
        for (const o of a) {
          if (o === e) continue;
          const sx = e.x - o.x, sz = e.z - o.z, dd = sx * sx + sz * sz;
          const min = (e.size + o.size) * 0.5;
          if (dd < min * min && dd > 1e-6) {
            const l = Math.sqrt(dd), push = (min - l) * 0.5;
            e.x += sx / l * push; e.z += sz / l * push;
          }
        }
      }
    }

    const idx = {};
    for (const n in this.meshes) idx[n] = 0;
    const draw = (e, dying) => {
      const walkTime = dying ? (e.walkTime ?? 0) : advanceWalk(e, dt);
      e.age += dt;
      // spawn: pop up out of the ground with a little overshoot; death: flash, swell, then crumple and sink
      const rise = Math.min(1, e.age / 0.45);
      const pop = 1 + 2.2 * Math.pow(rise - 1, 3) + 1.2 * Math.pow(rise - 1, 2);
      let scale = pop, sink = e.t.fly ? 0 : (1 - rise) * -0.6, tilt = 0, glow = 1 + e.flash * 3;
      if (dying) {
        const p = 1 - e.dieT / e.dieMax;
        scale = p < 0.18 ? 1 + p * 1.2 : 1.22 * Math.pow(1 - (p - 0.18) / 0.82, 1.4);
        sink = -p * 0.35; tilt = p * 0.9; glow = 4 * (1 - p) + 0.3;
      }
      const yaw = Math.atan2(px - e.x, pz - e.z);
      if (e.mesh) {
        e.walkClock.value = walkTime;
        e.mesh.position.set(e.x, (e.t.fly ? Math.sin(time * 3 + e.phase) * 0.3 : 0) + sink, e.z);
        e.mesh.rotation.set(tilt * 0.4, yaw, 0, 'YXZ');
        e.mesh.scale.setScalar(scale);
        e.mesh.material.emissive.setScalar(Math.min(1, e.flash * 0.8 + (dying ? 1 - e.dieT / e.dieMax : 0)));
        if (e.flash > 0) e.flash = Math.max(0, e.flash - dt * 7);
        return;
      }
      const m = this.meshes[e.type], i = idx[e.type];
      if (i >= m.instanceMatrix.count) return;
      idx[e.type]++;
      const bob = e.t.fly ? Math.sin(time * 5 + e.phase) * 0.18 : 0;
      dummy.position.set(e.x, bob + sink, e.z);
      dummy.rotation.set(tilt, yaw, 0, 'YXZ');
      dummy.scale.setScalar(e.scale * scale * (1 + e.flash * 0.12));
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      m.setColorAt(i, _c.copy(e.tint).multiplyScalar(glow));
      this.phases[e.type].array[i] = e.phase;
      this.walkTimes[e.type].array[i] = walkTime;
      if (e.flash > 0) e.flash = Math.max(0, e.flash - dt * 7);
    };
    for (const e of this.list) draw(e, false);
    for (const e of this.dying) draw(e, true);
    for (const n in this.meshes) {
      const m = this.meshes[n], o = this.outlines[n];
      m.count = idx[n];
      o.count = idx[n];
      o.visible = this.outlinesVisible;
      m.instanceMatrix.needsUpdate = true;
      m.instanceColor.needsUpdate = true;
      this.phases[n].needsUpdate = true;
      this.walkTimes[n].needsUpdate = true;
    }
    return contact;
  }

  disposeBoss(e) {
    this.scene.remove(e.mesh);
    e.mesh.geometry.dispose();
    if (e.mesh.userData.ownsMaterial) { e.mesh.material.dispose(); e.mesh.children[0]?.material.dispose(); }
  }

  // Soft ground shadows for everything alive or dying; flyers cast smaller, fainter ones.
  drawShadows(shadows) {
    const add = (e, k) => {
      const r = (e.t.boss ? e.size * 0.55 : e.size * 0.62) * k;
      shadows.add(e.x, e.z, e.t.fly ? r * 0.7 : r, (e.t.fly ? 0.4 : 0.75) * Math.min(1, e.age / 0.3));
    };
    for (const e of this.list) add(e, 1);
    for (const e of this.dying) add(e, e.dieT / e.dieMax);
  }

  reset() {
    for (const e of this.list) if (e.mesh) this.disposeBoss(e);
    for (const e of this.dying) if (e.mesh) this.disposeBoss(e);
    this.dying.length = 0;
    this.list.length = 0;
    this.grid.clear();
    for (const n in this.meshes) { this.counts[n] = 0; this.meshes[n].count = 0; }
    this.counts.boss = 0;
  }
}
