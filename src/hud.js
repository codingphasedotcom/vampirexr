import * as THREE from 'three';
import { makeCanvas, roundRect, fmtTime } from './utils.js';
import { MAX_LEVEL } from './player.js';

const W = 512, H = 184, BOSS_ROW = 40; // the top row is only used while a boss is alive

// Camera-attached HUD panel (works identically on desktop and in the headset) plus a red hurt vignette.
export class Hud {
  constructor(camera) {
    this.canvas = makeCanvas(W, H);
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.5 * H / W),
      new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthTest: false, depthWrite: false }),
    );
    this.mesh.position.set(0, -0.33, -0.9);
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
  toast(text, seconds = 2.5) { this.toastText = text; this.toastTimer = seconds; }

  update(dt, player, time, boss) {
    this.flash = Math.max(0, this.flash - dt * 1.2);
    this.vignette.material.opacity = this.flash;
    this.toastTimer -= dt;
    this.acc += dt;
    if (this.acc < 0.1) return;
    this.acc = 0;
    this.draw(player, time, boss);
  }

  draw(p, time, boss) {
    const g = this.ctx;
    g.clearRect(0, 0, W, H);
    const top = boss ? 0 : BOSS_ROW;
    g.fillStyle = 'rgba(0,0,0,0.5)';
    roundRect(g, 0, top, W, H - top, 18); g.fill();
    g.textBaseline = 'middle';

    if (boss) {
      g.fillStyle = '#2a1030'; roundRect(g, 16, 10, 480, 22, 6); g.fill();
      g.fillStyle = '#c14dff'; roundRect(g, 16, 10, 480 * Math.max(0, boss.hp / boss.maxHp), 22, 6); g.fill();
      g.fillStyle = '#fff'; g.font = 'bold 17px system-ui, sans-serif'; g.textAlign = 'center';
      g.fillText(`☠ ${boss.t.name.toUpperCase()} ☠`, 256, 21);
    }

    const oy = BOSS_ROW;
    // HP
    g.fillStyle = '#3a0d14'; roundRect(g, 16, oy + 14, 480, 26, 6); g.fill();
    g.fillStyle = '#e63946'; roundRect(g, 16, oy + 14, 480 * Math.max(0, p.hp / p.maxHp), 26, 6); g.fill();
    g.fillStyle = '#fff'; g.font = 'bold 19px system-ui, sans-serif'; g.textAlign = 'center';
    g.fillText(`HP ${Math.ceil(p.hp)} / ${p.maxHp}`, 256, oy + 27);

    // XP
    const maxed = p.level >= MAX_LEVEL;
    g.fillStyle = '#141a33'; roundRect(g, 16, oy + 50, 480, 14, 5); g.fill();
    g.fillStyle = maxed ? '#ffd166' : '#6a8dff'; roundRect(g, 16, oy + 50, 480 * (maxed ? 1 : Math.min(1, p.xp / p.xpToNext)), 14, 5); g.fill();

    g.font = 'bold 32px system-ui, sans-serif';
    if (this.toastTimer > 0) {
      g.fillStyle = '#ffd166';
      if (g.measureText(this.toastText).width > 480) g.font = 'bold 22px system-ui, sans-serif';
      g.fillText(this.toastText, 256, oy + 106);
    } else {
      g.fillStyle = '#fff';
      g.textAlign = 'left'; g.fillText(maxed ? `LV ${p.level} MAX` : `LV ${p.level}`, 20, oy + 106);
      g.textAlign = 'center'; g.fillText(fmtTime(time), 256, oy + 106);
      g.textAlign = 'right'; g.fillText(`☠ ${p.kills}`, 492, oy + 106);
    }
    this.tex.needsUpdate = true;
  }
}
