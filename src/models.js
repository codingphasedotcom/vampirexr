import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Loads an animated GLB and bakes its skinned animation into a vertex-animation texture (VAT):
// row f          = vertex positions at frame f
// row frames + f = vertex normals at frame f
// The horde then animates in the vertex shader with a per-instance phase, so 500 enemies stay one draw call.

import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const _m = new THREE.Matrix4(), _skin = new THREE.Matrix4(), _bone = new THREE.Matrix4();
const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _bind = new THREE.Matrix4(), _bindInv = new THREE.Matrix4();

export function loadGLB(url) {
  return new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject));
}

// Scale to `height` metres, centre on x/z, feet on y = 0, optional yaw so the model faces +z.
function normalizeRoot(root, height, yaw) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const s = height / size.y;
  const fix = new THREE.Group();
  fix.rotation.y = yaw;
  fix.scale.setScalar(s);
  fix.position.set(-(box.min.x + size.x / 2) * s, -box.min.y * s, -(box.min.z + size.z / 2) * s);
  // yaw is applied before the translation, so re-centre using the rotated box
  fix.add(root);
  fix.updateMatrixWorld(true);
  const box2 = new THREE.Box3().setFromObject(fix);
  const c = box2.getCenter(new THREE.Vector3());
  fix.position.x -= c.x; fix.position.z -= c.z; fix.position.y -= box2.min.y;
  fix.updateMatrixWorld(true);
  return fix;
}

function bakeVAT(skinned, root, clip, frames, lift = 0) {
  const geo = skinned.geometry;
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  const si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
  const V = pos.count;
  const data = new Float32Array(V * frames * 2 * 4);
  const mixer = new THREE.AnimationMixer(root);
  mixer.clipAction(clip).play();
  const skel = skinned.skeleton;
  _bind.copy(skinned.bindMatrix);
  _bindInv.copy(skinned.bindMatrixInverse);
  // model-space transform of the skinned mesh (bones are resolved in its own space)
  const toModel = new THREE.Matrix4();
  const toModelN = new THREE.Matrix3();
  for (let f = 0; f < frames; f++) {
    mixer.setTime((f / frames) * clip.duration);
    root.updateMatrixWorld(true);
    skel.update();
    toModel.copy(skinned.matrixWorld);
    toModelN.getNormalMatrix(toModel);
    const bm = skel.boneMatrices;
    for (let i = 0; i < V; i++) {
      _skin.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
      for (let j = 0; j < 4; j++) {
        const w = sw.getComponent(i, j);
        if (w === 0) continue;
        _bone.fromArray(bm, si.getComponent(i, j) * 16);
        const a = _skin.elements, b = _bone.elements;
        for (let k = 0; k < 16; k++) a[k] += b[k] * w;
      }
      _m.copy(_bindInv).multiply(_skin).multiply(_bind);
      _v.fromBufferAttribute(pos, i).applyMatrix4(_m).applyMatrix4(toModel);
      _n.fromBufferAttribute(nor, i).transformDirection(_m).applyMatrix3(toModelN).normalize();
      const o = (f * V + i) * 4, on = ((frames + f) * V + i) * 4;
      data[o] = _v.x; data[o + 1] = _v.y + lift; data[o + 2] = _v.z; data[o + 3] = 1;
      data[on] = _n.x; data[on + 1] = _n.y; data[on + 2] = _n.z; data[on + 3] = 0;
    }
  }
  const tex = new THREE.DataTexture(data, V, frames * 2, THREE.RGBAFormat, THREE.FloatType);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

// Returns { geometry, texture, frames, duration, map } ready for an instanced VAT material.
export async function loadVATModel(url, { height = 1.7, yaw = 0, lift = 0, frames = 24 } = {}) {
  const gltf = await loadGLB(url);
  const root = normalizeRoot(gltf.scene, height, yaw);
  let skinned = null;
  root.traverse((o) => { if (o.isSkinnedMesh && !skinned) skinned = o; });
  if (!skinned || !gltf.animations.length) throw new Error(`${url}: no skinned mesh / animation`);
  const clip = gltf.animations[0];
  const texture = bakeVAT(skinned, root, clip, frames, lift);
  // fresh static geometry: positions come from the texture, we only keep uv/index for the draw
  const geometry = new THREE.BufferGeometry();
  const src = skinned.geometry;
  geometry.setIndex(src.index);
  geometry.setAttribute('position', src.attributes.position); // placeholder, overwritten in the shader
  geometry.setAttribute('normal', src.attributes.normal);
  if (src.attributes.uv) geometry.setAttribute('uv', src.attributes.uv);
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, lift + height / 2, 0), height);
  const map = skinned.material.map || null;
  if (map) map.colorSpace = THREE.SRGBColorSpace;
  return { geometry, texture, frames, duration: clip.duration, map, verts: src.attributes.position.count };
}

// Static (unanimated) GLB → single merged geometry in normalized model space, plus its base-color map.
// Meshopt-compressed GLBs store quantized (Int16/Int8 normalized) attributes; transforming those in place
// corrupts them, so copy to Float32 first.
function toFloat(attr) {
  const n = attr.count, size = attr.itemSize, out = new Float32Array(n * size);
  for (let i = 0; i < n; i++) for (let k = 0; k < size; k++) out[i * size + k] = attr.getComponent(i, k);
  return new THREE.BufferAttribute(out, size);
}

// `lift` raises the model off the floor (flying creatures hover at head height).
export async function loadStaticModel(url, { height = 1.7, yaw = 0, lift = 0 } = {}) {
  const gltf = await loadGLB(url);
  const root = normalizeRoot(gltf.scene, height, yaw);
  const parts = [];
  let map = null;
  root.traverse((o) => {
    if (!o.isMesh) return;
    const g = new THREE.BufferGeometry();
    g.setIndex(o.geometry.index);
    g.setAttribute('position', toFloat(o.geometry.attributes.position));
    g.setAttribute('normal', toFloat(o.geometry.attributes.normal));
    if (o.geometry.attributes.uv) g.setAttribute('uv', toFloat(o.geometry.attributes.uv));
    g.applyMatrix4(o.matrixWorld);
    parts.push(g);
    map = map || o.material.map;
  });
  if (!parts.length) throw new Error(`${url}: no meshes`);
  const geometry = parts.length === 1 ? parts[0] : mergeGeometries(parts);
  if (lift) geometry.translate(0, lift, 0);
  geometry.computeBoundingSphere();
  if (map) map.colorSpace = THREE.SRGBColorSpace;
  return { geometry, map };
}

// Lambert + map with a gentle per-instance sway so static horde models don't look frozen.
export function staticMaterial(model, timeUniform) {
  const mat = new THREE.MeshLambertMaterial({ map: model.map, color: 0xffffff });
  mat.customProgramCacheKey = () => 'static-sway';
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = timeUniform;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute float aPhase;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.x += sin(uTime * 6.0 + aPhase) * 0.05 * position.y;');
  };
  return mat;
}

// Lambert material that reads positions/normals from the VAT with a per-instance phase (aPhase, in cycles).
export function vatMaterial(vat, timeUniform, { rate = 1 } = {}) {
  const mat = new THREE.MeshLambertMaterial({ map: vat.map, color: 0xffffff });
  mat.customProgramCacheKey = () => 'vat';
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uVat = { value: vat.texture };
    shader.uniforms.uVatVerts = { value: vat.verts };
    shader.uniforms.uVatFrames = { value: vat.frames };
    shader.uniforms.uVatRate = { value: rate / vat.duration }; // cycles per second
    shader.uniforms.uTime = timeUniform;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D uVat; uniform float uVatVerts; uniform float uVatFrames; uniform float uVatRate; uniform float uTime;
        attribute float aPhase;
        vec2 vatUv(float row) { return vec2((float(gl_VertexID) + 0.5) / uVatVerts, (row + 0.5) / (uVatFrames * 2.0)); }`)
      .replace('#include <beginnormal_vertex>', `
        float vatFrame = floor(fract(uTime * uVatRate + aPhase) * uVatFrames);
        vec3 objectNormal = texture2D(uVat, vatUv(uVatFrames + vatFrame)).xyz;`)
      .replace('#include <begin_vertex>', 'vec3 transformed = texture2D(uVat, vatUv(vatFrame)).xyz;');
  };
  return mat;
}
