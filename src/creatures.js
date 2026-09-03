import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Procedural low-poly creatures. Each is a single merged geometry with vertex colors plus two extra
// attributes: aAnim (which limb this vertex belongs to, sign = side) and aGlow (emissive, for eyes).
// Animation happens in the vertex shader so hundreds of instances animate for free.

const _c = new THREE.Color();
const sphere = (r, w = 8, h = 6) => new THREE.SphereGeometry(r, w, h);
const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
const cone = (r, h, n = 6) => new THREE.ConeGeometry(r, h, n);

function part(g, color, { p = [0, 0, 0], r = [0, 0, 0], s = 1, anim = 0, glow = 0 } = {}) {
  if (Array.isArray(s)) g.scale(s[0], s[1], s[2]); else g.scale(s, s, s);
  g.rotateX(r[0]); g.rotateY(r[1]); g.rotateZ(r[2]);
  g.translate(p[0], p[1], p[2]);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  _c.set(color);
  for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aAnim', new THREE.BufferAttribute(new Float32Array(n).fill(anim), 1));
  g.setAttribute('aGlow', new THREE.BufferAttribute(new Float32Array(n).fill(glow), 1));
  return g;
}

// Models face +z and stand on y = 0.
export function batGeometry() {
  const body = 0x4a2a7a, wing = 0x6b3fb0, eye = 0xff3355;
  return mergeGeometries([
    part(sphere(0.18), body, { p: [0, 1.3, 0], s: [1, 0.8, 1.2] }),
    part(sphere(0.11), body, { p: [0, 1.42, 0.14] }),
    part(cone(0.05, 0.14, 4), body, { p: [-0.06, 1.54, 0.12] }),
    part(cone(0.05, 0.14, 4), body, { p: [0.06, 1.54, 0.12] }),
    part(box(0.55, 0.03, 0.28), wing, { p: [-0.42, 1.32, 0], anim: 1 }),
    part(box(0.55, 0.03, 0.28), wing, { p: [0.42, 1.32, 0], anim: 1 }),
    part(sphere(0.03, 6, 4), eye, { p: [-0.05, 1.44, 0.23], glow: 1 }),
    part(sphere(0.03, 6, 4), eye, { p: [0.05, 1.44, 0.23], glow: 1 }),
  ]);
}

export function ghoulGeometry() {
  const skin = 0x6f9c5a, cloth = 0x2f3a2a, eye = 0xffe066;
  return mergeGeometries([
    part(box(0.16, 0.55, 0.16), cloth, { p: [-0.12, 0.27, 0], anim: 2 }),
    part(box(0.16, 0.55, 0.16), cloth, { p: [0.12, 0.27, 0], anim: -2 }),
    part(box(0.48, 0.55, 0.28), cloth, { p: [0, 0.82, 0] }),
    part(sphere(0.17), skin, { p: [0, 1.24, 0.02] }),
    part(box(0.13, 0.5, 0.13), skin, { p: [-0.32, 1.07, 0.29], r: [1.3, 0, 0], anim: 1 }),
    part(box(0.13, 0.5, 0.13), skin, { p: [0.32, 1.07, 0.29], r: [1.3, 0, 0], anim: -1 }),
    part(sphere(0.035, 6, 4), eye, { p: [-0.06, 1.27, 0.16], glow: 1 }),
    part(sphere(0.035, 6, 4), eye, { p: [0.06, 1.27, 0.16], glow: 1 }),
  ]);
}

export function wraithGeometry() {
  const cloak = 0x33456e, inner = 0x0a0c16, eye = 0x7ff3ff;
  return mergeGeometries([
    part(cone(0.5, 1.5, 7), cloak, { p: [0, 0.85, 0], anim: 1 }),
    part(sphere(0.24), cloak, { p: [0, 1.55, 0] }),
    part(sphere(0.17), inner, { p: [0, 1.53, 0.1] }),
    part(box(0.1, 0.6, 0.1), cloak, { p: [-0.42, 1.05, 0.1], r: [0, 0, -0.4], anim: 1 }),
    part(box(0.1, 0.6, 0.1), cloak, { p: [0.42, 1.05, 0.1], r: [0, 0, 0.4], anim: 1 }),
    part(sphere(0.04, 6, 4), eye, { p: [-0.07, 1.56, 0.23], glow: 1 }),
    part(sphere(0.04, 6, 4), eye, { p: [0.07, 1.56, 0.23], glow: 1 }),
  ]);
}

export function bruteGeometry() {
  const skin = 0x9c2f3a, dark = 0x4a1a22, bone = 0xe6dcc3, eye = 0xffa030;
  return mergeGeometries([
    part(box(0.36, 0.6, 0.36), dark, { p: [-0.3, 0.3, 0], anim: 2 }),
    part(box(0.36, 0.6, 0.36), dark, { p: [0.3, 0.3, 0], anim: -2 }),
    part(box(1.1, 0.9, 0.7), skin, { p: [0, 1.2, 0] }),
    part(box(0.42, 0.4, 0.42), skin, { p: [0, 1.85, 0.12] }),
    part(box(0.3, 0.12, 0.2), dark, { p: [0, 1.7, 0.3] }),
    part(cone(0.09, 0.4, 5), bone, { p: [-0.24, 2.12, 0.1], r: [0, 0, 0.5] }),
    part(cone(0.09, 0.4, 5), bone, { p: [0.24, 2.12, 0.1], r: [0, 0, -0.5] }),
    part(box(0.32, 0.85, 0.32), skin, { p: [-0.76, 1.15, 0.1], anim: 1 }),
    part(box(0.32, 0.85, 0.32), skin, { p: [0.76, 1.15, 0.1], anim: -1 }),
    part(sphere(0.22), dark, { p: [-0.76, 0.7, 0.15], anim: 1 }),
    part(sphere(0.22), dark, { p: [0.76, 0.7, 0.15], anim: -1 }),
    part(sphere(0.05, 6, 4), eye, { p: [-0.11, 1.9, 0.34], glow: 1 }),
    part(sphere(0.05, 6, 4), eye, { p: [0.11, 1.9, 0.34], glow: 1 }),
  ]);
}

export const enemyTime = { value: 0 };

const ANIM = /* glsl */ `
#ifdef FLAP
  transformed.y += sin(uTime * 16.0 + aPhase) * abs(position.x) * 0.9 * aAnim;
#endif
#ifdef SHAMBLE
  {
    float s = sin(uTime * ANIM_SPEED + aPhase);
    float side = sign(aAnim), w = abs(aAnim);
    if (w > 1.5) transformed.z += s * side * 0.35 * max(0.0, HIP - position.y);
    else if (w > 0.5) { transformed.y += s * side * 0.08; transformed.x += s * side * 0.04; }
    transformed.x += sin(uTime * ANIM_SPEED * 0.5 + aPhase) * 0.04 * position.y;
  }
#endif
#ifdef WAVE
  transformed.x += sin(uTime * 4.0 + aPhase + position.y * 4.0) * 0.07 * aAnim;
  transformed.z += cos(uTime * 3.0 + aPhase + position.y * 3.0) * 0.05 * aAnim;
  transformed.y += sin(uTime * 2.5 + aPhase) * 0.05;
#endif
`;

// Lambert with vertex colors, per-instance phase, limb animation and emissive eyes.
export function creatureMaterial(mode, { speed = 7, hip = 0.55 } = {}) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  mat.defines = { [mode]: '', ANIM_SPEED: speed.toFixed(2), HIP: hip.toFixed(2) };
  mat.customProgramCacheKey = () => `${mode}-${speed}-${hip}`;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = enemyTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aAnim;\nattribute float aGlow;\nattribute float aPhase;\nuniform float uTime;\nvarying float vGlow;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvGlow = aGlow;\n${ANIM}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGlow;')
      .replace('#include <opaque_fragment>', 'outgoingLight = mix(outgoingLight, vColor.rgb * 1.8, vGlow);\n#include <opaque_fragment>');
  };
  return mat;
}
