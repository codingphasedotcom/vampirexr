import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rand, pick } from '../utils.js';
import { scatter, tileTexture, Drifters, _d } from '../world.js';
import { fenceRuns } from './graveyard.js';

const HORIZON = 0xc9e2ff;

function grassTexture() {
  return tileTexture(512, 110, (g, S) => {
    g.fillStyle = '#4f7a34'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 60; i++) { // soft patches
      const x = rand(0, S), y = rand(0, S), r = rand(20, 70);
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      const dark = Math.random() < 0.5;
      grad.addColorStop(0, dark ? 'rgba(40,80,30,0.5)' : 'rgba(120,170,70,0.4)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    g.lineWidth = 2;
    for (let i = 0; i < 900; i++) { // blades
      const x = rand(0, S), y = rand(0, S), l = rand(5, 12);
      g.strokeStyle = `rgba(${Math.round(rand(80, 150))},${Math.round(rand(150, 200))},${Math.round(rand(50, 90))},0.7)`;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + rand(-3, 3), y - l); g.stroke();
    }
    for (let i = 0; i < 40; i++) { // flowers
      g.fillStyle = pick(['#fff5d0', '#ffd34d', '#ff9ac2', '#ffffff']);
      g.beginPath(); g.arc(rand(0, S), rand(0, S), rand(2, 3.5), 0, Math.PI * 2); g.fill();
    }
  });
}

function leafyTree() {
  const trunk = new THREE.CylinderGeometry(0.18, 0.28, 2.4, 7).translate(0, 1.2, 0);
  const canopy = mergeGeometries([
    new THREE.IcosahedronGeometry(1.6, 1).translate(0, 3.3, 0),
    new THREE.IcosahedronGeometry(1.2, 1).translate(0.9, 2.7, 0.4),
    new THREE.IcosahedronGeometry(1.1, 1).translate(-0.8, 2.9, -0.5),
    new THREE.IcosahedronGeometry(1.0, 1).translate(0.2, 4.2, -0.3),
  ]);
  return { trunk, canopy };
}

// Cottage parts are instanced by type; each house is a wall box, a pyramid roof, a chimney, a door and a few windows.
function buildHouses(group, col, count) {
  const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), count);
  const roofs = new THREE.InstancedMesh(new THREE.ConeGeometry(0.72, 1, 4).rotateY(Math.PI / 4), new THREE.MeshLambertMaterial({ color: 0xffffff }), count);
  const chimneys = new THREE.InstancedMesh(new THREE.BoxGeometry(0.6, 1.4, 0.6), new THREE.MeshLambertMaterial({ color: 0x6b5a50 }), count);
  const doors = new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, 2.1, 0.12), new THREE.MeshLambertMaterial({ color: 0x4a2f1a }), count);
  const windows = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 1.0, 0.1), new THREE.MeshLambertMaterial({ color: 0x9fd8ff, emissive: 0x2a4a60 }), count * 4);
  const wallColors = [0xf3e9d2, 0xffffff, 0xf7e3a8, 0xd9e8f5, 0xf2d3c9];
  const roofColors = [0x8a3b2f, 0x5a4636, 0x3f5a8a, 0x7a5a2a];
  const c = new THREE.Color();
  let wi = 0;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rand(-0.2, 0.2), r = rand(18, 78);
    const x = Math.cos(a) * r, z = Math.sin(a) * r, yaw = rand(0, Math.PI * 2);
    const w = rand(6, 10), h = rand(3.2, 4.2), dpt = rand(5, 8);
    _d.position.set(x, h / 2, z); _d.rotation.set(0, yaw, 0); _d.scale.set(w, h, dpt); _d.updateMatrix();
    walls.setMatrixAt(i, _d.matrix); walls.setColorAt(i, c.set(pick(wallColors)));
    const rh = rand(2.2, 3.4), rs = Math.max(w, dpt) * 1.15;
    _d.position.set(x, h + rh / 2, z); _d.scale.set(rs, rh, rs); _d.updateMatrix();
    roofs.setMatrixAt(i, _d.matrix); roofs.setColorAt(i, c.set(pick(roofColors)));
    _d.position.set(x + Math.cos(yaw) * w * 0.25, h + rh * 0.55, z - Math.sin(yaw) * w * 0.25); _d.scale.setScalar(1); _d.updateMatrix();
    chimneys.setMatrixAt(i, _d.matrix);
    // door and windows sit on the +z face (local), pushed just outside the wall
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    _d.position.set(x + fx * (dpt / 2 + 0.07), 1.05, z + fz * (dpt / 2 + 0.07)); _d.updateMatrix();
    doors.setMatrixAt(i, _d.matrix);
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    for (const side of [-1, 1]) {
      _d.position.set(x + fx * (dpt / 2 + 0.06) + rx * side * w * 0.3, 2.0, z + fz * (dpt / 2 + 0.06) + rz * side * w * 0.3); _d.updateMatrix();
      windows.setMatrixAt(wi++, _d.matrix);
      _d.position.set(x - fx * (dpt / 2 + 0.06) + rx * side * w * 0.3, 2.0, z - fz * (dpt / 2 + 0.06) + rz * side * w * 0.3); _d.updateMatrix();
      windows.setMatrixAt(wi++, _d.matrix);
    }
    // collider: rotated rectangle as four wall segments
    const hx = w / 2 + 0.25, hz = dpt / 2 + 0.25;
    const corners = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].map(([cx, cz]) => [x + cx * rx + cz * fx, z + cx * rz + cz * fz]);
    for (let k = 0; k < 4; k++) { const p = corners[k], q = corners[(k + 1) % 4]; col.add({ x1: p[0], z1: p[1], x2: q[0], z2: q[1], r: 0.15 }); }
  }
  windows.count = wi;
  group.add(walls, roofs, chimneys, doors, windows);
}

export const village = {
  id: 'village', name: 'Village', desc: 'A sunny farming village. Cottages, hay bales and orchards.',
  sky: { top: 0x3f7fd8, horizon: HORIZON },
  fog: { color: HORIZON, density: 0.011 },
  hemi: { sky: 0xbfdfff, ground: 0x5a6a3a, intensity: 1.3 },
  key: { color: 0xfff2d6, intensity: 2.4, position: [60, 90, 30] },
  rim: { color: 0xffe8c0, intensity: 0.3, position: [-40, 20, -60] },
  celestial: { position: [120, 170, 60], radius: 8, color: 0xfff8e6, glow: 0xfff0c0, glowSize: 110, glowOpacity: 0.7 },
  stars: false,
  clouds: { color: 0xffffff, opacity: 0.85, count: 14 },
  bloom: { strength: 0.25, threshold: 0.95 },
  playerLight: 0,
  ground: grassTexture,
  build(group, col) {
    buildHouses(group, col, 22);
    const { trunk, canopy } = leafyTree();
    const trunks = new THREE.InstancedMesh(trunk, new THREE.MeshLambertMaterial({ color: 0x5a3d26 }), 60);
    const canopies = new THREE.InstancedMesh(canopy, new THREE.MeshLambertMaterial({ color: 0x3f8a3a, flatShading: true }), 60);
    const c = new THREE.Color();
    for (let i = 0; i < 60; i++) {
      const a = rand(0, Math.PI * 2), r = rand(14, 86), s = rand(0.8, 1.6);
      _d.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); _d.rotation.set(0, rand(0, 6.28), 0); _d.scale.setScalar(s); _d.updateMatrix();
      trunks.setMatrixAt(i, _d.matrix); canopies.setMatrixAt(i, _d.matrix);
      canopies.setColorAt(i, c.setHSL(0.28 + rand(-0.04, 0.04), 0.55, rand(0.32, 0.45)));
      col.add({ x: _d.position.x, z: _d.position.z, r: 0.35 * s });
    }
    group.add(trunks, canopies);
    fenceRuns(group, col, new THREE.MeshLambertMaterial({ color: 0x8a6a3a }), 12, 12, 80);
    group.add(scatter(new THREE.InstancedMesh(new THREE.CylinderGeometry(0.8, 0.8, 1.4, 12).rotateZ(Math.PI / 2).translate(0, 0.8, 0),
      new THREE.MeshLambertMaterial({ color: 0xd9b45a }), 20), 20, 10, 80, (d) => { d.rotation.set(0, rand(0, 6.28), 0); }, col, () => 0.85));
    group.add(scatter(new THREE.InstancedMesh(new THREE.CylinderGeometry(0.42, 0.38, 1.0, 10).translate(0, 0.5, 0),
      new THREE.MeshLambertMaterial({ color: 0x6b4a2a }), 25), 25, 8, 80, (d) => { d.rotation.set(0, rand(0, 6.28), 0); }, col, () => 0.45));
    group.add(scatter(new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
      new THREE.MeshLambertMaterial({ color: 0xb08a55 }), 25), 25, 8, 80, (d) => { d.rotation.set(0, rand(0, 6.28), 0); d.scale.setScalar(rand(0.7, 1.2)); }, col, (d) => 0.7 * d.scale.x));
    // the village well
    const well = new THREE.Group();
    well.add(new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 1.0, 14).translate(0, 0.5, 0), new THREE.MeshLambertMaterial({ color: 0x8a8a8a })));
    for (const s of [-1, 1]) well.add(new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.4, 0.15).translate(s * 0.9, 1.2, 0), new THREE.MeshLambertMaterial({ color: 0x5a3d26 })));
    well.add(new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.8, 4).rotateY(Math.PI / 4).translate(0, 2.8, 0), new THREE.MeshLambertMaterial({ color: 0x8a3b2f })));
    well.position.set(12, 0, -8);
    group.add(well);
    col.add({ x: 12, z: -8, r: 1.3 });
    return new Drifters(group, { count: 60, color: 0xffffcc, size: 0.1, opacity: 0.5, minY: 0.3, maxY: 3.2, speed: 0.6 });
  },
};
