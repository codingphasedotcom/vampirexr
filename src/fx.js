import * as THREE from 'three';
import { makeCanvas, rand } from './utils.js';

// Wall-clock time for ambient shader animation (keeps ticking during menus).
export const fxTime = { value: 0 };

let _glowTex = null;
export function glowTexture() {
  if (_glowTex) return _glowTex;
  const c = makeCanvas(128, 128), g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.2, 'rgba(255,255,255,0.7)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.15)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  _glowTex = new THREE.CanvasTexture(c);
  return _glowTex;
}

// Tileable fractal value noise (R channel), shared by the sky, ground variation, ground fog and decals.
let _noise = null;
export function noiseTexture() {
  if (_noise) return _noise;
  const S = 256, data = new Uint8Array(S * S * 4), acc = new Float32Array(S * S);
  let amp = 1, total = 0;
  for (const period of [4, 8, 16, 32, 64]) {
    const lat = new Float32Array(period * period).map(() => Math.random());
    const cell = S / period;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const gx = x / cell, gy = y / cell, x0 = Math.floor(gx), y0 = Math.floor(gy);
      const fx = gx - x0, fy = gy - y0, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      const v = (i, j) => lat[((y0 + j) % period) * period + ((x0 + i) % period)];
      acc[y * S + x] += amp * ((v(0, 0) * (1 - sx) + v(1, 0) * sx) * (1 - sy) + (v(0, 1) * (1 - sx) + v(1, 1) * sx) * sy);
    }
    total += amp; amp *= 0.55;
  }
  for (let i = 0; i < S * S; i++) { const v = Math.round((acc[i] / total) * 255); data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v; data[i * 4 + 3] = 255; }
  _noise = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  _noise.wrapS = _noise.wrapT = THREE.RepeatWrapping;
  _noise.magFilter = _noise.minFilter = THREE.LinearFilter;
  _noise.needsUpdate = true;
  return _noise;
}

// Upload only the used prefix of a dynamic attribute.
function touch(attr, count) {
  attr.clearUpdateRanges();
  attr.addUpdateRange(0, Math.max(1, count * attr.itemSize));
  attr.needsUpdate = true;
}

// Immediate-mode additive glow sprites. Callers push points each frame; everything draws as one Points call.
export class GlowLayer {
  constructor(scene, max = 5000) {
    this.max = max; this.n = 0;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: glowTexture() }, uFog: { value: 0.022 } },
      vertexShader: `
        attribute float aSize; attribute vec3 aColor; uniform float uFog; varying vec3 vColor;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float d = -mv.z;
          vColor = aColor * exp(-uFog * uFog * d * d) * smoothstep(0.25, 1.4, d);
          gl_PointSize = min(256.0, aSize * 420.0 / max(d, 0.1));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D map; varying vec3 vColor;
        void main() {
          float a = texture2D(map, gl_PointCoord).a;
          gl_FragColor = vec4(vColor * a, a);
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    scene.add(this.points);
  }

  begin() { this.n = 0; }

  add(x, y, z, size, color, intensity = 1) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.col[i * 3] = color.r * intensity; this.col[i * 3 + 1] = color.g * intensity; this.col[i * 3 + 2] = color.b * intensity;
    this.size[i] = size;
  }

  end() {
    const g = this.points.geometry;
    g.setDrawRange(0, this.n);
    touch(g.attributes.position, this.n);
    touch(g.attributes.aColor, this.n);
    touch(g.attributes.aSize, this.n);
  }
}

// Immediate-mode additive ribbons: camera-facing strips with a hot core and soft edges, rebuilt every frame and drawn
// in one call. Used for lightning, gun tracers, bolt / boomerang trails and the dash streak (WebGL lines are 1 px).
export class Ribbons {
  constructor(scene, maxVerts = 6000) {
    this.max = maxVerts; this.n = 0; this.ni = 0;
    this.cam = new THREE.Vector3();
    this.pos = new Float32Array(maxVerts * 3);
    this.col = new Float32Array(maxVerts * 3);
    this.uv = new Float32Array(maxVerts * 2);
    this.idx = new Uint16Array(maxVerts * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('uv', new THREE.BufferAttribute(this.uv, 2).setUsage(THREE.DynamicDrawUsage));
    geo.setIndex(new THREE.BufferAttribute(this.idx, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      vertexShader: 'attribute vec3 aColor; varying vec3 vColor; varying vec2 vUv; void main(){ vColor = aColor; vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec3 vColor; varying vec2 vUv;
        void main() {
          float c = clamp(1.0 - abs(vUv.y * 2.0 - 1.0), 0.0, 1.0); // MSAA can extrapolate uv past the edge: pow(<0) = NaN
          float k = c * c * 0.75 + pow(c, 9.0) * 1.8;
          gl_FragColor = vec4(vColor * k, k);
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 11;
    scene.add(this.mesh);
  }

  begin(camPos) { this.n = 0; this.ni = 0; this.cam.copy(camPos); }

  // pts: flat [x,y,z, x,y,z, ...] with `count` points. `taper` (0..0.5) narrows both ends; `fade` dims the tail (start).
  strip(pts, count, width, color, intensity = 1, taper = 0, fade = 0) {
    if (count < 2 || this.n + count * 2 > this.max) return;
    const c = this.cam, base = this.n, P = this.pos, C = this.col, U = this.uv;
    for (let i = 0; i < count; i++) {
      const a = Math.max(0, i - 1) * 3, b = Math.min(count - 1, i + 1) * 3, p = i * 3;
      const tx = pts[b] - pts[a], ty = pts[b + 1] - pts[a + 1], tz = pts[b + 2] - pts[a + 2];
      const vx = c.x - pts[p], vy = c.y - pts[p + 1], vz = c.z - pts[p + 2];
      let sx = ty * vz - tz * vy, sy = tz * vx - tx * vz, sz = tx * vy - ty * vx;
      const f = i / (count - 1);
      const prof = taper > 0 ? Math.min(1, 0.2 + Math.min(f, 1 - f) / taper) : 1;
      const l = Math.hypot(sx, sy, sz) || 1, w = width * 0.5 * prof / l;
      sx *= w; sy *= w; sz *= w;
      const v = (base + i * 2) * 3;
      P[v] = pts[p] + sx; P[v + 1] = pts[p + 1] + sy; P[v + 2] = pts[p + 2] + sz;
      P[v + 3] = pts[p] - sx; P[v + 4] = pts[p + 1] - sy; P[v + 5] = pts[p + 2] - sz;
      const k = intensity * (fade > 0 ? Math.min(1, (1 - fade) + f * fade * 1.2) : 1);
      C[v] = C[v + 3] = color.r * k; C[v + 1] = C[v + 4] = color.g * k; C[v + 2] = C[v + 5] = color.b * k;
      const u = (base + i * 2) * 2;
      U[u] = f; U[u + 1] = 0; U[u + 2] = f; U[u + 3] = 1;
    }
    const I = this.idx;
    for (let i = 0; i < count - 1; i++) {
      const v = base + i * 2, j = this.ni + i * 6;
      I[j] = v; I[j + 1] = v + 1; I[j + 2] = v + 2; I[j + 3] = v + 1; I[j + 4] = v + 3; I[j + 5] = v + 2;
    }
    this.n += count * 2; this.ni += (count - 1) * 6;
  }

  // Convenience: straight segment.
  line(x0, y0, z0, x1, y1, z1, width, color, intensity = 1) {
    _seg[0] = x0; _seg[1] = y0; _seg[2] = z0; _seg[3] = x1; _seg[4] = y1; _seg[5] = z1;
    this.strip(_seg, 2, width, color, intensity);
  }

  end() {
    const g = this.mesh.geometry;
    g.setDrawRange(0, this.ni);
    touch(g.attributes.position, this.n);
    touch(g.attributes.aColor, this.n);
    touch(g.attributes.uv, this.n);
    touch(g.index, this.ni);
  }
}
const _seg = new Float32Array(6);

// Persistent ground decals (one instanced draw): kill splats, scorch marks, slam cracks. A ring buffer; each decal
// fades out by itself in the shader (no per-frame CPU work), expired slots are collapsed twice a second.
export const DECAL = { SPLAT: 0, SCORCH: 1, CRACK: 2 };
const _dm = new THREE.Object3D(), _dc = new THREE.Color();
export class Decals {
  constructor(scene, max = 320) {
    this.max = max; this.next = 0; this.used = 0; this.sweep = 0;
    this.born = new Float32Array(max).fill(-1e9); this.life = new Float32Array(max);
    const geo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
    this.data = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aData', this.data);
    const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uNoise: { value: null } }]);
    uniforms.uNoise.value = noiseTexture();
    uniforms.uTime = fxTime;
    const mat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: `attribute vec4 aData; varying vec2 vUv; varying vec4 vData; varying vec3 vColor;
        #include <fog_pars_vertex>
        void main() {
          vUv = uv; vData = aData; vColor = instanceColor;
          vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `uniform float uTime; uniform sampler2D uNoise; varying vec2 vUv; varying vec4 vData; varying vec3 vColor;
        #include <fog_pars_fragment>
        float h1(float n) { return fract(sin(n) * 43758.5453); }
        void main() {
          float seed = vData.x, age = uTime - vData.y, life = vData.z, kind = vData.w;
          float fade = clamp(age * 10.0, 0.0, 1.0) * clamp((life - age) / (life * 0.4), 0.0, 1.0);
          if (fade <= 0.0) discard;
          vec2 p = vUv * 2.0 - 1.0;
          float d = length(p), ang = atan(p.y, p.x);
          float n = texture2D(uNoise, vec2(cos(ang), sin(ang)) * 0.12 + vec2(seed, seed * 1.7)).r;
          float g = texture2D(uNoise, p * 0.35 + seed * 3.0).r;
          vec3 col = vColor; float a;
          if (kind < 0.5) {
            float r = 0.36 + 0.55 * n;
            a = 1.0 - smoothstep(r - 0.07, r, d);
            for (int k = 0; k < 5; k++) {
              float fk = float(k);
              vec2 c = vec2(h1(seed * 13.1 + fk * 7.3), h1(seed * 5.7 + fk * 3.1)) * 1.5 - 0.75;
              float rr = 0.05 + 0.09 * h1(seed * 2.3 + fk);
              a = max(a, 1.0 - smoothstep(rr - 0.03, rr, length(p - c)));
            }
            col *= 0.6 + 0.6 * g;
            a *= 0.82;
          } else if (kind < 1.5) {
            a = (1.0 - smoothstep(0.1, 0.95, d + (n - 0.5) * 0.4)) * 0.8;
            float ring = smoothstep(0.22, 0.0, abs(d - 0.5 - (n - 0.5) * 0.25)) * clamp(1.0 - age / 1.4, 0.0, 1.0);
            col = mix(vec3(0.03, 0.02, 0.03), vColor, ring);
            a = max(a, ring);
          } else {
            float spokes = pow(abs(sin(ang * 3.5 + n * 5.0 + seed * 9.0)), 36.0) * smoothstep(1.0, 0.15, d);
            float web = smoothstep(0.62, 0.7, texture2D(uNoise, p * 0.8 + seed).r) * smoothstep(0.95, 0.3, d) * 0.6;
            a = max(spokes, web) * 0.9 + (1.0 - smoothstep(0.0, 0.35, d)) * 0.5;
            col = vColor * (0.7 + 0.3 * g);
          }
          a *= fade;
          if (a < 0.01) discard;
          gl_FragColor = vec4(col, a);
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
      fog: true, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, _dc.setScalar(1));
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 0;
    this.mesh.count = 0;
    scene.add(this.mesh);
  }

  // Lay a decal of `radius` metres. `kind`: DECAL.SPLAT / SCORCH / CRACK.
  add(x, z, radius, color, kind = DECAL.SPLAT, life = 16) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    this.used = Math.max(this.used, i + 1);
    _dm.position.set(x, 0.02, z); _dm.rotation.set(0, rand(0, Math.PI * 2), 0); _dm.scale.setScalar(radius);
    _dm.updateMatrix();
    this.mesh.setMatrixAt(i, _dm.matrix);
    this.mesh.setColorAt(i, _dc.set(color));
    const t = fxTime.value;
    this.data.setXYZW(i, Math.random(), t, life, kind);
    this.born[i] = t; this.life[i] = life;
    this.mesh.count = this.used;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
    this.data.needsUpdate = true;
  }

  // Collapse expired decals so they cost no fill.
  update(dt) {
    this.sweep -= dt;
    if (this.sweep > 0) return;
    this.sweep = 0.5;
    const t = fxTime.value;
    let dirty = false;
    _dm.scale.setScalar(0); _dm.updateMatrix();
    for (let i = 0; i < this.used; i++) {
      if (this.born[i] > -1e8 && t - this.born[i] > this.life[i]) { this.mesh.setMatrixAt(i, _dm.matrix); this.born[i] = -1e9; dirty = true; }
    }
    if (dirty) this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear() {
    this.born.fill(-1e9); this.used = 0; this.next = 0; this.mesh.count = 0;
  }
}

// Pooled floating damage numbers: digits from a canvas atlas drawn as camera-facing instanced quads (one draw call,
// hundreds on screen). White glyph fill is tinted per number; black stroke stays black.
const GLYPHS = '0123456789+';
const MAX_DIGITS = 6;
export class DamageNumbers {
  constructor(scene, max = 260) {
    this.max = max;
    this.items = [];
    this.scale = 1;      // global multiplier (top-down camera is far away)
    this.enabled = true;
    const GW = 48, GH = 64;
    this.canvas = makeCanvas(GW * GLYPHS.length, GH);
    const draw = () => {
      const g = this.canvas.getContext('2d');
      g.clearRect(0, 0, this.canvas.width, GH);
      g.font = '800 50px Inter, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      for (let i = 0; i < GLYPHS.length; i++) {
        const x = i * GW + GW / 2;
        g.lineWidth = 10; g.strokeStyle = '#000'; g.strokeText(GLYPHS[i], x, GH / 2 + 3);
        g.fillStyle = '#fff'; g.fillText(GLYPHS[i], x, GH / 2 + 3);
      }
      if (this.tex) this.tex.needsUpdate = true;
    };
    draw();
    document.fonts?.ready?.then(draw);
    this.tex = new THREE.CanvasTexture(this.canvas);
    const N = max * MAX_DIGITS;
    const plane = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = plane.index;
    geo.setAttribute('position', plane.attributes.position);
    geo.setAttribute('uv', plane.attributes.uv);
    this.iA = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.iB = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.iC = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iA', this.iA); geo.setAttribute('iB', this.iB); geo.setAttribute('iColor', this.iC);
    geo.instanceCount = 0;
    this.mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms: { uAtlas: { value: this.tex }, uGlyphs: { value: GLYPHS.length } },
      vertexShader: `attribute vec4 iA; attribute vec4 iB; attribute vec3 iColor; uniform float uGlyphs;
        varying vec2 vUv; varying vec3 vColor; varying float vAlpha;
        void main() {
          vec4 mv = modelViewMatrix * vec4(iA.xyz, 1.0);
          mv.xy += (position.xy * vec2(0.75, 1.0) + vec2(iB.x * 0.6, 0.0)) * iB.y;
          gl_Position = projectionMatrix * mv;
          vUv = vec2((iA.w + uv.x) / uGlyphs, uv.y);
          vColor = iColor; vAlpha = iB.z;
        }`,
      fragmentShader: `uniform sampler2D uAtlas; varying vec2 vUv; varying vec3 vColor; varying float vAlpha;
        void main() {
          vec4 t = texture2D(uAtlas, vUv);
          float a = t.a * vAlpha;
          if (a < 0.02) discard;
          gl_FragColor = vec4(vColor * t.r, a);
          #include <colorspace_fragment>
        }`,
      transparent: true, depthTest: false, depthWrite: false,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 20;
    scene.add(this.mesh);
    this._c = new THREE.Color();
  }

  // value: number to show; color: CSS colour; opts: { scale, prefix: '+', life }
  spawn(x, y, z, value, color = '#fff', opts = {}) {
    if (!this.enabled) return;
    let it;
    if (this.items.length < this.max) { it = {}; this.items.push(it); }
    else { it = this.items[0]; for (const o of this.items) if (o.life < it.life) it = o; } // recycle the oldest
    const s = (opts.prefix || '') + String(Math.min(999999, Math.max(0, Math.round(value))));
    it.glyphs = Array.from(s.slice(0, MAX_DIGITS), (ch) => GLYPHS.indexOf(ch)).filter((g) => g >= 0);
    it.x = x + rand(-0.25, 0.25); it.y = y; it.z = z + rand(-0.25, 0.25);
    it.vx = rand(-0.4, 0.4); it.vy = 1.8; it.vz = rand(-0.4, 0.4);
    it.max = it.life = opts.life ?? 0.8;
    it.size = Math.min(1.7, 0.65 + value / 60) * 0.3 * (opts.scale ?? 1);
    this._c.set(color);
    it.r = this._c.r; it.g = this._c.g; it.b = this._c.b;
  }

  update(dt) {
    let k = 0;
    const A = this.iA.array, B = this.iB.array, C = this.iC.array, S = this.scale;
    for (const it of this.items) {
      if (it.life <= 0) continue;
      it.life -= dt;
      if (it.life <= 0) continue;
      it.x += it.vx * dt; it.y += it.vy * dt; it.z += it.vz * dt;
      it.vy -= 3 * dt;
      const t = it.max - it.life, pop = t < 0.12 ? 1 + 0.7 * (1 - t / 0.12) : 1;
      const alpha = Math.min(1, it.life / 0.3), n = it.glyphs.length;
      for (let i = 0; i < n && k < this.max * MAX_DIGITS; i++, k++) {
        A[k * 4] = it.x; A[k * 4 + 1] = it.y; A[k * 4 + 2] = it.z; A[k * 4 + 3] = it.glyphs[i];
        B[k * 4] = i - (n - 1) / 2; B[k * 4 + 1] = it.size * pop * S; B[k * 4 + 2] = alpha;
        C[k * 3] = it.r; C[k * 3 + 1] = it.g; C[k * 3 + 2] = it.b;
      }
    }
    this.mesh.geometry.instanceCount = k;
    touch(this.iA, k); touch(this.iB, k); touch(this.iC, k);
  }

  clear() { for (const it of this.items) it.life = 0; }
}
