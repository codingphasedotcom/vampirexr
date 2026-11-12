import * as THREE from 'three';
import { rand, makeCanvas } from './utils.js';
import { glowTexture, fxTime, noiseTexture } from './fx.js';
export { noiseTexture };
import { RAMP } from './toon.js';

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
      if (c.disabled) continue;
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

// Random ring placement for an InstancedMesh; `place(d, i)` sets rotation/scale, `radiusFn` adds a circle collider,
// `heightFn` (optional) makes that collider a shadow caster of that height in the light bake (strength `k`).
export function scatter(mesh, count, rMin, rMax, place, colliders, radiusFn, heightFn, k = 1) {
  for (let i = 0; i < count; i++) {
    const a = rand(0, Math.PI * 2), r = rand(rMin, rMax);
    _d.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    _d.rotation.set(0, 0, 0); _d.scale.setScalar(1);
    place(_d, i);
    _d.updateMatrix();
    mesh.setMatrixAt(i, _d.matrix);
    if (colliders && radiusFn) colliders.add({ x: _d.position.x, z: _d.position.z, r: radiusFn(_d), h: heightFn ? heightFn(_d) : 0, k });
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

// ---------- Baked lighting ----------
// While building, a level registers shadow casters and static lights; then everything is painted once into a
// 1024² RGBA texture covering ±100 m: RGB = light pools (braziers, street lamps, torches, windows), A = occlusion
// (contact AO under every prop + long sun/moon shadows along the key light). Ground and props read it in their
// shaders (one texture fetch, no runtime lights); creatures sample it on the CPU as light probes (World.probe).
const BAKE_RES = 1024, BAKE_EXTENT = 200;
const _neutral = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat);
_neutral.needsUpdate = true;
export const bakeUniforms = { uBake: { value: _neutral }, uBakeSize: { value: BAKE_EXTENT }, uBakeLight: { value: 1 }, uBakeShadow: { value: 1 } };

function hull(pts) { // monotone-chain convex hull of [[x, y], ...]
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  up.pop(); lo.pop();
  return lo.concat(up);
}

export class LightBake {
  constructor() { this.circles = []; this.boxes = []; this.lights = []; this.data = null; this.texture = null; }
  // Round caster: footprint radius r, top height h, strength k; yb > 0 lifts it off the ground (tree canopies).
  circle(x, z, r, h, k = 1, yb = 0) { this.circles.push({ x, z, r, h, k, yb }); }
  // Rectangular caster: centre, half sizes, yaw (local +x points along (cos yaw, sin yaw) in x/z), top yt, bottom yb.
  box(x, z, hx, hz, yaw, yt, k = 1, yb = 0) { this.boxes.push({ x, z, hx, hz, yaw, yt, k, yb }); }
  segment(x1, z1, x2, z2, r, h, k = 1) {
    const len = Math.hypot(x2 - x1, z2 - z1);
    this.box((x1 + x2) / 2, (z1 + z2) / 2, len / 2 + r, r, Math.atan2(z2 - z1, x2 - x1), h, k);
  }
  light(x, z, radius, color, intensity = 1) { this.lights.push({ x, z, radius, color: new THREE.Color(color), intensity }); }

  build(keyPos, { shadow = 0.55, maxLen = 14 } = {}) {
    const S = BAKE_RES, E = BAKE_EXTENT, ppm = S / E, toPx = (v) => (v / E + 0.5) * S;
    const kl = Math.hypot(keyPos[0], keyPos[2]) || 1;
    const dx = -keyPos[0] / kl, dz = -keyPos[2] / kl, cot = kl / Math.max(1, keyPos[1]); // shadows fall away from the key light
    const occ = makeCanvas(S, S), g = occ.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, S, S);
    if ('filter' in g) g.filter = 'blur(1.5px)';
    const shade = (a) => `rgba(0,0,0,${Math.min(1, a).toFixed(3)})`;
    // long shadows: round casters sweep a capsule, boxes sweep the hull of their footprint
    for (const c of this.circles) {
      const from = Math.min(maxLen, c.yb * cot), to = Math.max(from + 0.01, Math.min(maxLen, c.h * cot));
      const x0 = toPx(c.x + dx * from), y0 = toPx(c.z + dz * from), x1 = toPx(c.x + dx * to), y1 = toPx(c.z + dz * to), r = Math.max(1, c.r * ppm);
      const grad = g.createLinearGradient(x0, y0, x1, y1);
      grad.addColorStop(0, shade(shadow * c.k)); grad.addColorStop(1, shade(shadow * c.k * 0.3));
      const ang = Math.atan2(y1 - y0, x1 - x0);
      g.fillStyle = grad; g.beginPath();
      g.arc(x0, y0, r, ang + Math.PI / 2, ang + Math.PI * 1.5);
      g.arc(x1, y1, r, ang - Math.PI / 2, ang + Math.PI / 2);
      g.closePath(); g.fill();
    }
    for (const b of this.boxes) {
      const c = Math.cos(b.yaw), sn = Math.sin(b.yaw), from = Math.min(maxLen, b.yb * cot), to = Math.min(maxLen, b.yt * cot), pts = [];
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const fx = b.x + sx * b.hx * c - sz * b.hz * sn, fz = b.z + sx * b.hx * sn + sz * b.hz * c;
        pts.push([toPx(fx + dx * from), toPx(fz + dz * from)], [toPx(fx + dx * to), toPx(fz + dz * to)]);
      }
      const h = hull(pts);
      const grad = g.createLinearGradient(toPx(b.x + dx * from), toPx(b.z + dz * from), toPx(b.x + dx * to), toPx(b.z + dz * to));
      grad.addColorStop(0, shade(shadow * b.k)); grad.addColorStop(1, shade(shadow * b.k * 0.35));
      g.fillStyle = grad; g.beginPath(); g.moveTo(h[0][0], h[0][1]);
      for (let i = 1; i < h.length; i++) g.lineTo(h[i][0], h[i][1]);
      g.closePath(); g.fill();
    }
    // contact ambient occlusion where things meet the ground
    for (const c of this.circles) {
      if (c.yb > 0.4) continue;
      const x = toPx(c.x), y = toPx(c.z), r = Math.max(2, c.r * 2.4 * ppm), grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, shade(0.5 * c.k)); grad.addColorStop(1, shade(0));
      g.fillStyle = grad; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    g.lineJoin = 'round';
    for (const b of this.boxes) {
      if (b.yb > 0.4) continue;
      const c = Math.cos(b.yaw), sn = Math.sin(b.yaw);
      g.beginPath();
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sz], i) => {
        const x = toPx(b.x + sx * b.hx * c - sz * b.hz * sn), y = toPx(b.z + sx * b.hx * sn + sz * b.hz * c);
        if (i) g.lineTo(x, y); else g.moveTo(x, y);
      });
      g.closePath();
      g.fillStyle = shade(0.4 * b.k); g.fill();
      g.strokeStyle = shade(0.22 * b.k); g.lineWidth = Math.max(2, 0.9 * ppm); g.stroke();
    }
    // light pools, added together
    const lc = makeCanvas(S, S), lg = lc.getContext('2d');
    lg.fillStyle = '#000'; lg.fillRect(0, 0, S, S);
    lg.globalCompositeOperation = 'lighter';
    for (const L of this.lights) {
      const x = toPx(L.x), y = toPx(L.z), r = L.radius * ppm, I = Math.min(1, L.intensity);
      const rgb = `${Math.round(L.color.r * 255)},${Math.round(L.color.g * 255)},${Math.round(L.color.b * 255)}`;
      const grad = lg.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, `rgba(${rgb},${I})`); grad.addColorStop(0.25, `rgba(${rgb},${(I * 0.5).toFixed(3)})`); grad.addColorStop(1, `rgba(${rgb},0)`);
      lg.fillStyle = grad; lg.fillRect(x - r, y - r, r * 2, r * 2);
    }
    const od = g.getImageData(0, 0, S, S).data, ld = lg.getImageData(0, 0, S, S).data, data = new Uint8Array(S * S * 4);
    for (let i = 0, n = S * S; i < n; i++) {
      const o = i * 4;
      data[o] = ld[o]; data[o + 1] = ld[o + 1]; data[o + 2] = ld[o + 2]; data[o + 3] = od[o];
    }
    for (let k = 0; k < S; k++) for (const [u, v] of [[k, 0], [k, S - 1], [0, k], [S - 1, k]]) { // neutral rim: ClampToEdge stays open/unlit outside
      const o = (v * S + u) * 4; data[o] = data[o + 1] = data[o + 2] = 0; data[o + 3] = 255;
    }
    const tex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
    tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true;
    tex.needsUpdate = true;
    this.data = data; this.texture = tex;
    return tex;
  }

  // CPU light probe: albedo multiplier for a creature standing at (x, z) (shadow darkens, light pools tint/brighten).
  probe(x, z, out, shadowK = 1, lightK = 1) {
    if (!this.data) return out.setScalar(1);
    const S = BAKE_RES, u = Math.floor((x / BAKE_EXTENT + 0.5) * S), v = Math.floor((z / BAKE_EXTENT + 0.5) * S);
    if (u < 0 || v < 0 || u >= S || v >= S) return out.setScalar(1);
    const i = (v * S + u) * 4, d = this.data, o = 1 - (1 - d[i + 3] / 255) * 0.65 * shadowK, k = (lightK * 1.5) / 255;
    return out.setRGB(o + d[i] * k, o + d[i + 1] * k, o + d[i + 2] * k);
  }
}

// Prop shading from the bake: light pools on the lower few metres, contact darkening near the ground and a share of
// the baked occlusion. `ground` = flat surfaces (roads) that take shadows at full strength like the terrain.
function bakeProps(mat, ground) {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, bakeUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBakeW;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        { vec4 bw = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            bw = instanceMatrix * bw;
          #endif
          vBakeW = (modelMatrix * bw).xyz; }`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uBake; uniform float uBakeSize, uBakeLight, uBakeShadow; varying vec3 vBakeW;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          vec4 bk = texture2D(uBake, vBakeW.xz / uBakeSize + 0.5);
          ${ground ? 'diffuseColor.rgb *= mix(1.0, bk.a, uBakeShadow);'
            : 'diffuseColor.rgb *= mix(1.0, mix(1.0, bk.a, 0.4) * mix(0.7, 1.0, smoothstep(0.0, 1.1, vBakeW.y)), uBakeShadow);'}
          totalEmissiveRadiance += diffuseColor.rgb * bk.rgb * uBakeLight * ${ground ? '2.6' : '2.0'} * (1.0 - smoothstep(1.5, 7.0, vBakeW.y));
        }`);
  };
  mat.customProgramCacheKey = () => `prop-bake-${ground ? 'g' : 'p'}`;
  return mat;
}

// Ground shading that hides tiling: the base texture is sampled twice (second copy rotated and rescaled) and the two
// are swapped by large-scale noise, an optional second surface (`groundAlt`: moss, dirt, snow…) is blended in organic
// patches, and two octaves of light/dark macro noise sit on top. Five texture reads, no extra draw calls.
function groundMaterial(level) {
  const strength = level.groundVariation ?? 0.35;
  const alt = level.groundAlt ? level.groundAlt() : null;
  const mat = new THREE.MeshLambertMaterial({ map: level.ground() });
  const [lo, hi] = level.groundAltMask ?? [0.45, 0.62];
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uMacro = { value: noiseTexture() };
    Object.assign(shader.uniforms, bakeUniforms);
    if (alt) { shader.uniforms.uAlt = { value: alt }; shader.uniforms.uAltScale = { value: level.groundAltScale ?? 0.8 }; }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vMacro; varying vec2 vBakeUv; uniform float uBakeSize;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvMacro = uv * 7.0;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvBakeUv = (modelMatrix * vec4(transformed, 1.0)).xz / uBakeSize + 0.5;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform sampler2D uMacro; varying vec2 vMacro; varying vec2 vBakeUv;
        uniform sampler2D uBake; uniform float uBakeLight, uBakeShadow;${alt ? '\nuniform sampler2D uAlt; uniform float uAltScale;' : ''}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * bakeT.rgb * uBakeLight * 2.6; // baked light pools`)
      .replace('#include <map_fragment>', `
        float mA = texture2D(uMacro, vMacro).r, mB = texture2D(uMacro, vMacro * 4.3 + 0.37).r;
        vec4 tA = texture2D(map, vMapUv);
        vec4 tB = texture2D(map, mat2(0.8, -0.6, 0.6, 0.8) * vMapUv * 0.71 + vec2(0.37, 0.21));
        vec4 groundTex = mix(tA, tB, smoothstep(0.42, 0.58, mB));
        ${alt ? `float altMask = smoothstep(${lo.toFixed(2)}, ${hi.toFixed(2)}, mA * 0.7 + mB * 0.3);
        groundTex = mix(groundTex, texture2D(uAlt, vMapUv * uAltScale), altMask);` : ''}
        diffuseColor *= groundTex;
        diffuseColor.rgb *= mix(1.0 - ${strength.toFixed(2)}, 1.0 + ${(strength * 0.4).toFixed(2)}, smoothstep(0.25, 0.75, mA)) * mix(0.88, 1.08, mB);
        vec4 bakeT = texture2D(uBake, vBakeUv);
        diffuseColor.rgb *= mix(1.0, bakeT.a, uBakeShadow); // baked contact AO + sun/moon shadows`);
  };
  mat.customProgramCacheKey = () => `ground-${level.id}-${strength}-${alt ? 'alt' : 'base'}`;
  return mat;
}

// Procedural sky dome: gradient + horizon glow, a twinkling hashed star field and drifting nebula wisps (night levels),
// all in one fragment shader. It follows the camera (stars sit at infinity) and is drawn after opaque geometry so
// early-z skips every pixel hidden by the ground and props.
const SKY_FRAG = `uniform vec3 uTop, uHorizon, uNebulaA, uNebulaB; uniform float uStars, uTime, uNebula; uniform sampler2D uNoise;
  varying vec3 vDir;
  vec3 hash33(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 col = mix(uHorizon, uTop, smoothstep(-0.02, 0.5, h));
    col += uHorizon * 0.22 * exp(-abs(h) * 16.0);
    if (uStars > 0.001 && h > -0.06) {
      vec3 p = d * 90.0, cell = floor(p), r = hash33(cell);
      float dist = length(p - (cell + 0.3 + r * 0.4));
      float size = 0.08 + 0.2 * r.y * r.y;
      float tw = 0.55 + 0.45 * sin(uTime * (1.3 + r.z * 3.0) + r.y * 40.0);
      float star = step(0.9, r.x) * smoothstep(size, size * 0.15, dist) * tw;
      vec3 starCol = mix(vec3(0.72, 0.8, 1.0), vec3(1.0, 0.86, 0.72), r.z);
      float horizonFade = smoothstep(-0.04, 0.22, h);
      col += starCol * star * uStars * horizonFade * 1.5;
      vec2 uv = d.xz / (h + 0.42);
      float n1 = texture2D(uNoise, uv * 0.16 + vec2(uTime * 0.0015, 0.0)).r;
      float n2 = texture2D(uNoise, uv * 0.41 - vec2(0.0, uTime * 0.0025)).r;
      float neb = smoothstep(0.48, 0.86, n1 * 0.72 + n2 * 0.48) * smoothstep(0.02, 0.4, h);
      col += mix(uNebulaA, uNebulaB, n2) * neb * uNebula * uStars;
    }
    col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0; // dither away banding
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }`;

// Moon / sun: limb darkening plus faint mottled maria for the moon (`craters` 0 = a plain sun disc).
function celestialMaterial(color, craters) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uNoise: { value: noiseTexture() }, uCraters: { value: craters } },
    vertexShader: 'varying vec3 vN; varying vec2 vUv; void main(){ vUv = uv; vN = normalMatrix * normal; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 uColor; uniform sampler2D uNoise; uniform float uCraters; varying vec3 vN; varying vec2 vUv;
      void main() {
        float limb = pow(max(normalize(vN).z, 0.0), 0.4);
        float n = texture2D(uNoise, vUv * vec2(2.0, 1.0)).r, m = texture2D(uNoise, vUv * vec2(6.0, 3.0) + 0.3).r;
        float maria = mix(1.0, 0.72 + 0.28 * smoothstep(0.35, 0.65, n) * (0.9 + 0.1 * m), uCraters);
        gl_FragColor = vec4(uColor * maria * mix(0.72, 1.0, limb), 1.0);
        #include <colorspace_fragment>
      }`,
    fog: false,
  });
}

// A drifting sheet of low mist that follows the player; enemies wade through it.
export class GroundFog {
  constructor(group, { color, opacity = 0.5, height = 0.4, radius = 42 }) {
    this.radius = radius;
    this.mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 48).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
      uniforms: { uNoise: { value: noiseTexture() }, uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity },
        uTime: fxTime, uCenter: { value: new THREE.Vector3() }, uRadius: { value: radius } },
      vertexShader: `varying vec3 vWorld;
        void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform sampler2D uNoise; uniform vec3 uColor; uniform float uOpacity, uTime, uRadius; uniform vec3 uCenter;
        varying vec3 vWorld;
        void main() {
          vec2 p = vWorld.xz;
          float n = texture2D(uNoise, p * 0.035 + vec2(uTime * 0.011, uTime * 0.006)).r;
          float m = texture2D(uNoise, p * 0.09 - vec2(uTime * 0.017, -uTime * 0.012)).r;
          float d = length(p - uCenter.xz) / uRadius;
          float a = smoothstep(0.45, 0.85, n * 0.75 + m * 0.45) * (1.0 - smoothstep(0.55, 1.0, d)) * smoothstep(0.02, 0.12, d) * uOpacity;
          gl_FragColor = vec4(uColor, a);
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, fog: false,
    }));
    this.mesh.position.y = height;
    this.mesh.renderOrder = 5;
    this.mesh.frustumCulled = false;
    group.add(this.mesh);
  }
  update(playerPos) {
    this.mesh.position.x = playerPos.x; this.mesh.position.z = playerPos.z;
    this.mesh.material.uniforms.uCenter.value.copy(playerPos);
  }
}

// Flickering fire glows (no real lights: the Quest pays per light per pixel). Positions are world points.
export class Flames {
  constructor(group, points, { color = 0xff8a2a, size = 1.6 } = {}) {
    const n = points.length * 3;
    this.base = points; this.pos = new Float32Array(n * 3); this.col = new Float32Array(n * 3);
    this.color = new THREE.Color(color); this.hot = new THREE.Color(0xffe6a0);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ map: glowTexture(), size, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.points.frustumCulled = false;
    group.add(this.points);
  }
  update(time) {
    const p = this.pos, c = this.col;
    this.base.forEach((b, i) => {
      for (let k = 0; k < 3; k++) {
        const j = (i * 3 + k) * 3, f = 0.65 + 0.35 * Math.sin(time * (9 + k * 4) + i * 1.7) * Math.sin(time * 5.3 + i);
        p[j] = b.x + Math.sin(time * 3 + i + k) * 0.05; p[j + 1] = b.y + k * 0.28 + f * 0.08; p[j + 2] = b.z;
        const col = k === 2 ? this.hot : this.color, s = f * (k === 0 ? 1.0 : k === 1 ? 0.8 : 0.55);
        c[j] = col.r * s; c[j + 1] = col.g * s; c[j + 2] = col.b * s;
      }
    });
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}

// GPU weather: every drop/flake lives in a box that wraps around the player, animated entirely in the vertex shader
// (one draw call, no per-frame CPU work). 'rain' = slanted streaks, 'snow' = soft drifting flakes.
export class Weather {
  constructor(group, { type = 'rain', count = 1600, box = 36, height = 18 } = {}) {
    this.type = type;
    const rain = type === 'rain', verts = rain ? count * 2 : count;
    const seed = new Float32Array(verts * 3), end = new Float32Array(verts);
    for (let i = 0; i < count; i++) {
      const sx = Math.random(), sy = Math.random(), sz = Math.random();
      for (let k = 0; k < (rain ? 2 : 1); k++) {
        const v = rain ? i * 2 + k : i;
        seed[v * 3] = sx; seed[v * 3 + 1] = sy; seed[v * 3 + 2] = sz; end[v] = k;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts * 3), 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
    g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    this.uniforms = { uTime: fxTime, uCenter: { value: new THREE.Vector3() }, uBox: { value: box }, uHeight: { value: height } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: `uniform float uTime, uBox, uHeight; uniform vec3 uCenter; attribute vec3 aSeed; attribute float aEnd; varying float vFade;
        void main() {
          vec3 p;
          p.x = uCenter.x + (fract(aSeed.x - uCenter.x / uBox) - 0.5) * uBox;
          p.z = uCenter.z + (fract(aSeed.z - uCenter.z / uBox) - 0.5) * uBox;
          ${rain ? `p.y = mod(aSeed.y * uHeight - uTime * 17.0, uHeight);
          p.x += aEnd * 0.12; p.y += aEnd * 0.75;` : `p.y = mod(aSeed.y * uHeight - uTime * 1.3, uHeight);
          p.x += sin(uTime * 0.9 + aSeed.x * 40.0) * 0.6; p.z += cos(uTime * 0.7 + aSeed.z * 40.0) * 0.6;`}
          vec4 mv = viewMatrix * vec4(p, 1.0);
          vFade = smoothstep(uBox * 0.5, uBox * 0.2, length(p.xz - uCenter.xz));
          ${rain ? '' : 'gl_PointSize = clamp(90.0 / -mv.z, 1.0, 14.0);'}
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `varying float vFade;
        void main() {
          ${rain ? 'gl_FragColor = vec4(0.72, 0.8, 0.95, 0.32 * vFade);' : 'float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(0.95, 0.97, 1.0, (1.0 - smoothstep(0.2, 0.5, d)) * 0.85 * vFade);'}
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false,
    });
    this.mesh = rain ? new THREE.LineSegments(g, mat) : new THREE.Points(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    group.add(this.mesh);
  }
  update(playerPos) { this.uniforms.uCenter.value.copy(playerPos); }
}

const _ca = new THREE.Color(), _cb = new THREE.Color();
const lerpHex = (out, a, b, t) => out.copy(_ca.set(a)).lerp(_cb.set(b), t);

// Converts a level's Lambert props to cel-shaded toon materials so the world matches the characters.
function toonify(group) {
  const cache = new Map();
  group.traverse((o) => {
    if (!o.isMesh || o.userData.keepMaterial) return;
    const m = o.material;
    if (!m || !m.isMeshLambertMaterial) return;
    let t = cache.get(m);
    if (!t) {
      t = bakeProps(new THREE.MeshToonMaterial({ gradientMap: RAMP, color: m.color, map: m.map, emissive: m.emissive, emissiveMap: m.emissiveMap,
        emissiveIntensity: m.emissiveIntensity, vertexColors: m.vertexColors, side: m.side,
        transparent: m.transparent, opacity: m.opacity }), !!o.userData.bakeGround);
      cache.set(m, t);
      m.dispose();
    }
    o.material = t;
  });
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

    // Everything at "infinity" (sky dome, moon/sun, clouds) rides in skyGroup, which follows the camera each frame.
    const skyGroup = this.skyGroup = new THREE.Group();
    g.add(skyGroup);
    const neb = level.nebula ?? {};
    const sky = this.sky = new THREE.Mesh(new THREE.SphereGeometry(280, 48, 24), new THREE.ShaderMaterial({
      uniforms: { uTop: { value: new THREE.Color(level.sky.top) }, uHorizon: { value: new THREE.Color(level.sky.horizon) },
        uStars: { value: level.stars ? 1 : 0 }, uTime: fxTime, uNoise: { value: noiseTexture() },
        uNebulaA: { value: new THREE.Color(neb.a ?? 0x5a2a8a) }, uNebulaB: { value: new THREE.Color(neb.b ?? 0x1f4a8f) },
        uNebula: { value: neb.strength ?? 0.4 } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide, depthWrite: false, fog: false,
    }));
    sky.renderOrder = 50; sky.frustumCulled = false; // after opaques: early-z culls the sky behind the ground
    skyGroup.add(sky);

    this.hemi = new THREE.HemisphereLight(level.hemi.sky, level.hemi.ground, level.hemi.intensity);
    g.add(this.hemi);
    const key = this.key = new THREE.DirectionalLight(level.key.color, level.key.intensity);
    key.position.set(...level.key.position);
    g.add(key);
    if (level.rim) { const rim = new THREE.DirectionalLight(level.rim.color, level.rim.intensity); rim.position.set(...level.rim.position); g.add(rim); }

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), groundMaterial(level));
    ground.rotation.x = -Math.PI / 2;
    ground.userData.keepMaterial = true;
    g.add(ground);

    if (level.celestial) {
      const c = level.celestial;
      const body = new THREE.Mesh(new THREE.SphereGeometry(c.radius, 32, 20), celestialMaterial(c.color, level.stars ? 1 : 0));
      body.position.set(...c.position);
      body.userData.keepMaterial = true;
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: c.glow, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: c.glowOpacity ?? 0.9 }));
      halo.position.copy(body.position); halo.scale.setScalar(c.glowSize);
      skyGroup.add(body, halo);
      this.celestial = { body, halo, base: body.position.clone() };
    }

    this.clouds = [];
    const cloudMat = this.cloudMat = new THREE.SpriteMaterial({ map: cloudTexture(), color: level.clouds.color, transparent: true, opacity: level.clouds.opacity, depthWrite: false, fog: false });
    for (let i = 0; i < level.clouds.count; i++) {
      const s = new THREE.Sprite(cloudMat);
      const a = rand(0, Math.PI * 2), r = rand(120, 230);
      s.position.set(Math.cos(a) * r, rand(45, 95), Math.sin(a) * r);
      s.scale.set(rand(70, 120), rand(30, 50), 1);
      skyGroup.add(s);
      this.clouds.push(s);
    }

    const bake = this.bake = new LightBake();
    this.ambient = level.build(g, this.colliders, bake) || null;
    for (const c of this.colliders.all) { // colliders that declared a height cast baked shadows too
      if (!c.h) continue;
      if (c.x1 !== undefined) bake.segment(c.x1, c.z1, c.x2, c.z2, c.r, c.h, c.k ?? 1);
      else bake.circle(c.x, c.z, c.r, c.h, c.k ?? 1);
    }
    bakeUniforms.uBake.value = bake.build(level.key.position, level.bake);
    bakeUniforms.uBakeLight.value = level.dayCycle ? 0 : 1;
    bakeUniforms.uBakeShadow.value = 1;
    toonify(g);
    // Top-down cutaway: tall scenery (city towers, castle arches) is clipped above `topdownClip` metres so it never
    // hides the player from the overhead camera. Inactive (constant far away) in first-person / VR.
    this.clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e6);
    if (level.topdownClip) g.traverse((o) => {
      if (!o.isMesh || o.userData.keepMaterial) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m && !m.isShaderMaterial) m.clippingPlanes = [this.clipPlane];
    });
    this.groundFog = level.groundFog ? new GroundFog(g, level.groundFog) : null;
    this.weather = level.weather ? new Weather(g, level.weather) : null;
    this.playerLightNow = level.playerLight;
    this.thunderT = level.weather?.thunder ? 6 + Math.random() * 8 : Infinity;
    this.flash = 0;
    this.baseHemi = level.hemi.intensity;
  }

  // Top-down sees the whole mist sheet and looks through 20 m of fog: thin both so the battlefield stays readable.
  setTopdown(on) {
    this.clipPlane.constant = on && this.level.topdownClip ? this.level.topdownClip : 1e6;
    this.fogScale = on ? 0.45 : 1;
    if (!this.level.dayCycle) this.scene.fog.density = this.level.fog.density * this.fogScale;
    if (this.groundFog) this.groundFog.mesh.material.uniforms.uOpacity.value = this.level.groundFog.opacity * (on ? 0.15 : 1);
  }

  // Day → sunset → night for levels with a `dayCycle` (u = 0..1). Lerps sky, fog, lights, sun height and stars.
  setTimeOfDay(u) {
    const keys = this.level.dayCycle?.keys;
    if (!keys) return;
    let i = 0;
    while (i < keys.length - 2 && u > keys[i + 1].t) i++;
    const A = keys[i], B = keys[i + 1], t = Math.min(1, Math.max(0, (u - A.t) / (B.t - A.t)));
    const f = (k) => A[k] + (B[k] - A[k]) * t;
    const su = this.sky.material.uniforms;
    lerpHex(su.uTop.value, A.top, B.top, t); lerpHex(su.uHorizon.value, A.horizon, B.horizon, t);
    lerpHex(this.scene.fog.color, A.fog, B.fog, t); this.scene.fog.density = f('fogDensity') * (this.fogScale ?? 1);
    lerpHex(this.hemi.color, A.hemiSky, B.hemiSky, t); lerpHex(this.hemi.groundColor, A.hemiGround, B.hemiGround, t);
    this.baseHemi = f('hemi');
    lerpHex(this.key.color, A.keyColor, B.keyColor, t); this.key.intensity = f('key');
    if (this.celestial) {
      const c = this.celestial, y = f('sunY');
      c.body.position.set(c.base.x, y, c.base.z); c.halo.position.copy(c.body.position);
      lerpHex(c.halo.material.color, A.sunGlow, B.sunGlow, t);
      c.body.visible = c.halo.visible = y > -10;
      this.key.position.set(c.base.x, Math.max(8, y), c.base.z);
    }
    this.sky.material.uniforms.uStars.value = f('stars');
    if (A.clouds !== undefined) lerpHex(this.cloudMat.color, A.clouds, B.clouds, t);
    this.playerLightNow = f('playerLight');
    bakeUniforms.uBakeLight.value = Math.min(1, this.playerLightNow / 12);       // windows light up as night falls
    bakeUniforms.uBakeShadow.value = 0.35 + 0.65 * Math.min(1, f('key') / keys[0].key); // sun shadows fade with the sun
    if (this.groundFog) this.groundFog.mesh.material.uniforms.uColor.value.copy(this.scene.fog.color);
  }

  update(dt, time, playerPos, camPos = playerPos) {
    this.skyGroup.position.set(camPos.x, 0, camPos.z);
    for (const c of this.clouds) {
      c.position.x += dt * 1.2;
      if (c.position.x > 260) c.position.x = -260;
    }
    this.ambient?.update?.(dt, time, playerPos);
    this.groundFog?.update(playerPos);
    this.weather?.update(playerPos);
    // storm: occasional lightning flash across the sky; returns true on the frame thunder should play
    let thunder = false;
    this.thunderT -= dt;
    if (this.thunderT <= 0) { this.thunderT = 7 + Math.random() * 12; this.flash = 1; thunder = true; }
    this.flash = Math.max(0, this.flash - dt * 2.5);
    const flicker = this.flash > 0 ? this.flash * (0.6 + 0.4 * Math.sin(time * 60)) : 0;
    this.hemi.intensity = this.baseHemi * (1 + flicker * 3);
    if (this.flash > 0 || this._flashed) {
      this.sky.material.uniforms.uTop.value.set(this.level.sky.top).lerp(_ca.set(0x8fa0d8), flicker * 0.6);
      this._flashed = this.flash > 0;
    }
    return thunder;
  }

  // Light probe for creatures: albedo multiplier from the bake at (x, z).
  probe(x, z, out) { return this.bake.probe(x, z, out, bakeUniforms.uBakeShadow.value, bakeUniforms.uBakeLight.value); }

  dispose() {
    this.bake.texture?.dispose();
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      o.geometry?.dispose?.();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) { if (!m) continue; m.map?.dispose?.(); m.dispose?.(); }
    });
  }
}
