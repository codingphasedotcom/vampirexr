import * as THREE from 'three';

const MAX = 1500;
const dummy = new THREE.Object3D();
const _c = new THREE.Color();
const TIERS = [
  { min: 30, color: new THREE.Color(0xffd166), scale: 2.3 },
  { min: 8, color: new THREE.Color(0xff5cf0), scale: 1.6 },
  { min: 3, color: new THREE.Color(0x6bff7a), scale: 1.25 },
  { min: 0, color: new THREE.Color(0x4de1ff), scale: 1 },
];
const tierFor = (v) => TIERS.find((t) => v >= t.min);

export class Gems {
  constructor(scene) {
    this.list = [];
    this.mesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.16, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }), MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.setColorAt(0, _c);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    scene.add(this.mesh);
  }

  spawn(x, z, v) {
    if (this.list.length >= MAX) { // merge into a random existing gem instead of dropping xp
      this.list[Math.floor(Math.random() * this.list.length)].v += v;
      return;
    }
    this.list.push({ x, z, v, phase: Math.random() * Math.PI * 2, pull: false });
  }

  update(dt, player, onCollect) {
    const px = player.pos.x, pz = player.pos.z;
    let w = 0;
    for (const g of this.list) {
      const dx = px - g.x, dz = pz - g.z, d = Math.hypot(dx, dz);
      if (g.pull || d < player.magnet) {
        g.pull = true;
        const s = Math.min(d, (8 + 10 / (d + 0.5)) * dt);
        if (d > 0.001) { g.x += dx / d * s; g.z += dz / d * s; }
      }
      if (d < 0.6) { onCollect(g.v); continue; }
      this.list[w++] = g;
    }
    this.list.length = w;
  }

  // Runs every frame (even while paused for a level-up) so gems keep shimmering.
  draw(time, glow) {
    const n = this.list.length;
    for (let i = 0; i < n; i++) {
      const g = this.list[i], t = tierFor(g.v);
      const y = 0.5 + Math.sin(time * 3 + g.phase) * 0.08;
      dummy.position.set(g.x, y, g.z);
      dummy.rotation.set(0, time * 2 + g.phase, 0);
      dummy.scale.setScalar(t.scale);
      dummy.updateMatrix();
      this.mesh.setMatrixAt(i, dummy.matrix);
      this.mesh.setColorAt(i, t.color);
      glow.add(g.x, y, g.z, 0.45 * t.scale, t.color, 0.8);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }

  reset() { this.list.length = 0; this.mesh.count = 0; }
}
