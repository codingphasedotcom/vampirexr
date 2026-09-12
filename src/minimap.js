import * as THREE from 'three';
import { makeCanvas } from './utils.js';

const SIZE = 256, RANGE = 32; // metres shown from centre to edge
export const radarHeading = direction => Math.atan2(-direction.x, -direction.z);

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
    // Top-right; desktop positioning follows the actual aspect ratio. XR uses a comfortable fixed angular offset.
    this.mesh.position.set(0.4, 0.28, -0.9);
    this.mesh.scale.setScalar(1.15);
    camera.add(this.mesh);
  }

  update(dt, game) {
    const xr = game.renderer.xr.isPresenting;
    if (xr) this.mesh.position.set(0.4, 0.28, -0.9);
    else {
      const halfHeight = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * 0.9;
      this.mesh.position.set(halfHeight * this.camera.aspect - 0.13, halfHeight - 0.13, -0.9);
    }
    this.acc += dt;
    if (this.acc < 0.12) return;
    this.acc = 0;
    const g = this.ctx, c = SIZE / 2, p = game.player.pos;
    game.camera.getWorldDirection(_dir);
    const yaw = radarHeading(_dir); // heading, so we can rotate the map forward-up
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
    if (game.siege) {
      g.strokeStyle = '#a59abf'; g.lineWidth = 2;
      for (const wall of game.world.colliders.all) {
        if (wall.x1 === undefined || wall.disabled) continue;
        g.beginPath(); g.moveTo((wall.x1-p.x)*k,(wall.z1-p.z)*k); g.lineTo((wall.x2-p.x)*k,(wall.z2-p.z)*k); g.stroke();
      }
      dot(0, game.siege.room.z - 11, game.siege.cleared ? '#5affbc' : '#ff587d', 6);
    }
    for (const ch of game.chests.list) dot(ch.x, ch.z, '#ffd166', 5);
    for (const e of game.enemies.list) if (!e.dead && !e.t.boss) dot(e.x, e.z, COLORS[e.type] || '#fff', 2.5);
    for (const gem of game.gems.list) if (gem.heal) dot(gem.x, gem.z, '#ff5268', 3.5);
    if (game.boss && !game.boss.dead) dot(game.boss.x, game.boss.z, COLORS.boss, 7);
    g.restore();
    g.fillStyle = '#d6e4ff'; g.font = 'bold 15px system-ui'; g.textAlign = 'center';
    g.fillText('FRONT', c, 22);
    // player arrow (always up)
    g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(c, c - 9); g.lineTo(c - 6, c + 6); g.lineTo(c, c + 2); g.lineTo(c + 6, c + 6); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 3;
    g.beginPath(); g.arc(c, c, c - 2, 0, Math.PI * 2); g.stroke();
    this.tex.needsUpdate = true;
  }
}
const _dir = new THREE.Vector3();
