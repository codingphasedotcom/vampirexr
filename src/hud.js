import * as THREE from 'three';
import { makeCanvas, roundRect, fmtTime } from './utils.js';
import { MAX_LEVEL } from './player.js';
import { iconCanvas } from './icons.js';

const W = 512, H = 232, BOSS_ROW = 40; // the top row is only used while a boss is alive
const FONT = 'Inter, system-ui, sans-serif';
const PANEL_H = 0.5 * H / W;

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
    this.game = null; // set by the game: the HUD reads weapons, passives and run gold from it

    // hurt feedback: red creeping in from the screen edges (a clear centre keeps the fight readable)
    const hc = makeCanvas(256, 256), hg = hc.getContext('2d');
    const hgrad = hg.createRadialGradient(128, 128, 40, 128, 128, 128);
    hgrad.addColorStop(0, 'rgba(255,255,255,0)'); hgrad.addColorStop(0.55, 'rgba(255,255,255,0.25)'); hgrad.addColorStop(1, 'rgba(255,255,255,1)'); // tinted per use
    hg.fillStyle = hgrad; hg.fillRect(0, 0, 256, 256);
    this.vignette = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 2.3),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(hc), color: 0xff2020, transparent: true, opacity: 0, depthTest: false, depthWrite: false }),
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
  // Gold full-screen pulse (level-up, evolution, relics). Rides the same edge-vignette mesh, tinted.
  glow(color = 0xffd166, amount = 0.45) { this.tint = new THREE.Color(color); this.flashTint = Math.max(this.flashTint || 0, amount); }
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

  // Camera mode: keep the panel inside narrower views (top-down uses a 52° FOV).
  layout(xr, fov) {
    if (this.mode !== 'camera') return;
    const half = xr ? 1 : Math.tan(THREE.MathUtils.degToRad(fov / 2)) * 0.9;
    this.mesh.position.y = Math.max(-0.33, -half + PANEL_H / 2 + 0.01);
  }

  update(dt, player, time, boss, wave) {
    this.flash = Math.max(0, this.flash - dt * 1.2);
    this.flashTint = Math.max(0, (this.flashTint || 0) - dt * 1.6);
    // low health: a slow heartbeat pulse at the screen edges
    const low = player.hp > 0 && player.hp / player.maxHp < 0.3 ? 1 - player.hp / player.maxHp / 0.3 : 0;
    this.heart = (this.heart || 0) + dt * (5 + low * 2);
    const beat = low > 0 ? (0.12 + 0.2 * low) * Math.pow(Math.max(0, Math.sin(this.heart)), 6) : 0;
    const red = Math.max(this.flash, beat);
    if (this.flashTint > red) { this.vignette.material.color.copy(this.tint); this.vignette.material.opacity = this.flashTint * 0.8; }
    else { this.vignette.material.color.setHex(0xff2020); this.vignette.material.opacity = red; }
    this.lowHealth = low;
    this.comfort.material.opacity += (this.comfortTarget - this.comfort.material.opacity) * Math.min(1, dt * 8);
    this.toastTimer -= dt;
    this.acc += dt;
    if (this.acc < 0.1) return;
    this.acc = 0;
    this.draw(player, time, boss, wave);
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

  draw(p, time, boss, wave) {
    const g = this.ctx;
    g.clearRect(0, 0, W, H);
    const top = boss ? 0 : BOSS_ROW;
    g.fillStyle = 'rgba(8,4,14,0.62)';
    roundRect(g, 0, top, W, H - top, 18); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 2; roundRect(g, 1, top + 1, W - 2, H - top - 2, 17); g.stroke();
    g.textBaseline = 'middle';

    if (boss) {
      g.fillStyle = '#2a1030'; roundRect(g, 16, 10, 480, 22, 6); g.fill();
      const bg = g.createLinearGradient(16, 0, 496, 0); bg.addColorStop(0, '#ff3d64'); bg.addColorStop(1, '#c14dff');
      g.fillStyle = bg; roundRect(g, 16, 10, 480 * Math.max(0, boss.hp / boss.maxHp), 22, 6); g.fill();
      g.fillStyle = '#fff'; g.font = `800 16px ${FONT}`; g.textAlign = 'center';
      g.fillText(`☠ ${boss.t.name.toUpperCase()} ☠`, 256, 21);
    }

    const oy = BOSS_ROW;
    // HP
    g.fillStyle = '#3a0d14'; roundRect(g, 16, oy + 14, 480, 26, 7); g.fill();
    const hg = g.createLinearGradient(0, oy + 14, 0, oy + 40); hg.addColorStop(0, '#ff5a66'); hg.addColorStop(1, '#c4202f');
    g.fillStyle = hg; roundRect(g, 16, oy + 14, 480 * Math.max(0, p.hp / p.maxHp), 26, 7); g.fill();
    g.fillStyle = '#fff'; g.font = `800 18px ${FONT}`; g.textAlign = 'center';
    g.fillText(`${Math.ceil(p.hp)} / ${p.maxHp}${p.revives > 0 ? '   ✚' : ''}`, 256, oy + 28);

    // XP
    const maxed = p.level >= MAX_LEVEL;
    g.fillStyle = '#141a33'; roundRect(g, 16, oy + 50, 480, 14, 5); g.fill();
    g.fillStyle = maxed ? '#ffd166' : '#6a8dff'; roundRect(g, 16, oy + 50, 480 * (maxed ? 1 : Math.min(1, p.xp / p.xpToNext)), 14, 5); g.fill();
    // dash readiness: thin bar under XP, bright cyan when ready
    const dash = this.dash ?? 1;
    g.fillStyle = '#10222a'; roundRect(g, 16, oy + 68, 480, 5, 2); g.fill();
    g.fillStyle = dash >= 1 ? '#7ff3ff' : '#3a7f8f'; roundRect(g, 16, oy + 68, 480 * Math.max(0, dash), 5, 2); g.fill();

    const gold = Math.floor(this.game?.runGold ?? 0);
    if (this.toastTimer > 0) {
      g.fillStyle = '#ffd166'; g.font = `800 30px ${FONT}`; g.textAlign = 'center';
      if (g.measureText(this.toastText).width > 480) g.font = `800 21px ${FONT}`;
      g.fillText(this.toastText, 256, oy + 104);
    } else {
      g.font = `800 28px ${FONT}`;
      g.fillStyle = '#fff';
      g.textAlign = 'left'; g.fillText(maxed ? `LV ${p.level}★` : `LV ${p.level}`, 20, oy + 96);
      g.textAlign = 'right'; g.fillText(`☠ ${p.kills}`, 492, oy + 96);
      g.font = `700 15px ${FONT}`;
      g.fillStyle = '#ffd34d'; g.fillText(`◆ ${gold} gold`, 492, oy + 123);
      g.textAlign = 'left'; g.fillStyle = '#b9b0cc'; g.fillText(fmtTime(time), 20, oy + 123);
      g.textAlign = 'center';
      if (wave && wave.wave > 0) {
        g.font = `800 26px ${FONT}`;
        g.fillStyle = wave.brk ? '#ffd166' : '#fff';
        g.fillText(wave.label ? `${wave.wave}/${wave.total} ${wave.label}` : `WAVE ${wave.wave}/${wave.total}`, 256, oy + 96);
        g.font = `600 15px ${FONT}`; g.fillStyle = '#b9b0cc';
        g.fillText(wave.objective ? `${wave.objective}${wave.brk ? '' : ` · ${wave.remaining} left`}` : wave.brk ? 'next wave incoming' : `${wave.remaining} left`, 256, oy + 123);
      }
    }
    this.drawBuild(g, oy + 140);
    this.tex.needsUpdate = true;
  }

  // Build row: six weapon slots (level / ★ evolved) and six passive slots.
  drawBuild(g, y) {
    const game = this.game;
    if (!game) return;
    const slot = (x, s, icon, label, color, glow) => {
      g.fillStyle = 'rgba(255,255,255,0.06)'; roundRect(g, x, y, s, s, 8); g.fill();
      if (glow) { g.strokeStyle = glow; g.lineWidth = 2.5; roundRect(g, x + 1, y + 1, s - 2, s - 2, 7); g.stroke(); }
      if (!icon) return;
      g.drawImage(iconCanvas(icon, 64), x + 3, y + 2, s - 6, s - 6);
      g.font = `800 12px ${FONT}`; g.textAlign = 'right'; g.textBaseline = 'alphabetic';
      g.lineWidth = 3; g.strokeStyle = '#000'; g.strokeText(label, x + s - 2, y + s - 3);
      g.fillStyle = color; g.fillText(label, x + s - 2, y + s - 3);
      g.textBaseline = 'middle';
    };
    const ws = game.weapons;
    for (let i = 0; i < 6; i++) {
      const w = ws[i];
      slot(16 + i * 41, 38, w?.constructor.id, w ? (w.evolved ? '★' : w.maxed ? 'MAX' : `${w.level}`) : '', w?.evolved ? '#e9c8ff' : '#fff',
        w?.evolved ? '#c77dff' : w?.maxed ? '#ffd166' : null);
    }
    const ps = Object.entries(game.player.passives);
    for (let i = 0; i < 6; i++) {
      const [id, lv] = ps[i] || [];
      slot(274 + i * 39, 34, id, id ? `${lv}` : '', '#bfefff', lv >= 5 ? '#4dd0ff' : null);
    }
  }
}

// Big centred title card for wave starts, boss intros, evolutions and records. Camera-attached so it works in VR
// (kept modest there: 1 m wide at 1.6 m, for under three seconds).
export class Banner {
  constructor(camera) {
    this.canvas = makeCanvas(1024, 256);
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.3),
      new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthTest: false, depthWrite: false, opacity: 0 }));
    this.mesh.renderOrder = 1000;
    this.mesh.visible = false;
    camera.add(this.mesh);
    this.camera = camera;
    this.t = 0; this.dur = 1;
    this.base = { y: 0.2, z: -1.2, s: 1 };
  }

  // kicker: small line above the title; color: accent for the glow and rules.
  show(title, sub = '', { color = '#ff3d64', seconds = 2.6, kicker = '' } = {}) {
    const g = this.ctx, W = 1024, H = 256;
    g.clearRect(0, 0, W, H);
    const band = g.createLinearGradient(0, 0, W, 0);
    band.addColorStop(0, 'rgba(8,3,14,0)'); band.addColorStop(0.2, 'rgba(8,3,14,0.72)');
    band.addColorStop(0.8, 'rgba(8,3,14,0.72)'); band.addColorStop(1, 'rgba(8,3,14,0)');
    g.fillStyle = band; g.fillRect(0, 34, W, 188);
    const rule = g.createLinearGradient(0, 0, W, 0);
    rule.addColorStop(0, 'rgba(0,0,0,0)'); rule.addColorStop(0.5, color); rule.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rule; g.fillRect(0, 34, W, 3); g.fillRect(0, 219, W, 3);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (kicker) { g.fillStyle = color; g.font = '700 26px Inter, system-ui, sans-serif'; g.fillText(kicker.toUpperCase().split('').join(String.fromCharCode(8202)), W / 2, 66); }
    let size = 92;
    g.font = `800 ${size}px Cinzel, Georgia, serif`;
    while (g.measureText(title).width > 940 && size > 40) { size -= 6; g.font = `800 ${size}px Cinzel, Georgia, serif`; }
    g.shadowColor = color; g.shadowBlur = 28; g.fillStyle = '#fff';
    g.fillText(title, W / 2, kicker ? 132 : 118);
    g.shadowBlur = 0;
    if (sub) { g.fillStyle = '#e8dff5'; g.font = '600 30px Inter, system-ui, sans-serif'; g.fillText(sub, W / 2, kicker ? 190 : 180); }
    this.tex.needsUpdate = true;
    this.t = this.dur = seconds;
    this.mesh.visible = true;
  }

  // Keeps the banner the same apparent size in first-person, top-down and VR.
  layout(xr, fov) {
    if (xr) this.base = { y: 0.12, z: -1.6, s: 0.83 }; // ~1 m wide at 1.6 m
    else { const k = Math.tan(THREE.MathUtils.degToRad(fov / 2)) / Math.tan(THREE.MathUtils.degToRad(35)); this.base = { y: 0.2 * k, z: -1.2, s: k }; }
  }

  update(dt) {
    if (this.t <= 0) { this.mesh.visible = false; return; }
    this.t -= dt;
    const e = this.dur - this.t, inn = Math.min(1, e / 0.22), out = Math.min(1, Math.max(0, this.t) / 0.45);
    const pop = 1 + 0.25 * Math.pow(1 - inn, 3);
    const b = this.base;
    this.mesh.position.set(0, b.y, b.z);
    this.mesh.scale.set(b.s * pop, b.s * pop, 1);
    this.mesh.material.opacity = inn * out;
  }

  hide() { this.t = 0; this.mesh.visible = false; }
}
