import * as THREE from 'three';
import { rand } from './utils.js';
import { fxTime } from './fx.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toonMaterial } from './toon.js';
import { part } from './creatures.js';

const GOLD = new THREE.Color(0xffd166);
const WHITE = new THREE.Color(0xfff6dc);
const MAX = 3;
const OPEN_TIME = 1.1;

// Volumetric-looking light shaft: brightest where the cylinder faces the viewer, fading upward, with rising bands.
function beamMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: fxTime, uColor: { value: GOLD.clone() }, uBoost: { value: 1 } },
    vertexShader: `varying vec2 vUv; varying float vFacing;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vFacing = abs(dot(normalize(normalMatrix * normal), normalize(-mv.xyz)));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform float uTime, uBoost; uniform vec3 uColor; varying vec2 vUv; varying float vFacing;
      void main() {
        float h = vUv.y;
        float fade = pow(max(1.0 - h, 0.0), 1.7) * smoothstep(0.0, 0.03, h);
        float bands = 0.6 + 0.4 * sin(h * 28.0 - uTime * 5.0);
        float a = fade * pow(clamp(vFacing, 0.0, 1.0), 2.2) * bands * 0.8 * uBoost; // clamp: MSAA extrapolates varyings past edges
        gl_FragColor = vec4(uColor * a, a);
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

// Treasure chests scattered around the arena. Walk into one for a free upgrade: the lid flips open, the beam
// flares and the chest sinks away. A tall golden shaft marks each so it can be spotted through the fog.
export class Chests {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    // two vertex-coloured meshes per chest (base, hinged lid) + their ink shells: 4 draws, plus beam and ring
    this.mat = toonMaterial({ vertexColors: true, emissive: 0x1a1006 });
    this.ink = new THREE.MeshBasicMaterial({ color: 0x07040d, side: THREE.BackSide });
    this.beamGeo = new THREE.CylinderGeometry(0.32, 0.6, 10, 20, 1, true).translate(0, 5, 0);
    this.ringGeo = new THREE.RingGeometry(0.75, 1.0, 40).rotateX(-Math.PI / 2);
    const WOOD = 0x7a4f2a, DARK = 0x4a2d18, GOLD = 0xf0c24a;
    this.baseGeo = mergeGeometries([
      part(new THREE.BoxGeometry(0.72, 0.42, 0.48), WOOD, { p: [0, 0.25, 0] }),
      part(new THREE.BoxGeometry(0.75, 0.08, 0.5), GOLD, { p: [0, 0.25, 0] }),
      ...[[-0.3, -0.18], [0.3, -0.18], [-0.3, 0.18], [0.3, 0.18]].map(([x, z]) => part(new THREE.BoxGeometry(0.1, 0.06, 0.1), DARK, { p: [x, 0.03, z] })),
    ]);
    this.lidGeo = mergeGeometries([ // modelled around the hinge on the lid's back edge
      part(new THREE.CylinderGeometry(0.24, 0.24, 0.72, 12, 1, false, 0, Math.PI).rotateZ(Math.PI / 2), WOOD, { p: [0, 0, 0.24] }), // dome up, axis along x
      part(new THREE.BoxGeometry(0.12, 0.15, 0.06), GOLD, { p: [0, -0.02, 0.5] }),
    ]);
  }

  spawn(x, z) {
    if (this.list.length >= MAX) return null;
    const g = new THREE.Group(), model = new THREE.Group();
    const shell = (geo, parent, sy = 1.07) => { const o = new THREE.Mesh(geo, this.ink); o.scale.set(1.05, sy, 1.07); parent.add(o); };
    model.add(new THREE.Mesh(this.baseGeo, this.mat)); shell(this.baseGeo, model, 1.05);
    // the lid hinges on its back edge
    const hinge = new THREE.Group(); hinge.position.set(0, 0.46, -0.24); model.add(hinge);
    hinge.add(new THREE.Mesh(this.lidGeo, this.mat)); shell(this.lidGeo, hinge);
    g.add(model);
    const beamMat = beamMaterial();
    const beam = new THREE.Mesh(this.beamGeo, beamMat); beam.renderOrder = 4; beam.frustumCulled = false;
    const ring = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
    ring.position.y = 0.04; ring.renderOrder = 3;
    g.add(beam, ring);
    g.position.set(x, 0, z);
    model.rotation.y = rand(0, Math.PI * 2);
    this.scene.add(g);
    const c = { g, model, hinge, beam, ring, x, z, phase: rand(0, 6.28), opening: false, t: 0 };
    this.list.push(c);
    return c;
  }

  // Walk-in opens a chest immediately (reward applied by `onOpen`); the opening animation plays for OPEN_TIME.
  update(dt, player, onOpen) {
    let opened = 0, w = 0;
    for (const c of this.list) {
      if (!c.opening && Math.hypot(c.x - player.pos.x, c.z - player.pos.z) < 1.2) {
        c.opening = true; c.t = 0;
        onOpen(c);
        opened++;
      }
      if (c.opening) {
        c.t += dt;
        if (c.t >= OPEN_TIME) { this.remove(c); continue; }
      }
      this.list[w++] = c;
    }
    this.list.length = w;
    return opened;
  }

  draw(time, glow) {
    for (const c of this.list) {
      const u = c.beam.material.uniforms;
      if (c.opening) {
        const k = c.t / OPEN_TIME, lid = Math.min(1, c.t / 0.28);
        c.hinge.rotation.x = -(1 - Math.pow(1 - lid, 3)) * 1.95;
        u.uBoost.value = 1 + 3.5 * (1 - k);
        const s = k > 0.6 ? Math.max(0.01, 1 - (k - 0.6) / 0.4) : 1;
        c.model.scale.setScalar(s); c.model.position.y = -(1 - s) * 0.4;
        c.ring.scale.setScalar(1 + k * 2.5); c.ring.material.opacity = 0.6 * (1 - k);
        glow.add(c.x, 0.7, c.z, 2.4 * (1 - k * 0.6), WHITE, 1.2 * (1 - k));
      } else {
        c.model.position.y = Math.sin(time * 2 + c.phase) * 0.04;
        c.model.rotation.y += 0.004;
        c.ring.rotation.y = time * 0.6;
        c.ring.material.opacity = 0.35 + 0.2 * Math.sin(time * 3 + c.phase);
        u.uBoost.value = 1;
        glow.add(c.x, 0.55, c.z, 1.2, GOLD, 0.6);
      }
    }
  }

  remove(c) {
    this.scene.remove(c.g);
    c.beam.material.dispose(); c.ring.material.dispose();
  }

  reset() {
    for (const c of this.list) this.remove(c);
    this.list.length = 0;
  }
}
