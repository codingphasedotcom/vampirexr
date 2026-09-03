import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rand, makeCanvas } from './utils.js';
import { glowTexture } from './fx.js';

const HORIZON = 0x1c1230, ZENITH = 0x04020a;
const _d = new THREE.Object3D();

function groundTexture() {
  const S = 512, c = makeCanvas(S, S), g = c.getContext('2d');
  g.fillStyle = '#2a2233'; g.fillRect(0, 0, S, S);
  // cobblestones on a jittered grid; kept inside cells so the tile stays seamless
  const N = 8, cell = S / N;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (Math.random() < 0.2) { // missing stone: dirt + a tuft of dead grass
      g.strokeStyle = '#3c5a38'; g.lineWidth = 2;
      for (let k = 0; k < 6; k++) {
        const bx = x * cell + rand(10, cell - 10), by = y * cell + rand(10, cell - 10);
        g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + rand(-6, 6), by - rand(6, 14)); g.stroke();
      }
      continue;
    }
    const m = rand(4, 9), w = cell - m * 2 - rand(0, 8), h = cell - m * 2 - rand(0, 8);
    const px = x * cell + m + rand(0, 4), py = y * cell + m + rand(0, 4);
    const l = rand(0, 1);
    g.fillStyle = `rgb(${Math.round(52 + l * 20)}, ${Math.round(46 + l * 16)}, ${Math.round(66 + l * 22)})`;
    g.beginPath(); g.roundRect(px, py, w, h, 6); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 3; g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(px + 3, py + 3, w - 6, 4); // top highlight
    if (Math.random() < 0.3) { // crack
      g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(px + rand(4, w - 4), py + 4);
      g.lineTo(px + rand(4, w - 4), py + h / 2); g.lineTo(px + rand(4, w - 4), py + h - 4); g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(125, 125);
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

function treeGeometry() {
  const parts = [new THREE.CylinderGeometry(0.14, 0.32, 3.2, 7).translate(0, 1.6, 0)];
  const n = 4 + Math.floor(rand(0, 3));
  for (let i = 0; i < n; i++) {
    const len = rand(1.2, 2.2), a = (i / n) * Math.PI * 2 + rand(-0.4, 0.4);
    const b = new THREE.CylinderGeometry(0.03, 0.1, len, 5).translate(0, len / 2, 0)
      .rotateZ(rand(0.6, 1.2)).rotateY(a).translate(0, rand(1.8, 3.1), 0);
    parts.push(b);
    const sl = len * 0.5;
    parts.push(new THREE.CylinderGeometry(0.015, 0.05, sl, 4).translate(0, sl / 2, 0)
      .rotateZ(rand(0.8, 1.6)).rotateY(a + rand(-0.8, 0.8)).translate(Math.sin(a) * len * 0.5, rand(2.4, 3.6), Math.cos(a) * len * 0.5));
  }
  return mergeGeometries(parts);
}

function fenceGeometry() {
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

function tombGeometry() {
  return mergeGeometries([
    new THREE.BoxGeometry(0.5, 0.7, 0.14).translate(0, 0.35, 0),
    new THREE.CylinderGeometry(0.25, 0.25, 0.14, 12).rotateX(Math.PI / 2).translate(0, 0.7, 0),
  ]);
}

function crossGeometry() {
  return mergeGeometries([
    new THREE.BoxGeometry(0.12, 1.2, 0.12).translate(0, 0.6, 0),
    new THREE.BoxGeometry(0.6, 0.12, 0.12).translate(0, 0.9, 0),
  ]);
}

function scatter(mesh, count, rMin, rMax, place) {
  for (let i = 0; i < count; i++) {
    const a = rand(0, Math.PI * 2), r = rand(rMin, rMax);
    _d.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    _d.rotation.set(0, 0, 0); _d.scale.setScalar(1);
    place(_d, i);
    _d.updateMatrix();
    mesh.setMatrixAt(i, _d.matrix);
  }
  return mesh;
}

// Static scenery + slow ambient motion (clouds, fireflies).
export class World {
  constructor(scene) {
    scene.fog = new THREE.FogExp2(HORIZON, 0.022);
    scene.background = null;

    // sky dome: vertical gradient, rendered first behind everything
    const sky = new THREE.Mesh(new THREE.SphereGeometry(280, 32, 16), new THREE.ShaderMaterial({
      uniforms: { uTop: { value: new THREE.Color(ZENITH) }, uHorizon: { value: new THREE.Color(HORIZON) } },
      vertexShader: 'varying vec3 vW; void main(){ vW = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 uTop, uHorizon; varying vec3 vW;
        void main(){ float h = normalize(vW).y; gl_FragColor = vec4(mix(uHorizon, uTop, smoothstep(-0.02, 0.45, h)), 1.0);
        #include <colorspace_fragment> }`,
      side: THREE.BackSide, depthWrite: false, fog: false,
    }));
    sky.renderOrder = -2;
    sky.frustumCulled = false;
    scene.add(sky);

    scene.add(new THREE.HemisphereLight(0x6a70ff, 0x2a1a20, 1.1));
    const moonPos = new THREE.Vector3(60, 70, -120);
    const moonLight = new THREE.DirectionalLight(0xc0ccff, 1.7);
    moonLight.position.copy(moonPos);
    scene.add(moonLight);
    const rim = new THREE.DirectionalLight(0xff7a5a, 0.35);
    rim.position.set(-50, 10, 60);
    scene.add(rim);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ map: groundTexture() }));
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    const moon = new THREE.Mesh(new THREE.SphereGeometry(7, 24, 16), new THREE.MeshBasicMaterial({ color: 0xe6ecff, fog: false }));
    moon.position.copy(moonPos);
    scene.add(moon);
    const moonGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0x7f8cff, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0.9 }));
    moonGlow.position.copy(moonPos);
    moonGlow.scale.setScalar(70);
    scene.add(moonGlow);

    const N = 1500, pos = new Float32Array(N * 3), v = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      v.randomDirection();
      if (v.y < 0.05) v.y = -v.y + 0.05;
      v.multiplyScalar(250);
      pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.1, fog: false, transparent: true, opacity: 0.9 }));
    stars.renderOrder = -1;
    scene.add(stars);

    this.clouds = [];
    const cloudMat = new THREE.SpriteMaterial({ map: cloudTexture(), color: 0x5a4a80, transparent: true, opacity: 0.5, depthWrite: false, fog: false });
    for (let i = 0; i < 10; i++) {
      const s = new THREE.Sprite(cloudMat);
      const a = rand(0, Math.PI * 2), r = rand(120, 230);
      s.position.set(Math.cos(a) * r, rand(45, 95), Math.sin(a) * r);
      s.scale.set(rand(70, 120), rand(30, 50), 1);
      scene.add(s);
      this.clouds.push(s);
    }

    const stone = new THREE.MeshLambertMaterial({ color: 0x4a4458 });
    const iron = new THREE.MeshLambertMaterial({ color: 0x1a1a24 });
    const wood = new THREE.MeshLambertMaterial({ color: 0x1e1722 });

    scene.add(scatter(new THREE.InstancedMesh(tombGeometry(), stone, 140), 140, 7, 85, (d) => {
      d.rotation.set(rand(-0.15, 0.15), rand(0, Math.PI * 2), rand(-0.12, 0.12)); d.scale.setScalar(rand(0.8, 1.5));
    }));
    scene.add(scatter(new THREE.InstancedMesh(crossGeometry(), stone, 60), 60, 7, 85, (d) => {
      d.rotation.set(rand(-0.2, 0.2), rand(0, Math.PI * 2), rand(-0.15, 0.15)); d.scale.setScalar(rand(0.8, 1.3));
    }));
    scene.add(scatter(new THREE.InstancedMesh(treeGeometry(), wood, 45), 45, 12, 88, (d) => {
      d.rotation.set(rand(-0.08, 0.08), rand(0, Math.PI * 2), rand(-0.08, 0.08)); d.scale.setScalar(rand(0.9, 1.8));
    }));
    scene.add(scatter(new THREE.InstancedMesh(new THREE.CylinderGeometry(0.35, 0.5, 4, 8).translate(0, 2, 0), stone, 28), 28, 10, 80, (d) => {
      d.rotation.set(rand(-0.05, 0.05), rand(0, Math.PI * 2), rand(-0.05, 0.05)); d.scale.set(1, rand(0.4, 1.2), 1);
    }));

    // fence runs: a few straight lines of segments
    const fence = new THREE.InstancedMesh(fenceGeometry(), iron, 90);
    let fi = 0;
    for (let run = 0; run < 14 && fi < 90; run++) {
      const a = rand(0, Math.PI * 2), r = rand(10, 80), dir = rand(0, Math.PI * 2), n = 3 + Math.floor(rand(0, 5));
      const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
      for (let k = 0; k < n && fi < 90; k++) {
        _d.position.set(cx + Math.cos(dir) * (k - n / 2) * 2, 0, cz + Math.sin(dir) * (k - n / 2) * 2);
        _d.rotation.set(0, -dir, 0); _d.scale.setScalar(1);
        _d.updateMatrix();
        fence.setMatrixAt(fi++, _d.matrix);
      }
    }
    fence.count = fi;
    scene.add(fence);

    // fireflies drift around the player
    const F = 70;
    this.ffBase = new Float32Array(F * 3);
    this.ffPos = new Float32Array(F * 3);
    this.ffPhase = new Float32Array(F);
    for (let i = 0; i < F; i++) {
      const a = rand(0, Math.PI * 2), r = rand(3, 26);
      this.ffBase[i * 3] = Math.cos(a) * r; this.ffBase[i * 3 + 1] = rand(0.4, 2.6); this.ffBase[i * 3 + 2] = Math.sin(a) * r;
      this.ffPhase[i] = rand(0, 100);
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(this.ffPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.fireflies = new THREE.Points(fg, new THREE.PointsMaterial({
      map: glowTexture(), color: 0xd8ff70, size: 0.15, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.fireflies.frustumCulled = false;
    scene.add(this.fireflies);
  }

  update(dt, time, playerPos) {
    for (const c of this.clouds) {
      c.position.x += dt * 1.2;
      if (c.position.x > 260) c.position.x = -260;
    }
    this.fireflies.position.lerp(playerPos, dt * 0.5);
    const b = this.ffBase, p = this.ffPos, ph = this.ffPhase;
    for (let i = 0; i < ph.length; i++) {
      p[i * 3] = b[i * 3] + Math.sin(time * 0.7 + ph[i]) * 1.5;
      p[i * 3 + 1] = b[i * 3 + 1] + Math.sin(time * 1.3 + ph[i] * 2.0) * 0.4;
      p[i * 3 + 2] = b[i * 3 + 2] + Math.cos(time * 0.5 + ph[i]) * 1.5;
    }
    this.fireflies.geometry.attributes.position.needsUpdate = true;
  }
}
