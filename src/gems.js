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
const HEAL = { color: new THREE.Color(0xff3b5c), scale: 1.5 };
const tierFor = (g) => (g.heal ? HEAL : TIERS.find((t) => g.v >= t.min));

// Faceted crystal look: flat face normals from screen-space derivatives, a key light fixed in view space (so gems
// always read), a sharp specular glint that sweeps as they spin, and a coloured fresnel rim. Unlit by scene lights.
function gemMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: `varying vec3 vViewPosition; varying vec3 vColor;
      void main() {
        vColor = instanceColor;
        vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        vViewPosition = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `varying vec3 vViewPosition; varying vec3 vColor;
      void main() {
        vec3 n = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
        vec3 v = normalize(vViewPosition), L = normalize(vec3(0.45, 0.8, 0.4));
        float diff = max(dot(n, L), 0.0);
        float spec = pow(max(dot(reflect(-L, n), v), 0.0), 20.0);
        float rim = pow(clamp(1.0 - dot(n, v), 0.0, 1.0), 2.0);
        vec3 col = vColor * (0.5 + 0.8 * diff) + vec3(spec) * 0.95 + vColor * rim * 0.7;
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

export class Gems {
  constructor(scene) {
    this.list = [];
    this.mesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.16, 0).scale(0.8, 1.25, 0.8), gemMaterial(), MAX);
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
    this.list.push({ x, z, v, phase: Math.random() * Math.PI * 2, pull: false, pullT: 0 });
  }

  // Red orb that restores health on pickup.
  spawnHeal(x, z) {
    if (this.list.length >= MAX) return;
    this.list.push({ x, z, v: 0, heal: true, phase: Math.random() * Math.PI * 2, pull: false, pullT: 0 });
  }

  // Vacuum relic: every XP gem on the field streams to the player.
  vacuum() { for (const g of this.list) if (!g.heal) g.pull = true; }

  update(dt, player, onCollect) {
    const px = player.pos.x, pz = player.pos.z;
    let w = 0;
    for (const g of this.list) {
      const dx = px - g.x, dz = pz - g.z, d = Math.hypot(dx, dz);
      if (g.pull || d < player.magnet) {
        g.pull = true;
        g.pullT += dt;
        const s = Math.min(d, (8 + 10 / (d + 0.5) + g.pullT * 14) * dt); // accelerates: long vacuum streams arrive
        if (d > 0.001) { g.x += dx / d * s; g.z += dz / d * s; }
      }
      if (d < 0.6) { onCollect(g); continue; }
      this.list[w++] = g;
    }
    this.list.length = w;
  }

  // Runs every frame (even while paused for a level-up) so gems keep shimmering.
  draw(time, glow) {
    const n = this.list.length;
    for (let i = 0; i < n; i++) {
      const g = this.list[i], t = tierFor(g);
      const y = 0.5 + Math.sin(time * 3 + g.phase) * 0.08;
      dummy.position.set(g.x, y, g.z);
      dummy.rotation.set(0, time * 2 + g.phase, 0);
      dummy.scale.setScalar(t.scale);
      dummy.updateMatrix();
      this.mesh.setMatrixAt(i, dummy.matrix);
      this.mesh.setColorAt(i, t.color);
      glow.add(g.x, y, g.z, (g.heal ? 0.7 : 0.45) * t.scale, t.color, g.heal ? 1.1 : 0.7);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }

  reset() { this.list.length = 0; this.mesh.count = 0; }
}
