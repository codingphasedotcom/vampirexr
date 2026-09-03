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
          vColor = aColor * exp(-uFog * uFog * d * d);
          gl_PointSize = min(512.0, aSize * 420.0 / max(d, 0.1));
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
    g.attributes.position.needsUpdate = true;
    g.attributes.aColor.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true;
  }
}

// Pooled floating damage numbers (one tiny canvas per sprite).
export class DamageNumbers {
  constructor(scene, max = 40) {
    this.items = [];
    for (let i = 0; i < max; i++) {
      const c = makeCanvas(96, 48);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
      s.visible = false;
      s.renderOrder = 20;
      scene.add(s);
      this.items.push({ s, c, tex, life: 0, vy: 0 });
    }
  }

  spawn(x, y, z, value, color = '#fff') {
    const it = this.items.find((i) => i.life <= 0);
    if (!it) return;
    const g = it.c.getContext('2d');
    g.clearRect(0, 0, 96, 48);
    g.font = 'bold 34px system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 6; g.strokeStyle = '#000'; g.strokeText(String(value), 48, 24);
    g.fillStyle = color; g.fillText(String(value), 48, 24);
    it.tex.needsUpdate = true;
    it.s.position.set(x + rand(-0.2, 0.2), y, z + rand(-0.2, 0.2));
    const sc = Math.min(1.7, 0.6 + value / 60);
    it.s.scale.set(0.6 * sc, 0.3 * sc, 1);
    it.s.material.opacity = 1;
    it.s.visible = true;
    it.life = 0.8; it.vy = 1.6;
  }

  update(dt) {
    for (const it of this.items) {
      if (it.life <= 0) continue;
      it.life -= dt;
      it.s.position.y += it.vy * dt;
      it.vy -= 2.5 * dt;
      it.s.material.opacity = Math.min(1, it.life * 2.5);
      if (it.life <= 0) it.s.visible = false;
    }
  }
}
