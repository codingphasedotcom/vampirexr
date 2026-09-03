import * as THREE from 'three';
import { makeCanvas, roundRect, fmtTime } from './utils.js';

// Camera-attached HUD panel (works identically on desktop and in the headset) plus a red hurt vignette.
export class Hud {
  constructor(camera) {
    this.canvas = makeCanvas(512, 144);
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.5 * 144 / 512),
      new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthTest: false, depthWrite: false }),
    );
    this.mesh.position.set(0, -0.34, -0.9);
    this.mesh.renderOrder = 999;
    camera.add(this.mesh);

    this.vignette = new THREE.Mesh(
      new THREE.PlaneGeometry(6, 6),
      new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0, depthTest: false, depthWrite: false }),
    );
    this.vignette.position.z = -1;
    this.vignette.renderOrder = 998;
    camera.add(this.vignette);

    this.acc = 1;
    this.flash = 0;
    this.toastText = '';
    this.toastTimer = 0;
  }

  hurt() { this.flash = Math.min(0.55, this.flash + 0.28); }
  toast(text) { this.toastText = text; this.toastTimer = 2.5; }

  update(dt, player, time) {
    this.flash = Math.max(0, this.flash - dt * 1.2);
    this.vignette.material.opacity = this.flash;
    this.toastTimer -= dt;
    this.acc += dt;
    if (this.acc < 0.1) return;
    this.acc = 0;
    this.draw(player, time);
  }

  draw(p, time) {
    const g = this.ctx;
    g.clearRect(0, 0, 512, 144);
    g.fillStyle = 'rgba(0,0,0,0.5)';
    roundRect(g, 0, 0, 512, 144, 18); g.fill();

    // HP
    g.fillStyle = '#3a0d14'; roundRect(g, 16, 14, 480, 26, 6); g.fill();
    g.fillStyle = '#e63946'; roundRect(g, 16, 14, 480 * Math.max(0, p.hp / p.maxHp), 26, 6); g.fill();
    g.fillStyle = '#fff'; g.font = 'bold 19px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(`HP ${Math.ceil(p.hp)} / ${p.maxHp}`, 256, 27);

    // XP
    g.fillStyle = '#141a33'; roundRect(g, 16, 50, 480, 14, 5); g.fill();
    g.fillStyle = '#6a8dff'; roundRect(g, 16, 50, 480 * Math.min(1, p.xp / p.xpToNext), 14, 5); g.fill();

    g.font = 'bold 32px system-ui, sans-serif';
    if (this.toastTimer > 0) {
      g.fillStyle = '#ffd166';
      g.fillText(this.toastText, 256, 106);
    } else {
      g.fillStyle = '#fff';
      g.textAlign = 'left'; g.fillText(`LV ${p.level}`, 20, 106);
      g.textAlign = 'center'; g.fillText(fmtTime(time), 256, 106);
      g.textAlign = 'right'; g.fillText(`☠ ${p.kills}`, 492, 106);
    }
    this.tex.needsUpdate = true;
  }
}
