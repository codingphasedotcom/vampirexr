import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rand } from '../utils.js';
import { scatter, tileTexture, Drifters, _d } from '../world.js';

const HORIZON = 0x1c1230;

function groundTexture() {
  return tileTexture(512, 125, (g, S) => {
    g.fillStyle = '#2a2233'; g.fillRect(0, 0, S, S);
    const N = 8, cell = S / N;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (Math.random() < 0.2) {
        g.strokeStyle = '#3c5a38'; g.lineWidth = 2;
        for (let k = 0; k < 6; k++) {
          const bx = x * cell + rand(10, cell - 10), by = y * cell + rand(10, cell - 10);
          g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + rand(-6, 6), by - rand(6, 14)); g.stroke();
        }
        continue;
      }
      const m = rand(4, 9), w = cell - m * 2 - rand(0, 8), h = cell - m * 2 - rand(0, 8);
      const px = x * cell + m + rand(0, 4), py = y * cell + m + rand(0, 4), l = rand(0, 1);
      g.fillStyle = `rgb(${Math.round(52 + l * 20)}, ${Math.round(46 + l * 16)}, ${Math.round(66 + l * 22)})`;
      g.beginPath(); g.roundRect(px, py, w, h, 6); g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 3; g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(px + 3, py + 3, w - 6, 4);
      if (Math.random() < 0.3) {
        g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(px + rand(4, w - 4), py + 4); g.lineTo(px + rand(4, w - 4), py + h / 2); g.lineTo(px + rand(4, w - 4), py + h - 4); g.stroke();
      }
    }
  });
}

export function deadTreeGeometry() {
  const parts = [new THREE.CylinderGeometry(0.14, 0.32, 3.2, 7).translate(0, 1.6, 0)];
  const n = 4 + Math.floor(rand(0, 3));
  for (let i = 0; i < n; i++) {
    const len = rand(1.2, 2.2), a = (i / n) * Math.PI * 2 + rand(-0.4, 0.4);
    parts.push(new THREE.CylinderGeometry(0.03, 0.1, len, 5).translate(0, len / 2, 0).rotateZ(rand(0.6, 1.2)).rotateY(a).translate(0, rand(1.8, 3.1), 0));
    const sl = len * 0.5;
    parts.push(new THREE.CylinderGeometry(0.015, 0.05, sl, 4).translate(0, sl / 2, 0)
      .rotateZ(rand(0.8, 1.6)).rotateY(a + rand(-0.8, 0.8)).translate(Math.sin(a) * len * 0.5, rand(2.4, 3.6), Math.cos(a) * len * 0.5));
  }
  return mergeGeometries(parts);
}

export function fenceGeometry() {
  const parts = [
    new THREE.BoxGeometry(0.08, 1.3, 0.08).translate(-1, 0.65, 0),
    new THREE.BoxGeometry(0.08, 1.3, 0.08).translate(1, 0.65, 0),
    new THREE.BoxGeometry(2, 0.05, 0.05).translate(0, 0.45, 0),
    new THREE.BoxGeometry(2, 0.05, 0.05).translate(0, 1.0, 0),
  ];
  for (let i = -3; i <= 3; i++) {
    parts.push(new THREE.BoxGeometry(0.04, 1.1, 0.04).translate(i * 0.28, 0.55, 0));
    parts.push(new THREE.ConeGeometry(0.05, 0.14, 4).translate(i * 0.28, 1.17, 0));
  }
  return mergeGeometries(parts);
}

// Straight runs of fence segments with wall colliders.
export function fenceRuns(group, colliders, material, runs, rMin, rMax) {
  const max = runs * 7;
  const fence = new THREE.InstancedMesh(fenceGeometry(), material, max);
  let fi = 0;
  for (let run = 0; run < runs && fi < max; run++) {
    const a = rand(0, Math.PI * 2), r = rand(rMin, rMax), dir = rand(0, Math.PI * 2), n = 3 + Math.floor(rand(0, 5));
    const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
    for (let k = 0; k < n && fi < max; k++) {
      _d.position.set(cx + Math.cos(dir) * (k - n / 2) * 2, 0, cz + Math.sin(dir) * (k - n / 2) * 2);
      _d.rotation.set(0, -dir, 0); _d.scale.setScalar(1);
      _d.updateMatrix();
      fence.setMatrixAt(fi++, _d.matrix);
      colliders.add({ x1: _d.position.x - Math.cos(dir), z1: _d.position.z - Math.sin(dir), x2: _d.position.x + Math.cos(dir), z2: _d.position.z + Math.sin(dir), r: 0.12 });
    }
  }
  fence.count = fi;
  group.add(fence);
}

const tombGeometry = () => mergeGeometries([
  new THREE.BoxGeometry(0.5, 0.7, 0.14).translate(0, 0.35, 0),
  new THREE.CylinderGeometry(0.25, 0.25, 0.14, 12).rotateX(Math.PI / 2).translate(0, 0.7, 0),
]);
const crossGeometry = () => mergeGeometries([
  new THREE.BoxGeometry(0.12, 1.2, 0.12).translate(0, 0.6, 0),
  new THREE.BoxGeometry(0.6, 0.12, 0.12).translate(0, 0.9, 0),
]);

export const graveyard = {
  id: 'graveyard', name: 'Graveyard', desc: 'Moonlit tombstones and dead trees. The classic night.',
  sky: { top: 0x04020a, horizon: HORIZON },
  fog: { color: HORIZON, density: 0.022 },
  hemi: { sky: 0x6a70ff, ground: 0x2a1a20, intensity: 1.1 },
  key: { color: 0xc0ccff, intensity: 1.7, position: [60, 70, -120] },
  rim: { color: 0xff7a5a, intensity: 0.35, position: [-50, 10, 60] },
  celestial: { position: [60, 70, -120], radius: 7, color: 0xe6ecff, glow: 0x7f8cff, glowSize: 70 },
  stars: true,
  clouds: { color: 0x5a4a80, opacity: 0.5, count: 10 },
  bloom: { strength: 0.55, threshold: 0.72 },
  playerLight: 14,
  ground: groundTexture,
  build(group, col) {
    const stone = new THREE.MeshLambertMaterial({ color: 0x4a4458 });
    const iron = new THREE.MeshLambertMaterial({ color: 0x1a1a24 });
    const wood = new THREE.MeshLambertMaterial({ color: 0x1e1722 });
    group.add(scatter(new THREE.InstancedMesh(tombGeometry(), stone, 140), 140, 7, 85, (d) => {
      d.rotation.set(rand(-0.15, 0.15), rand(0, Math.PI * 2), rand(-0.12, 0.12)); d.scale.setScalar(rand(0.8, 1.5));
    }, col, (d) => 0.3 * d.scale.x));
    group.add(scatter(new THREE.InstancedMesh(crossGeometry(), stone, 60), 60, 7, 85, (d) => {
      d.rotation.set(rand(-0.2, 0.2), rand(0, Math.PI * 2), rand(-0.15, 0.15)); d.scale.setScalar(rand(0.8, 1.3));
    }, col, (d) => 0.18 * d.scale.x));
    group.add(scatter(new THREE.InstancedMesh(deadTreeGeometry(), wood, 45), 45, 12, 88, (d) => {
      d.rotation.set(rand(-0.08, 0.08), rand(0, Math.PI * 2), rand(-0.08, 0.08)); d.scale.setScalar(rand(0.9, 1.8));
    }, col, (d) => 0.32 * d.scale.x));
    group.add(scatter(new THREE.InstancedMesh(new THREE.CylinderGeometry(0.35, 0.5, 4, 8).translate(0, 2, 0), stone, 28), 28, 10, 80, (d) => {
      d.rotation.set(rand(-0.05, 0.05), rand(0, Math.PI * 2), rand(-0.05, 0.05)); d.scale.set(1, rand(0.4, 1.2), 1);
    }, col, () => 0.5));
    fenceRuns(group, col, iron, 14, 10, 80);
    return new Drifters(group, { count: 70, color: 0xd8ff70, size: 0.15 });
  },
};
