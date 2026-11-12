import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rand } from '../utils.js';
import { scatter, tileTexture, Drifters, Flames, _d } from '../world.js';

const HORIZON = 0x1c1230;

// Irregular cobbles: offset rows of varied stones with mossy joints (reads as a path, not floor tiles).
function groundTexture() {
  return tileTexture(512, 125, (g, S) => {
    g.fillStyle = '#1d1824'; g.fillRect(0, 0, S, S);
    const rows = 9, rh = S / rows;
    for (let r = 0; r < rows; r++) {
      let x = (r % 2) * rand(10, 30) - 30;
      while (x < S) {
        const w = rand(34, 70), y = r * rh, l = rand(0, 1), m = rand(3, 6);
        const shade = (v) => Math.round(v + l * 22);
        g.fillStyle = `rgb(${shade(48)}, ${shade(43)}, ${shade(60)})`;
        for (const ox of [0, x + w > S ? -S : null]) {
          if (ox === null) continue;
          g.beginPath(); g.roundRect(x + m + ox, y + m + rand(-2, 2), w - m * 2, rh - m * 2, rand(6, 12)); g.fill();
          g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 3; g.stroke();
          g.fillStyle = 'rgba(255,255,255,0.07)'; g.fillRect(x + m + 4 + ox, y + m + 3, w - m * 2 - 8, 4);
          g.fillStyle = `rgb(${shade(48)}, ${shade(43)}, ${shade(60)})`;
        }
        x += w;
      }
    }
    g.lineWidth = 2;
    for (let i = 0; i < 500; i++) { // moss and weeds in the joints
      const x = rand(0, S), y = Math.floor(rand(0, rows)) * rh + rand(-3, 3);
      g.strokeStyle = `rgba(${Math.round(rand(50, 80))},${Math.round(rand(85, 120))},${Math.round(rand(50, 70))},0.55)`;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + rand(-4, 4), y - rand(3, 8)); g.stroke();
    }
  });
}

// Second ground surface blended in patches: dark mossy earth with grass tufts and pebbles.
function earthTexture() {
  return tileTexture(512, 125, (g, S) => {
    g.fillStyle = '#241e2b'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 70; i++) {
      const x = rand(0, S), y = rand(0, S), r = rand(20, 80), grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, Math.random() < 0.5 ? 'rgba(52,70,44,0.45)' : 'rgba(18,12,24,0.5)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    g.lineWidth = 2;
    for (let i = 0; i < 1300; i++) {
      const x = rand(0, S), y = rand(0, S), l = rand(4, 10);
      g.strokeStyle = `rgba(${Math.round(rand(50, 85))},${Math.round(rand(75, 115))},${Math.round(rand(55, 80))},${rand(0.35, 0.7).toFixed(2)})`;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + rand(-3, 3), y - l); g.stroke();
    }
    for (let i = 0; i < 110; i++) {
      const x = rand(0, S), y = rand(0, S), r = rand(2, 5);
      g.fillStyle = `rgb(${Math.round(rand(60, 85))},${Math.round(rand(55, 75))},${Math.round(rand(75, 100))})`;
      g.beginPath(); g.ellipse(x, y, r * 1.3, r, rand(0, 3), 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.12)'; g.beginPath(); g.ellipse(x - r * 0.3, y - r * 0.3, r * 0.5, r * 0.35, 0, 0, Math.PI * 2); g.fill();
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
      colliders.add({ x1: _d.position.x - Math.cos(dir), z1: _d.position.z - Math.sin(dir), x2: _d.position.x + Math.cos(dir), z2: _d.position.z + Math.sin(dir), r: 0.12, h: 1.3, k: 0.35 });
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
  playerLight: 14,
  groundFog: { color: 0x6a5a9a, opacity: 0.42, height: 0.35 },
  rimLight: { color: 0xa9b8ff, strength: 0.75 },
  bake: { shadow: 0.62, maxLen: 13 },
  nebula: { a: 0x6a2a9a, b: 0x1f4f9f, strength: 0.55 },
  ground: groundTexture,
  groundAlt: earthTexture, groundAltMask: [0.36, 0.54],
  build(group, col, bake) {
    const stone = new THREE.MeshLambertMaterial({ color: 0x4a4458 });
    const iron = new THREE.MeshLambertMaterial({ color: 0x1a1a24 });
    const wood = new THREE.MeshLambertMaterial({ color: 0x1e1722 });
    group.add(scatter(new THREE.InstancedMesh(tombGeometry(), stone, 140), 140, 7, 85, (d) => {
      d.rotation.set(rand(-0.15, 0.15), rand(0, Math.PI * 2), rand(-0.12, 0.12)); d.scale.setScalar(rand(0.8, 1.5));
    }, col, (d) => 0.3 * d.scale.x, (d) => 0.85 * d.scale.y));
    group.add(scatter(new THREE.InstancedMesh(crossGeometry(), stone, 60), 60, 7, 85, (d) => {
      d.rotation.set(rand(-0.2, 0.2), rand(0, Math.PI * 2), rand(-0.15, 0.15)); d.scale.setScalar(rand(0.8, 1.3));
    }, col, (d) => 0.18 * d.scale.x, (d) => 1.2 * d.scale.y, 0.8));
    group.add(scatter(new THREE.InstancedMesh(deadTreeGeometry(), wood, 45), 45, 12, 88, (d) => {
      d.rotation.set(rand(-0.08, 0.08), rand(0, Math.PI * 2), rand(-0.08, 0.08)); d.scale.setScalar(rand(0.9, 1.8));
    }, col, (d) => 0.32 * d.scale.x, (d) => 3.4 * d.scale.y, 0.6));
    group.add(scatter(new THREE.InstancedMesh(new THREE.CylinderGeometry(0.35, 0.5, 4, 8).translate(0, 2, 0), stone, 28), 28, 10, 80, (d) => {
      d.rotation.set(rand(-0.05, 0.05), rand(0, Math.PI * 2), rand(-0.05, 0.05)); d.scale.set(1, rand(0.4, 1.2), 1);
    }, col, () => 0.5, (d) => 4 * d.scale.y));
    fenceRuns(group, col, iron, 14, 10, 80);
    // stone braziers with flickering fire mark out the arena; glows only, no real lights
    const fires = [];
    const pedestal = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.28, 0.4, 1.1, 8).translate(0, 0.55, 0), stone, 18);
    const bowl = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.55, 0.3, 0.35, 10).translate(0, 1.25, 0), iron, 18);
    const coals = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.45, 0.45, 0.06, 10).translate(0, 1.42, 0), new THREE.MeshBasicMaterial({ color: 0xff6a1a }), 18);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + rand(-0.12, 0.12), r = i % 2 ? rand(9, 16) : rand(24, 40);
      _d.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); _d.rotation.set(0, rand(0, 6), 0); _d.scale.setScalar(1); _d.updateMatrix();
      pedestal.setMatrixAt(i, _d.matrix); bowl.setMatrixAt(i, _d.matrix); coals.setMatrixAt(i, _d.matrix);
      col.add({ x: _d.position.x, z: _d.position.z, r: 0.5, h: 1.5 });
      fires.push(new THREE.Vector3(_d.position.x, 1.55, _d.position.z));
      bake.light(_d.position.x, _d.position.z, 8.5, 0xff8a3a, 0.95); // braziers pool warm light on the cobbles
    }
    group.add(pedestal, bowl, coals);
    const flames = new Flames(group, fires, { color: 0xff7a22, size: 1.5 });
    const drift = new Drifters(group, { count: 70, color: 0xd8ff70, size: 0.15 });
    return { update(dt, time, p) { drift.update(dt, time, p); flames.update(time); } };
  },
};
