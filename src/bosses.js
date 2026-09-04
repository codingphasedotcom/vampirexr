import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { part, sphere, box, cone, cyl, batGeometry, wraithGeometry, bruteGeometry } from './creatures.js';
import { rand } from './utils.js';

// ---------- geometry ----------

function batLordGeometry() {
  const g = batGeometry();
  g.scale(2.8, 2.8, 2.8);
  const gold = 0xffd166;
  return mergeGeometries([g,
    part(cone(0.14, 0.5, 4), gold, { p: [0, 4.55, 0.35] }),
    part(cone(0.1, 0.35, 4), gold, { p: [-0.24, 4.42, 0.35] }),
    part(cone(0.1, 0.35, 4), gold, { p: [0.24, 4.42, 0.35] }),
  ]);
}

function golemGeometry() {
  const stone = 0x6b6a78, dark = 0x4a4956, moss = 0x3e6b3a, eye = 0x9dff70;
  return mergeGeometries([
    part(box(0.7, 1.3, 0.7), dark, { p: [-0.6, 0.65, 0], anim: 2 }),
    part(box(0.7, 1.3, 0.7), dark, { p: [0.6, 0.65, 0], anim: -2 }),
    part(box(2.2, 2.0, 1.4), stone, { p: [0, 2.2, 0] }),
    part(box(0.9, 0.5, 0.3), moss, { p: [-0.5, 2.9, 0.6] }),
    part(box(0.9, 0.8, 0.9), stone, { p: [0, 3.6, 0.1] }),
    part(box(0.6, 2.0, 0.6), stone, { p: [-1.5, 2.0, 0.1], anim: 1 }),
    part(box(0.6, 2.0, 0.6), stone, { p: [1.5, 2.0, 0.1], anim: -1 }),
    part(sphere(0.45), dark, { p: [-1.5, 0.9, 0.2], anim: 1 }),
    part(sphere(0.45), dark, { p: [1.5, 0.9, 0.2], anim: -1 }),
    part(sphere(0.1, 6, 4), eye, { p: [-0.22, 3.7, 0.56], glow: 1 }),
    part(sphere(0.1, 6, 4), eye, { p: [0.22, 3.7, 0.56], glow: 1 }),
  ]);
}

function necroGeometry() {
  const robe = 0x1e2a1e, wood = 0x3a2a1a, eye = 0x7dff9a;
  return mergeGeometries([
    part(cone(0.9, 2.6, 8), robe, { p: [0, 1.3, 0], anim: 1 }),
    part(sphere(0.4), robe, { p: [0, 2.75, 0] }),
    part(sphere(0.28), 0x0a0a0a, { p: [0, 2.72, 0.18] }),
    part(sphere(0.07, 6, 4), eye, { p: [-0.1, 2.76, 0.42], glow: 1 }),
    part(sphere(0.07, 6, 4), eye, { p: [0.1, 2.76, 0.42], glow: 1 }),
    part(cyl(0.04, 0.04, 2.8), wood, { p: [0.85, 1.5, 0.3], r: [0, 0, -0.08] }),
    part(sphere(0.2), eye, { p: [0.85, 3.0, 0.3], glow: 1 }),
  ]);
}

function queenGeometry() {
  const g = wraithGeometry();
  g.scale(2.2, 2.2, 2.2);
  const parts = [g];
  for (let i = -2; i <= 2; i++) parts.push(part(cone(0.08, 0.5 - Math.abs(i) * 0.08, 4), 0x9ff8ff, { p: [i * 0.22, 3.75, 0.05], glow: 1 }));
  return mergeGeometries(parts);
}

function butcherGeometry() {
  const g = bruteGeometry();
  g.scale(2.0, 2.0, 2.0);
  return mergeGeometries([g,
    part(box(0.18, 1.3, 0.6), 0xb0b0c0, { p: [1.6, 0.9, 0.9], anim: -1 }),
    part(box(0.1, 0.5, 0.12), 0x3a2a1a, { p: [1.6, 1.75, 0.9], anim: -1 }),
  ]);
}

function vampireGeometry() {
  const suit = 0x1a1020, cape = 0x5a0a20, pale = 0xd8c8c0, eye = 0xff2a6d;
  const g = mergeGeometries([
    part(box(0.22, 1.0, 0.22), suit, { p: [-0.18, 0.5, 0], anim: 2 }),
    part(box(0.22, 1.0, 0.22), suit, { p: [0.18, 0.5, 0], anim: -2 }),
    part(cone(0.9, 2.0, 6), cape, { p: [0, 1.0, -0.15], anim: 1 }),
    part(box(0.7, 1.2, 0.4), suit, { p: [0, 1.6, 0] }),
    part(box(0.9, 0.3, 0.12), cape, { p: [0, 2.2, -0.15] }),
    part(sphere(0.26), pale, { p: [0, 2.45, 0] }),
    part(box(0.5, 0.18, 0.5), suit, { p: [0, 2.72, 0] }),
    part(sphere(0.12), pale, { p: [-0.55, 1.5, 0.3], anim: 1 }),
    part(sphere(0.12), pale, { p: [0.55, 1.5, 0.3], anim: -1 }),
    part(sphere(0.06, 6, 4), eye, { p: [-0.09, 2.48, 0.24], glow: 1 }),
    part(sphere(0.06, 6, 4), eye, { p: [0.09, 2.48, 0.24], glow: 1 }),
  ]);
  g.scale(1.5, 1.5, 1.5);
  return g;
}

// ---------- AI helpers ----------

function toward(e, dt, g, speed, stop) {
  const p = g.player.pos, dx = p.x - e.x, dz = p.z - e.z, d = Math.hypot(dx, dz) || 0.001;
  if (d > stop) { const s = Math.min(speed * dt, d - stop); e.x += dx / d * s; e.z += dz / d * s; }
  return d;
}
function away(e, dt, g, speed) {
  const p = g.player.pos, dx = e.x - p.x, dz = e.z - p.z, d = Math.hypot(dx, dz) || 0.001;
  e.x += dx / d * speed * dt; e.z += dz / d * speed * dt;
}
function summon(g, e, type, n, r) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand(-0.3, 0.3);
    const s = g.enemies.spawn(type, e.x + Math.cos(a) * r, e.z + Math.sin(a) * r, g.hpMul);
    if (s) g.particles.burst(s.x, 1, s.z, s.t.color, 8, 2);
  }
}
function shootAt(g, e, n, spread, speed, dmg) {
  const p = g.player.pos, base = Math.atan2(p.z - e.z, p.x - e.x);
  for (let i = 0; i < n; i++) {
    const a = base + (n > 1 ? (i / (n - 1) - 0.5) * spread : 0);
    g.bossFx.shoot(e.x, e.z, Math.cos(a) * speed, Math.sin(a) * speed, dmg, e.t.color);
  }
}
function ringShots(g, e, n, speed, dmg) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand(0, 0.4);
    g.bossFx.shoot(e.x, e.z, Math.cos(a) * speed, Math.sin(a) * speed, dmg, e.t.color);
  }
}
function teleport(g, e, dist) {
  g.particles.burst(e.x, e.t.y, e.z, e.t.color, 30, 5);
  const a = rand(0, Math.PI * 2), p = g.player.pos;
  e.x = p.x + Math.cos(a) * dist; e.z = p.z + Math.sin(a) * dist;
  g.particles.burst(e.x, e.t.y, e.z, e.t.color, 30, 5);
  g.sfx.zap();
}
const tick = (s, key, dt, init) => { if (s[key] === undefined) s[key] = init; s[key] -= dt; if (s[key] <= 0) { s[key] = init; return true; } return false; };

const AI = {
  batLord(e, dt, g) {
    const s = e.s, p = g.player.pos;
    if (s.ang === undefined) s.ang = rand(0, Math.PI * 2);
    if (s.diving > 0) {
      s.diving -= dt;
      e.x += s.vx * dt; e.z += s.vz * dt;
    } else {
      s.ang += dt * 0.7;
      const tx = p.x + Math.cos(s.ang) * 7, tz = p.z + Math.sin(s.ang) * 7;
      const dx = tx - e.x, dz = tz - e.z, d = Math.hypot(dx, dz) || 0.001, sp = Math.min(6 * dt, d);
      e.x += dx / d * sp; e.z += dz / d * sp;
      if (tick(s, 'dive', dt, 5)) {
        const ddx = p.x - e.x, ddz = p.z - e.z, dd = Math.hypot(ddx, ddz) || 1;
        s.vx = ddx / dd * 13; s.vz = ddz / dd * 13; s.diving = 1.1;
        g.sfx.roar();
      }
    }
    if (tick(s, 'spawn', dt, 8)) summon(g, e, 'bat', 6, 2);
  },

  golem(e, dt, g) {
    const s = e.s;
    if (s.wind > 0) {
      s.wind -= dt; e.flash = Math.max(e.flash, 0.5);
      if (s.wind <= 0) { g.bossFx.shockwave(e.x, e.z, 9, 22); g.sfx.roar(); }
      return;
    }
    const d = toward(e, dt, g, e.t.speed, e.t.size * 0.5 + 0.45);
    if (tick(s, 'slam', dt, 6) && d < 10) s.wind = 1.0;
  },

  necro(e, dt, g) {
    const s = e.s, p = g.player.pos, d = Math.hypot(p.x - e.x, p.z - e.z);
    if (d < 8) away(e, dt, g, 2.6);
    else if (d > 12) toward(e, dt, g, 2.0, 12);
    if (tick(s, 'shoot', dt, 3)) shootAt(g, e, 3, 0.5, 7, 12);
    if (tick(s, 'raise', dt, 10)) summon(g, e, 'ghoul', 6, 2.5);
  },

  queen(e, dt, g) {
    const s = e.s;
    toward(e, dt, g, e.t.speed, e.t.size * 0.5 + 0.45);
    if (tick(s, 'tp', dt, 6)) teleport(g, e, 5);
    if (tick(s, 'ring', dt, 4)) ringShots(g, e, 8, 5, 14);
    if (tick(s, 'summon', dt, 9)) summon(g, e, 'wraith', 4, 2.5);
  },

  butcher(e, dt, g) {
    const s = e.s;
    if (s.wind > 0) {
      s.wind -= dt; e.flash = Math.max(e.flash, 0.5);
      if (s.wind <= 0) {
        const p = g.player.pos, dx = p.x - e.x, dz = p.z - e.z, d = Math.hypot(dx, dz) || 1;
        s.vx = dx / d * 15; s.vz = dz / d * 15; s.dash = 0.7; e.dmgMul = 2.5;
        g.sfx.roar();
      }
      return;
    }
    if (s.dash > 0) {
      s.dash -= dt; e.x += s.vx * dt; e.z += s.vz * dt;
      if (s.dash <= 0) e.dmgMul = 1;
      return;
    }
    const d = toward(e, dt, g, e.t.speed, e.t.size * 0.5 + 0.45);
    if (tick(s, 'charge', dt, 5) && d < 14) s.wind = 0.8;
  },

  vampire(e, dt, g) {
    const s = e.s;
    toward(e, dt, g, e.t.speed, e.t.size * 0.5 + 0.45);
    if (tick(s, 'shoot', dt, 2.5)) shootAt(g, e, 5, 0.9, 8, 14);
    if (tick(s, 'tp', dt, 8)) teleport(g, e, 6);
    if (tick(s, 'summon', dt, 12)) { summon(g, e, 'wraith', 3, 3); summon(g, e, 'bat', 8, 2); }
  },
};

// One boss per five levels. `y` is the visual centre; `size` drives contact range and hitscan radius.
export const BOSSES = [
  { level: 5,  name: 'Bat Lord',     hp: 900,   speed: 6,   dmg: 12, size: 2.2, y: 3.6, color: 0xb36bff, xp: 40,  fly: true, build: batLordGeometry, anim: ['FLAP'], ai: AI.batLord,
    model: { url: '/models/batlord.glb', height: 2.8, lift: 1.6, yaw: 0, animated: false } },
  { level: 10, name: 'Grave Golem',  hp: 2200,  speed: 1.2, dmg: 20, size: 3.2, y: 2.2, color: 0x9dff70, xp: 60,  build: golemGeometry, anim: ['SHAMBLE', { speed: 3, hip: 1.3 }], ai: AI.golem,
    model: { url: '/models/golem.glb', height: 4.5, yaw: 0, rate: 0.7 } },
  { level: 15, name: 'Necromancer',  hp: 3200,  speed: 2.0, dmg: 10, size: 1.8, y: 1.8, color: 0x7dff9a, xp: 80,  build: necroGeometry, anim: ['WAVE'], ai: AI.necro,
    model: { url: '/models/necro.glb', height: 3.2, yaw: 0, rate: 0.8 } },
  { level: 20, name: 'Wraith Queen', hp: 5000,  speed: 3.5, dmg: 16, size: 2.0, y: 2.6, color: 0x9ff8ff, xp: 100, fly: true, build: queenGeometry, anim: ['WAVE'], ai: AI.queen,
    model: { url: '/models/queen.glb', height: 3.6, lift: 0.4, yaw: 0, animated: false } },
  { level: 25, name: 'The Butcher',  hp: 8000,  speed: 1.8, dmg: 30, size: 3.0, y: 2.6, color: 0xff3b3b, xp: 130, build: butcherGeometry, anim: ['SHAMBLE', { speed: 4, hip: 1.2 }], ai: AI.butcher,
    model: { url: '/models/butcher.glb', height: 4.5, yaw: 0, rate: 0.8 } },
  { level: 30, name: 'Vampire Lord', hp: 14000, speed: 2.6, dmg: 24, size: 2.2, y: 2.6, color: 0xff2a6d, xp: 200, build: vampireGeometry, anim: ['WAVE'], ai: AI.vampire, final: true,
    model: { url: '/models/vampire.glb', height: 3.5, yaw: 0, rate: 1.0 } },
];

// ---------- boss-owned effects: projectiles that hurt the player, and shockwave rings ----------

const MAX_SHOTS = 200;
const dummy = new THREE.Object3D();
const _c = new THREE.Color();

export class BossFx {
  constructor(scene) {
    this.shots = [];
    this.mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.18, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), MAX_SHOTS);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.setColorAt(0, _c);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    scene.add(this.mesh);

    this.rings = [];
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.88, 1, 48),
        new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      m.rotation.x = -Math.PI / 2; m.position.y = 0.05; m.visible = false;
      scene.add(m);
      this.rings.push({ m, r: 0, max: 0, dmg: 0, hit: false, active: false });
    }
  }

  shoot(x, z, vx, vz, dmg, color) {
    if (this.shots.length >= MAX_SHOTS) return;
    this.shots.push({ x, z, vx, vz, dmg, life: 6, color: new THREE.Color(color) });
  }

  shockwave(x, z, max, dmg) {
    const r = this.rings.find((r) => !r.active) || this.rings[0];
    r.m.position.set(x, 0.05, z); r.m.visible = true;
    r.r = 0.1; r.max = max; r.dmg = dmg; r.hit = false; r.active = true;
  }

  update(dt, g) {
    const p = g.player.pos;
    let w = 0;
    for (const s of this.shots) {
      s.x += s.vx * dt; s.z += s.vz * dt; s.life -= dt;
      if (Math.hypot(s.x - p.x, s.z - p.z) < 0.55) { g.damagePlayer(s.dmg); g.particles.burst(s.x, 1.2, s.z, s.color, 10, 3); continue; }
      if (s.life > 0) this.shots[w++] = s;
    }
    this.shots.length = w;
    for (let i = 0; i < w; i++) {
      const s = this.shots[i];
      dummy.position.set(s.x, 1.2, s.z);
      dummy.updateMatrix();
      this.mesh.setMatrixAt(i, dummy.matrix);
      this.mesh.setColorAt(i, s.color);
      g.glow.add(s.x, 1.2, s.z, 0.7, s.color, 0.9);
    }
    this.mesh.count = w;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;

    for (const r of this.rings) {
      if (!r.active) continue;
      r.r += 11 * dt;
      r.m.scale.setScalar(r.r);
      r.m.material.opacity = Math.max(0, 1 - r.r / r.max);
      if (!r.hit && Math.abs(Math.hypot(r.m.position.x - p.x, r.m.position.z - p.z) - r.r) < 0.9) { r.hit = true; g.damagePlayer(r.dmg); }
      if (r.r >= r.max) { r.active = false; r.m.visible = false; }
    }
  }

  reset() {
    this.shots.length = 0; this.mesh.count = 0;
    for (const r of this.rings) { r.active = false; r.m.visible = false; }
  }
}
