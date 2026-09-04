import * as THREE from 'three';
import { rand, pick, makeCanvas } from '../utils.js';
import { scatter, tileTexture, Drifters, _d } from '../world.js';
import { glowTexture } from '../fx.js';

const HORIZON = 0x2b1f33;
const ROAD_W = 12, PITCH = 40; // streets every 40 m on both axes

function pavementTexture() {
  return tileTexture(512, 100, (g, S) => {
    g.fillStyle = '#4a4a50'; g.fillRect(0, 0, S, S);
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 3;
    for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * S / 4, 0); g.lineTo(i * S / 4, S); g.moveTo(0, i * S / 4); g.lineTo(S, i * S / 4); g.stroke(); }
    for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? 20 : 120},${Math.random() < 0.5 ? 20 : 120},${Math.random() < 0.5 ? 25 : 130},0.18)`; g.fillRect(rand(0, S), rand(0, S), 2, 2); }
  });
}

function windowTexture() {
  const c = makeCanvas(256, 512), g = c.getContext('2d');
  g.fillStyle = '#1b1c26'; g.fillRect(0, 0, 256, 512);
  const cols = 4, rows = 8, w = 256 / cols, h = 512 / rows;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const lit = Math.random() < 0.45;
    g.fillStyle = lit ? pick(['#ffd98a', '#ffe9b8', '#9fd0ff', '#ffc070']) : '#2a2c3a';
    g.fillRect(x * w + w * 0.2, y * h + h * 0.2, w * 0.6, h * 0.55);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Box with side UVs scaled so windows stay ~3.5 m apart regardless of building size; roof/floor unlit.
function buildingGeometry(w, h, d) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv;
  for (let f = 0; f < 6; f++) {
    const horiz = f < 2 ? d : w, side = f !== 2 && f !== 3;
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      if (side) uv.setXY(i, uv.getX(i) * horiz / 3.5, uv.getY(i) * h / 3.5);
      else uv.setXY(i, 0.02, 0.02); // a dark corner of the texture
    }
  }
  return geo;
}

export const city = {
  id: 'city', name: 'City', desc: 'Neon-lit downtown at night. Streets, towers and parked cars.',
  sky: { top: 0x05060f, horizon: HORIZON },
  fog: { color: 0x1c1622, density: 0.018 },
  hemi: { sky: 0x4a5a8a, ground: 0x1a1620, intensity: 0.9 },
  key: { color: 0xaeb8ff, intensity: 1.2, position: [-60, 80, 40] },
  rim: { color: 0xff9a4a, intensity: 0.4, position: [50, 15, -60] },
  celestial: { position: [-80, 90, -110], radius: 6, color: 0xe6ecff, glow: 0x8090ff, glowSize: 60 },
  stars: true,
  clouds: { color: 0x3a3048, opacity: 0.5, count: 8 },
  bloom: { strength: 0.6, threshold: 0.7 },
  playerLight: 10,
  ground: pavementTexture,
  build(group, col) {
    // roads: a grid of asphalt strips with dashed centre lines
    const asphalt = new THREE.MeshLambertMaterial({ color: 0x232328 });
    const roadGeo = new THREE.PlaneGeometry(300, ROAD_W).rotateX(-Math.PI / 2);
    const dashes = new THREE.InstancedMesh(new THREE.BoxGeometry(2.4, 0.02, 0.18), new THREE.MeshLambertMaterial({ color: 0xffd34d, emissive: 0x6a5010 }), 600);
    let di = 0;
    for (let k = -2; k <= 2; k++) {
      const off = k * PITCH;
      const rx = new THREE.Mesh(roadGeo, asphalt); rx.position.set(0, 0.01, off); group.add(rx);
      const rz = new THREE.Mesh(roadGeo, asphalt); rz.position.set(off, 0.01, 0); rz.rotation.y = Math.PI / 2; group.add(rz);
      for (let s = -148; s <= 148; s += 6) {
        _d.position.set(s, 0.03, off); _d.rotation.set(0, 0, 0); _d.scale.setScalar(1); _d.updateMatrix(); dashes.setMatrixAt(di++, _d.matrix);
        _d.position.set(off, 0.03, s); _d.rotation.set(0, Math.PI / 2, 0); _d.updateMatrix(); dashes.setMatrixAt(di++, _d.matrix);
      }
    }
    dashes.count = di;
    group.add(dashes);

    // buildings fill the blocks between streets; the block around the spawn stays open
    const winTex = windowTexture();
    const bMat = new THREE.MeshLambertMaterial({ map: winTex, emissiveMap: winTex, emissive: 0xffffff, emissiveIntensity: 0.9 });
    const variants = [[10, 14, 10], [14, 26, 12], [12, 40, 12], [16, 20, 16]];
    const meshes = variants.map(([w, h, d]) => new THREE.InstancedMesh(buildingGeometry(w, h, d), bMat, 40));
    const counts = variants.map(() => 0);
    const tint = new THREE.Color();
    const half = (PITCH - ROAD_W) / 2 - 1; // usable half-size of a block
    for (let bx = -2; bx <= 2; bx++) for (let bz = -2; bz <= 2; bz++) {
      if (bx === 0 && bz === 0) continue;
      const cx = bx * PITCH, cz = bz * PITCH;
      const n = 1 + Math.floor(rand(0, 3));
      for (let i = 0; i < n; i++) {
        const vi = Math.floor(rand(0, variants.length)), [w, h, d] = variants[vi];
        if (counts[vi] >= 40) continue;
        const x = cx + rand(-half + w / 2, half - w / 2), z = cz + rand(-half + d / 2, half - d / 2);
        if (Math.hypot(x, z) < 22) continue;
        _d.position.set(x, h / 2, z); _d.rotation.set(0, 0, 0); _d.scale.setScalar(1); _d.updateMatrix();
        meshes[vi].setMatrixAt(counts[vi], _d.matrix);
        meshes[vi].setColorAt(counts[vi], tint.setHSL(rand(0.55, 0.7), rand(0.05, 0.25), rand(0.5, 0.9)));
        counts[vi]++;
        col.addBox(x, z, w / 2 + 0.3, d / 2 + 0.3, 0.2);
      }
    }
    meshes.forEach((m, i) => { m.count = counts[i]; group.add(m); });

    // street lamps along every road, with one Points draw for all their glows
    const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.09, 4.6, 8).translate(0, 2.3, 0), new THREE.MeshLambertMaterial({ color: 0x2a2a30 }), 200);
    const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.18, 0.3), new THREE.MeshLambertMaterial({ color: 0xfff1c0, emissive: 0xffe4a0, emissiveIntensity: 1.2 }), 200);
    const glowPos = [];
    let li = 0;
    for (let k = -2; k <= 2; k++) for (let s = -140; s <= 140; s += 16) for (const side of [-1, 1]) {
      if (li >= 198) break;
      for (const [x, z] of [[s, k * PITCH + side * (ROAD_W / 2 + 1)], [k * PITCH + side * (ROAD_W / 2 + 1), s]]) {
        _d.position.set(x, 0, z); _d.rotation.set(0, 0, 0); _d.scale.setScalar(1); _d.updateMatrix(); poles.setMatrixAt(li, _d.matrix);
        _d.position.set(x, 4.6, z); _d.updateMatrix(); heads.setMatrixAt(li, _d.matrix);
        glowPos.push(x, 4.5, z);
        col.add({ x, z, r: 0.2 });
        li++;
      }
    }
    poles.count = heads.count = li;
    group.add(poles, heads);
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(glowPos), 3));
    const lampGlow = new THREE.Points(gg, new THREE.PointsMaterial({ map: glowTexture(), color: 0xffd28a, size: 3.5, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
    lampGlow.frustumCulled = false;
    group.add(lampGlow);

    // parked cars and dumpsters at the kerbs
    const bodies = new THREE.InstancedMesh(new THREE.BoxGeometry(1.9, 0.6, 4.4).translate(0, 0.6, 0), new THREE.MeshLambertMaterial({ color: 0xffffff }), 16);
    const cabins = new THREE.InstancedMesh(new THREE.BoxGeometry(1.7, 0.6, 2.2).translate(0, 1.2, -0.2), new THREE.MeshLambertMaterial({ color: 0x2a2f3a }), 16);
    const wheels = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.34, 0.34, 0.25, 10).rotateZ(Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x111111 }), 64);
    const carColors = [0xc0392b, 0x2980b9, 0xecf0f1, 0x2c3e50, 0xf1c40f, 0x7f8c8d];
    for (let i = 0; i < 16; i++) {
      const k = Math.floor(rand(-2, 3)), along = rand(-130, 130), side = pick([-1, 1]), axis = Math.random() < 0.5;
      const x = axis ? along : k * PITCH + side * (ROAD_W / 2 - 1.4), z = axis ? k * PITCH + side * (ROAD_W / 2 - 1.4) : along;
      if (Math.hypot(x, z) < 14) continue;
      const yaw = axis ? Math.PI / 2 : 0;
      _d.position.set(x, 0, z); _d.rotation.set(0, yaw, 0); _d.scale.setScalar(1); _d.updateMatrix();
      bodies.setMatrixAt(i, _d.matrix); cabins.setMatrixAt(i, _d.matrix);
      bodies.setColorAt(i, tint.set(pick(carColors)));
      for (let wI = 0; wI < 4; wI++) {
        const lx = (wI % 2 ? 1 : -1) * 0.95, lz = (wI < 2 ? 1 : -1) * 1.4;
        _d.position.set(x + lx * Math.cos(yaw) + lz * Math.sin(yaw), 0.34, z - lx * Math.sin(yaw) + lz * Math.cos(yaw)); _d.updateMatrix();
        wheels.setMatrixAt(i * 4 + wI, _d.matrix);
      }
      col.addBox(x, z, axis ? 2.3 : 1.1, axis ? 1.1 : 2.3, 0.15);
    }
    group.add(bodies, cabins, wheels);
    group.add(scatter(new THREE.InstancedMesh(new THREE.BoxGeometry(1.8, 1.3, 1.0).translate(0, 0.65, 0), new THREE.MeshLambertMaterial({ color: 0x2f5a3a }), 14), 14, 16, 85,
      (d) => { d.rotation.set(0, rand(0, 6.28), 0); }, col, () => 1.0));
    return new Drifters(group, { count: 50, color: 0x9a9aa0, size: 0.08, opacity: 0.35, minY: 0.5, maxY: 4, speed: 0.4 });
  },
};
