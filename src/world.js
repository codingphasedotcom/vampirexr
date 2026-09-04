import * as THREE from 'three';
import { rand, makeCanvas } from './utils.js';
import { glowTexture } from './fx.js';

// Shared world machinery: colliders, prop scattering, sky/fog/lights/ground driven by a level definition
// (see src/levels/*.js). Everything a level adds goes into one group so switching levels is a clean swap.

export const _d = new THREE.Object3D();

// Colliders are circles {x, z, r} or wall segments {x1, z1, x2, z2, r}, bucketed on a coarse grid.
const CELL = 6;
const ckey = (cx, cz) => (cx + 512) * 1024 + (cz + 512);

export class Colliders {
  constructor() { this.grid = new Map(); this.all = []; }
  add(col) {
    this.all.push(col);
    const xs = col.x1 !== undefined ? [col.x1, col.x2] : [col.x], zs = col.z1 !== undefined ? [col.z1, col.z2] : [col.z];
    const x0 = Math.floor((Math.min(...xs) - col.r) / CELL), x1 = Math.floor((Math.max(...xs) + col.r) / CELL);
    const z0 = Math.floor((Math.min(...zs) - col.r) / CELL), z1 = Math.floor((Math.max(...zs) + col.r) / CELL);
    for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
      const k = ckey(cx, cz);
      let a = this.grid.get(k);
      if (!a) { a = []; this.grid.set(k, a); }
      a.push(col);
    }
  }
  // Axis-aligned rectangle (centre, half sizes) as four wall segments.
  addBox(x, z, hx, hz, r = 0.2) {
    this.add({ x1: x - hx, z1: z - hz, x2: x + hx, z2: z - hz, r });
    this.add({ x1: x + hx, z1: z - hz, x2: x + hx, z2: z + hz, r });
    this.add({ x1: x + hx, z1: z + hz, x2: x - hx, z2: z + hz, r });
    this.add({ x1: x - hx, z1: z + hz, x2: x - hx, z2: z - hz, r });
  }
  // Pushes a circle of radius `r` at (x, z) out of anything it overlaps. Mutates and returns `out`.
  resolve(x, z, r, out) {
    out.x = x; out.z = z;
    const a = this.grid.get(ckey(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (!a) return out;
    for (const c of a) {
      let nx, nz, d, min;
      if (c.x1 !== undefined) {
        const ex = c.x2 - c.x1, ez = c.z2 - c.z1, len2 = ex * ex + ez * ez || 1;
        let t = ((out.x - c.x1) * ex + (out.z - c.z1) * ez) / len2;
        t = Math.max(0, Math.min(1, t));
        nx = out.x - (c.x1 + ex * t); nz = out.z - (c.z1 + ez * t);
      } else { nx = out.x - c.x; nz = out.z - c.z; }
      d = Math.hypot(nx, nz); min = c.r + r;
      if (d < min) {
        if (d < 1e-4) { nx = 1; nz = 0; d = 1; }
        out.x += nx / d * (min - d); out.z += nz / d * (min - d);
      }
    }
    return out;
  }
  overlaps(x, z, r) { const o = { x, z }; this.resolve(x, z, r, o); return o.x !== x || o.z !== z; }
}

// Random ring placement for an InstancedMesh; `place(d, i)` sets rotation/scale, `radiusFn` adds a circle collider.
export function scatter(mesh, count, rMin, rMax, place, colliders, radiusFn) {
  for (let i = 0; i < count; i++) {
    const a = rand(0, Math.PI * 2), r = rand(rMin, rMax);
    _d.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    _d.rotation.set(0, 0, 0); _d.scale.setScalar(1);
    place(_d, i);
    _d.updateMatrix();
    mesh.setMatrixAt(i, _d.matrix);
    if (colliders && radiusFn) colliders.add({ x: _d.position.x, z: _d.position.z, r: radiusFn(_d) });
  }
  return mesh;
}

export function tileTexture(size, repeat, draw) {
  const c = makeCanvas(size, size);
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function cloudTexture() {
  const c = makeCanvas(256, 256), g = c.getContext('2d');
  for (let i = 0; i < 14; i++) {
    const x = rand(60, 196), y = rand(80, 176), r = rand(30, 70);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
  }
  return new THREE.CanvasTexture(c);
}

// Drifting ambient points (fireflies, pollen, ash) that follow the player around.
export class Drifters {
  constructor(group, { count = 70, color = 0xd8ff70, size = 0.15, opacity = 0.7, minY = 0.4, maxY = 2.6, radius = 26, speed = 1 } = {}) {
    this.base = new Float32Array(count * 3); this.pos = new Float32Array(count * 3); this.phase = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2), r = rand(3, radius);
      this.base[i * 3] = Math.cos(a) * r; this.base[i * 3 + 1] = rand(minY, maxY); this.base[i * 3 + 2] = Math.sin(a) * r;
      this.phase[i] = rand(0, 100);
    }
    this.speed = speed;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ map: glowTexture(), color, size, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.points.frustumCulled = false;
    group.add(this.points);
  }
  update(dt, time, playerPos) {
    this.points.position.lerp(playerPos, dt * 0.5);
    const b = this.base, p = this.pos, ph = this.phase, t = time * this.speed;
    for (let i = 0; i < ph.length; i++) {
      p[i * 3] = b[i * 3] + Math.sin(t * 0.7 + ph[i]) * 1.5;
      p[i * 3 + 1] = b[i * 3 + 1] + Math.sin(t * 1.3 + ph[i] * 2.0) * 0.4;
      p[i * 3 + 2] = b[i * 3 + 2] + Math.cos(t * 0.5 + ph[i]) * 1.5;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}

export class World {
  constructor(scene, level) {
    this.scene = scene;
    this.level = level;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.colliders = new Colliders();
    const g = this.group;

    scene.fog = new THREE.FogExp2(level.fog.color, level.fog.density);
    scene.background = null;

    const sky = new THREE.Mesh(new THREE.SphereGeometry(280, 32, 16), new THREE.ShaderMaterial({
      uniforms: { uTop: { value: new THREE.Color(level.sky.top) }, uHorizon: { value: new THREE.Color(level.sky.horizon) } },
      vertexShader: 'varying vec3 vW; void main(){ vW = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 uTop, uHorizon; varying vec3 vW;
        void main(){ float h = normalize(vW).y; gl_FragColor = vec4(mix(uHorizon, uTop, smoothstep(-0.02, 0.45, h)), 1.0);
        #include <colorspace_fragment> }`,
      side: THREE.BackSide, depthWrite: false, fog: false,
    }));
    sky.renderOrder = -2; sky.frustumCulled = false;
    g.add(sky);

    g.add(new THREE.HemisphereLight(level.hemi.sky, level.hemi.ground, level.hemi.intensity));
    const key = new THREE.DirectionalLight(level.key.color, level.key.intensity);
    key.position.set(...level.key.position);
    g.add(key);
    if (level.rim) { const rim = new THREE.DirectionalLight(level.rim.color, level.rim.intensity); rim.position.set(...level.rim.position); g.add(rim); }

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ map: level.ground() }));
    ground.rotation.x = -Math.PI / 2;
    g.add(ground);

    if (level.celestial) {
      const c = level.celestial;
      const body = new THREE.Mesh(new THREE.SphereGeometry(c.radius, 24, 16), new THREE.MeshBasicMaterial({ color: c.color, fog: false }));
      body.position.set(...c.position);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: c.glow, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: c.glowOpacity ?? 0.9 }));
      halo.position.copy(body.position); halo.scale.setScalar(c.glowSize);
      g.add(body, halo);
    }

    if (level.stars) {
      const N = 1500, pos = new Float32Array(N * 3), v = new THREE.Vector3();
      for (let i = 0; i < N; i++) {
        v.randomDirection(); if (v.y < 0.05) v.y = -v.y + 0.05; v.multiplyScalar(250);
        pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
      }
      const sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.1, fog: false, transparent: true, opacity: 0.9 }));
      stars.renderOrder = -1;
      g.add(stars);
    }

    this.clouds = [];
    const cloudMat = new THREE.SpriteMaterial({ map: cloudTexture(), color: level.clouds.color, transparent: true, opacity: level.clouds.opacity, depthWrite: false, fog: false });
    for (let i = 0; i < level.clouds.count; i++) {
      const s = new THREE.Sprite(cloudMat);
      const a = rand(0, Math.PI * 2), r = rand(120, 230);
      s.position.set(Math.cos(a) * r, rand(45, 95), Math.sin(a) * r);
      s.scale.set(rand(70, 120), rand(30, 50), 1);
      g.add(s);
      this.clouds.push(s);
    }

    this.ambient = level.build(g, this.colliders) || null;
  }

  update(dt, time, playerPos) {
    for (const c of this.clouds) {
      c.position.x += dt * 1.2;
      if (c.position.x > 260) c.position.x = -260;
    }
    this.ambient?.update?.(dt, time, playerPos);
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      o.geometry?.dispose?.();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) { if (!m) continue; m.map?.dispose?.(); m.dispose?.(); }
    });
  }
}
