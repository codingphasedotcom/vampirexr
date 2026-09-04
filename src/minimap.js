import * as THREE from 'three';
import { makeCanvas } from './utils.js';

const SIZE = 256, RANGE = 32; // metres shown from centre to edge
const COLORS = { bat: '#b36bff', ghoul: '#7fd36a', wraith: '#7ff3ff', brute: '#ff4d5a', boss: '#ff2a6d' };

// Circular radar: player at the centre, forward is up, enemies as dots, chests gold, bosses big.
export class Minimap {
  constructor(camera) {
    this.canvas = makeCanvas(SIZE, SIZE);
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.17),
      new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthTest: false, depthWrite: false }));
    this.mesh.renderOrder = 999;
    this.camera = camera;
    this.acc = 1;
    // bottom-right of view, beside the HP panel; the same spot on desktop and in the headset
    this.mesh.position.set(0.46, -0.27, -0.9);
    this.mesh.scale.setScalar(1.15);
    camera.add(this.mesh);
  }

  update(dt, game) {
    this.acc += dt;
    if (this.acc < 0.12) return;
    this.acc = 0;
    const g = this.ctx, c = SIZE / 2, p = game.player.pos;
    game.camera.getWorldDirection(_dir);
    const yaw = Math.atan2(-_dir.x, -_dir.z); // heading, so we can rotate the map forward-up
    g.clearRect(0, 0, SIZE, SIZE);
    g.save();
    g.beginPath(); g.arc(c, c, c - 2, 0, Math.PI * 2); g.clip();
    g.fillStyle = 'rgba(10,6,20,0.72)'; g.fillRect(0, 0, SIZE, SIZE);
    g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 1;
    for (const r of [0.33, 0.66]) { g.beginPath(); g.arc(c, c, c * r, 0, Math.PI * 2); g.stroke(); }
    g.translate(c, c);
    g.rotate(yaw); // world → screen: rotate so the look direction points up
    const k = c / RANGE;
    const dot = (x, z, color, r) => {
      const dx = (x - p.x) * k, dz = (z - p.z) * k;
      if (dx * dx + dz * dz > (c - 4) * (c - 4)) return;
      g.fillStyle = color; g.beginPath(); g.arc(dx, dz, r, 0, Math.PI * 2); g.fill();
    };
    for (const ch of game.chests.list) dot(ch.x, ch.z, '#ffd166', 5);
    for (const e of game.enemies.list) if (!e.t.boss) dot(e.x, e.z, COLORS[e.type] || '#fff', 2.5);
    if (game.boss) dot(game.boss.x, game.boss.z, COLORS.boss, 7);
    g.restore();
    // player arrow (always up)
    g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(c, c - 9); g.lineTo(c - 6, c + 6); g.lineTo(c, c + 2); g.lineTo(c + 6, c + 6); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 3;
    g.beginPath(); g.arc(c, c, c - 2, 0, Math.PI * 2); g.stroke();
    this.tex.needsUpdate = true;
  }
}
const _dir = new THREE.Vector3();
