import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { part } from './creatures.js';
import { matcapMaterial } from './toon.js';
import { rand } from './utils.js';

// Floor pickups: gold (coins, bags) for the Crypt shop, and relics: Vampire Magnet (every gem flies to you),
// Holy Bomb (smites the horde), Frozen Hourglass (freezes everything) and Roast Chicken (heal). One instanced
// draw per kind; matcap shading so they read in any light. Also owns the expanding shock rings used by bombs/revives.
export const PICKUPS = {
  coin:    { cap: 90, radius: 0.7, magnet: true,  scale: 1,   color: 0xffd34d },
  bag:     { cap: 10, radius: 0.9, magnet: true,  scale: 1.3, color: 0xffc23a },
  vacuum:  { cap: 2,  radius: 1.0, magnet: false, scale: 1.5, color: 0x7fd8ff, relic: 'Vampire Magnet' },
  bomb:    { cap: 2,  radius: 1.0, magnet: false, scale: 1.5, color: 0xfff0a0, relic: 'Holy Bomb' },
  freeze:  { cap: 2,  radius: 1.0, magnet: false, scale: 1.5, color: 0x9fe8ff, relic: 'Frozen Hourglass' },
  chicken: { cap: 3,  radius: 1.0, magnet: false, scale: 1.4, color: 0xffa060, relic: 'Roast Chicken' },
};
export const RELICS = ['vacuum', 'bomb', 'freeze', 'chicken'];

const cyl = (rt, rb, h, n = 16) => new THREE.CylinderGeometry(rt, rb, h, n);
function geometry(kind) {
  switch (kind) {
    case 'coin': return mergeGeometries([
      part(cyl(0.17, 0.17, 0.045, 20).rotateX(Math.PI / 2), 0xf0b830),
      part(cyl(0.12, 0.12, 0.055, 20).rotateX(Math.PI / 2), 0xffe27a)]);
    case 'bag': return mergeGeometries([
      part(new THREE.SphereGeometry(0.26, 14, 10).scale(1, 0.85, 1), 0xb87a2a),
      part(cyl(0.07, 0.12, 0.1, 10), 0x9a6420, { p: [0, 0.24, 0] }),
      part(new THREE.TorusGeometry(0.08, 0.025, 6, 12).rotateX(Math.PI / 2), 0xffd34d, { p: [0, 0.27, 0] }),
      part(cyl(0.09, 0.09, 0.03, 14).rotateX(1.2), 0xffe27a, { p: [0.05, 0.33, 0] })]);
    case 'vacuum': return mergeGeometries([
      part(new THREE.TorusGeometry(0.2, 0.075, 8, 20, Math.PI), 0xff3550),
      part(new THREE.BoxGeometry(0.15, 0.13, 0.15), 0xe8eef8, { p: [-0.2, -0.06, 0] }),
      part(new THREE.BoxGeometry(0.15, 0.13, 0.15), 0xe8eef8, { p: [0.2, -0.06, 0] })]);
    case 'bomb': return mergeGeometries([
      part(new THREE.SphereGeometry(0.22, 16, 12), 0xfff3c4),
      part(new THREE.BoxGeometry(0.06, 0.24, 0.06), 0xffc94d, { p: [0, 0.32, 0] }),
      part(new THREE.BoxGeometry(0.17, 0.06, 0.06), 0xffc94d, { p: [0, 0.35, 0] })]);
    case 'freeze': return mergeGeometries([
      part(new THREE.ConeGeometry(0.15, 0.22, 12).rotateX(Math.PI), 0xbff2ff, { p: [0, 0.12, 0] }),
      part(new THREE.ConeGeometry(0.15, 0.22, 12), 0x8fdcff, { p: [0, -0.12, 0] }),
      part(cyl(0.19, 0.19, 0.045), 0x7a4a2a, { p: [0, 0.25, 0] }),
      part(cyl(0.19, 0.19, 0.045), 0x7a4a2a, { p: [0, -0.25, 0] })]);
    default: return mergeGeometries([ // chicken drumstick
      part(new THREE.SphereGeometry(0.2, 14, 10).scale(1.25, 0.9, 0.9), 0xc8742a),
      part(cyl(0.035, 0.035, 0.24, 8).rotateZ(1.3), 0xf6efe0, { p: [0.3, 0.06, 0] }),
      part(new THREE.SphereGeometry(0.055, 8, 6), 0xf6efe0, { p: [0.42, 0.09, 0.04] }),
      part(new THREE.SphereGeometry(0.055, 8, 6), 0xf6efe0, { p: [0.42, 0.09, -0.04] })]);
  }
}

const dummy = new THREE.Object3D();
const _c = new THREE.Color();

export class Pickups {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.meshes = {};
    const mat = matcapMaterial({ vertexColors: true });
    for (const [kind, P] of Object.entries(PICKUPS)) {
      const m = new THREE.InstancedMesh(geometry(kind), mat, P.cap);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false; m.count = 0;
      scene.add(m);
      this.meshes[kind] = m;
    }
    this.rings = Array.from({ length: 4 }, () => {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 64).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      m.visible = false; m.renderOrder = 3; m.frustumCulled = false;
      scene.add(m);
      return { m, t: 1, max: 1, dur: 1 };
    });
  }

  count(kind) { let n = 0; for (const p of this.list) if (p.kind === kind) n++; return n; }

  spawn(kind, x, z, value = 1) {
    const P = PICKUPS[kind];
    if (!P) return null;
    if (this.count(kind) >= P.cap) {
      if (kind !== 'coin' && kind !== 'bag') return null;
      const same = this.list.find((p) => p.kind === kind); // over the cap: fold the gold into an existing pile
      if (same) same.v += value;
      return same;
    }
    const p = { kind, x, z, v: value, phase: rand(0, Math.PI * 2), pull: false, pullT: 0, age: 0 };
    this.list.push(p);
    return p;
  }

  update(dt, player, onCollect) {
    const px = player.pos.x, pz = player.pos.z;
    let w = 0;
    for (const p of this.list) {
      p.age += dt;
      const P = PICKUPS[p.kind], dx = px - p.x, dz = pz - p.z, d = Math.hypot(dx, dz);
      if (P.magnet && (p.pull || d < player.magnet)) {
        p.pull = true; p.pullT += dt;
        const s = Math.min(d, (7 + 10 / (d + 0.5) + p.pullT * 12) * dt);
        if (d > 0.001) { p.x += dx / d * s; p.z += dz / d * s; }
      }
      if (d < P.radius) { onCollect(p); continue; }
      this.list[w++] = p;
    }
    this.list.length = w;
  }

  // Expanding ground shock ring (Holy Bomb, revival blast).
  shock(x, z, color, radius, dur = 0.6) {
    const r = this.rings.find((r) => r.t >= r.dur) || this.rings[0];
    r.t = 0; r.dur = dur; r.max = radius;
    r.m.position.set(x, 0.08, z); r.m.material.color.set(color); r.m.visible = true;
  }

  draw(dt, time, glow) {
    const idx = {};
    for (const k in this.meshes) idx[k] = 0;
    for (const p of this.list) {
      const P = PICKUPS[p.kind], m = this.meshes[p.kind], i = idx[p.kind]++;
      const pop = Math.min(1, p.age / 0.25), relic = !!P.relic;
      const y = (relic ? 0.75 : 0.45) + Math.sin(time * 3 + p.phase) * (relic ? 0.12 : 0.06);
      dummy.position.set(p.x, y, p.z);
      dummy.rotation.set(relic ? 0.25 : 0, time * (relic ? 1.6 : 3.2) + p.phase, 0, 'YXZ');
      dummy.scale.setScalar(P.scale * (0.4 + 0.6 * pop) * (p.kind === 'bag' ? Math.min(1.6, 1 + p.v / 60) : 1));
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      _c.set(P.color);
      if (relic) {
        const pulse = 0.75 + 0.25 * Math.sin(time * 4 + p.phase);
        glow.add(p.x, y, p.z, 1.6, _c, 0.75 * pulse);
        glow.add(p.x, 0.15, p.z, 1.2, _c, 0.5 * pulse);
        for (let k = 0; k < 3; k++) { const a = time * 2 + k * 2.09 + p.phase; glow.add(p.x + Math.cos(a) * 0.55, y + Math.sin(time * 3 + k) * 0.2, p.z + Math.sin(a) * 0.55, 0.3, _c, 0.8); }
      } else glow.add(p.x, y, p.z, 0.4 * P.scale, _c, 0.45);
    }
    for (const k in this.meshes) { const m = this.meshes[k]; m.count = idx[k]; m.instanceMatrix.needsUpdate = true; }
    for (const r of this.rings) {
      if (r.t >= r.dur) { r.m.visible = false; continue; }
      r.t += dt;
      const k = Math.min(1, r.t / r.dur), e = 1 - Math.pow(1 - k, 3);
      r.m.scale.setScalar(Math.max(0.01, r.max * e));
      r.m.material.opacity = (1 - k) * 0.9;
    }
  }

  reset() {
    this.list.length = 0;
    for (const k in this.meshes) this.meshes[k].count = 0;
    for (const r of this.rings) { r.t = r.dur; r.m.visible = false; }
  }
}
