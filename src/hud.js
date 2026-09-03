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

    // Comfort vignette: darkens the periphery while moving/turning in VR to reduce motion sickness.
    const vc = makeCanvas(256, 256), vg = vc.getContext('2d');
    const grad = vg.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(0.32, 'rgba(0,0,0,0)'); grad.addColorStop(0.6, 'rgba(0,0,0,1)'); grad.addColorStop(1, 'rgba(0,0,0,1)');
    vg.fillStyle = grad; vg.fillRect(0, 0, 256, 256);
    this.comfort = new THREE.Mesh(new THREE.PlaneGeometry(3, 3),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(vc), transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
    this.comfort.position.z = -0.7;
    this.comfort.renderOrder = 997;
    camera.add(this.comfort);
    this.comfortTarget = 0;

    // Wrist mode: the main panel floats above the off-hand; this strip keeps boss HP + toasts in view.
    this.alertCanvas = makeCanvas(512, 96);
    this.alertCtx = this.alertCanvas.getContext('2d');
    this.alertTex = new THREE.CanvasTexture(this.alertCanvas);
    this.alertTex.colorSpace = THREE.SRGBColorSpace;
    this.alerts = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4 * 96 / 512),
      new THREE.MeshBasicMaterial({ map: this.alertTex, transparent: true, depthTest: false, depthWrite: false }));
    this.alerts.position.set(0, -0.3, -0.9);
    this.alerts.renderOrder = 999;
    this.alerts.visible = false;
    camera.add(this.alerts);

    this.anchor = new THREE.Group(); // world-space wrist anchor, positioned by the game each frame
    this.camera = camera;
    this.mode = 'camera';

    this.acc = 1;
    this.flash = 0;
    this.toastText = '';
    this.toastTimer = 0;
  }

  hurt() { this.flash = Math.min(0.55, this.flash + 0.28); }
  setComfort(v) { this.comfortTarget = v; }

  // 'camera' = fixed at the bottom of view; 'wrist' = floating panel above the off-hand (VR only).
  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.mesh.parent?.remove(this.mesh);
    if (mode === 'wrist') {
      this.anchor.add(this.mesh);
      this.mesh.position.set(0, 0, 0);
      this.mesh.scale.setScalar(0.6);
    } else {
      this.camera.add(this.mesh);
      this.mesh.position.set(0, -0.33, -0.9);
      this.mesh.scale.setScalar(1);
    }
    this.alerts.visible = mode === 'wrist';
  }
  toast(text, seconds = 2.5) { this.toastText = text; this.toastTimer = seconds; }

  update(dt, player, time, boss) {
    this.flash = Math.max(0, this.flash - dt * 1.2);
    this.vignette.material.opacity = this.flash;
    this.comfort.material.opacity += (this.comfortTarget - this.comfort.material.opacity) * Math.min(1, dt * 8);
    this.toastTimer -= dt;
    this.acc += dt;
    if (this.acc < 0.1) return;
    this.acc = 0;
    this.draw(player, time, boss);
    if (this.mode === 'wrist') this.drawAlerts(boss);
  }

  drawAlerts(boss) {
    const g = this.alertCtx;
    g.clearRect(0, 0, 512, 96);
    const hasToast = this.toastTimer > 0;
    if (!boss && !hasToast) { this.alertTex.needsUpdate = true; return; }
    g.fillStyle = 'rgba(0,0,0,0.5)'; roundRect(g, 0, 0, 512, 96, 16); g.fill();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (boss) {
      g.fillStyle = '#2a1030'; roundRect(g, 16, 10, 480, 22, 6); g.fill();
      g.fillStyle = '#c14dff'; roundRect(g, 16, 10, 480 * Math.max(0, boss.hp / boss.maxHp), 22, 6); g.fill();
      g.fillStyle = '#fff'; g.font = 'bold 17px system-ui, sans-serif';
      g.fillText(`☠ ${boss.t.name.toUpperCase()} ☠`, 256, 21);
    }
    if (hasToast) {
      g.fillStyle = '#ffd166'; g.font = 'bold 26px system-ui, sans-serif';
      if (g.measureText(this.toastText).width > 480) g.font = 'bold 20px system-ui, sans-serif';
      g.fillText(this.toastText, 256, boss ? 66 : 48);
    }
    this.alertTex.needsUpdate = true;
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
