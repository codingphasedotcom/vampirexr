import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { BlobShadows } from './shadows.js';
import { toonUniforms } from './toon.js';
import { Input } from './input.js';
import { Player } from './player.js';
import { EnemyManager, KINDS } from './enemies.js';
import { Gems } from './gems.js';
import { Particles } from './particles.js';
import { Hud } from './hud.js';
import { Menu } from './menu.js';
import { Sfx } from './sfx.js';
import { Music } from './music.js';
import { Wand, Gun, WEAPONS } from './weapons.js';
import { BOSSES, BossFx } from './bosses.js';
import { Chests } from './chests.js';
import { Minimap } from './minimap.js';
import { getChoices, evolutionChoices } from './upgrades.js';
import { World } from './world.js';
import { LEVELS, levelById } from './levels/index.js';
import { GlowLayer, DamageNumbers, fxTime } from './fx.js';
import { rand, fmtTime } from './utils.js';
import { CastleSiege, confine } from './siege.js';
import { settings, saveSettings } from './settings.js';
import { TitleScreen } from './title.js';

const UP = new THREE.Vector3(0, 1, 0);
const ARENA_RADIUS = 90;
const MAX_ENEMIES = 200; // hard cap on monsters alive at once
const WAVES = 25;
const BOSS_WAVES = { 4: 'Bat Lord', 8: 'Grave Golem', 12: 'Necromancer', 17: 'Wraith Queen', 25: 'Vampire Lord' };
const waveCount = (w) => Math.min(1500, Math.floor(30 * Math.pow(1.28, w - 1))); // 30 → 86 (w5) → 273 (w10); late waves stream at the alive cap
const waveHpMul = (w) => 1 + (w - 1) * 0.2 + (w - 1) * (w - 1) * 0.01; // ~2× by wave 5, ~3.6× by wave 10
const casterChance = (w) => Math.min(0.35, Math.max(0, (w - 2) * 0.03)); // fire/ice casters from wave 3
const waveTimeLimit = (w) => 50 + w * 5; // seconds before the next wave starts regardless
const _q = new THREE.Quaternion();
const _fwd = new THREE.Vector3(), _right = new THREE.Vector3(), _move = new THREE.Vector3(), _head = new THREE.Vector3(), _tmp = new THREE.Vector3();
const _col = { x: 0, z: 0 };
const _kindColor = new THREE.Color();
const PLAYER_RADIUS = 0.35;
const DASH = { speed: 22, time: 0.2, cooldown: 1.6, iframes: 0.45 };
const _lastMove = new THREE.Vector3(0, 0, -1);

// Final desktop grade: saturation/contrast, level tint, vignette, a red chromatic pulse when hurt, faint grain.
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uSaturation: { value: 1.12 }, uTint: { value: new THREE.Color(1, 1, 1) },
    uHurt: { value: 0 }, uTime: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uSaturation, uHurt, uTime; uniform vec3 uTint; varying vec2 vUv;
    void main() {
      vec2 c = vUv - 0.5;
      float ab = 0.0025 + uHurt * 0.012;
      vec3 col = vec3(texture2D(tDiffuse, vUv + c * ab).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - c * ab).b);
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSaturation);
      col = (col - 0.5) * 1.06 + 0.5;
      col *= uTint;
      float v = smoothstep(0.95, 0.28, length(c * vec2(1.15, 1.0)));
      col *= mix(0.55, 1.0, v);
      col = mix(col, col * vec3(1.25, 0.55, 0.55), uHurt * (1.0 - v) * 1.4);
      col += (fract(sin(dot(vUv * 913.0 + uTime, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.025;
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }`,
};

export class Game {
  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.xr.enabled = true;
    this.renderer.xr.setReferenceSpaceType('local-floor');
    document.body.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 300);
    this.camera.position.set(0, 1.6, 0);
    // The rig is what moves; in VR the headset drives the camera inside it.
    this.rig = new THREE.Group();
    this.rig.add(this.camera);
    this.scene.add(this.rig);

    this.world = new World(this.scene, levelById(settings.level));
    this.glow = new GlowLayer(this.scene);
    this.numbers = new DamageNumbers(this.scene);
    this.bossFx = new BossFx(this.scene);
    this.chests = new Chests(this.scene);
    this.shadows = new BlobShadows(this.scene);
    this.shake = 0;
    this.crosshair = document.getElementById('crosshair');
    this.playerLight = new THREE.PointLight(0xffc38a, this.world.level.playerLight, 11, 2);
    this.scene.add(this.playerLight);

    this.input = new Input(this.renderer, this.rig, this.renderer.domElement);
    this.player = new Player();
    this.enemies = new EnemyManager(this.scene);
    this.enemies.loadModels(BOSSES, (r) => {
      // surfaced on the HUD so model problems are visible inside the headset, where there is no console
      this.modelStatus = r.failed.length ? `Models: ${r.ok.length} ok, failed: ${r.failed.join(' | ')}` : `Models loaded (${r.ok.length})`;
    });
    this.gems = new Gems(this.scene);
    this.particles = new Particles(this.scene);
    this.hud = new Hud(this.camera);
    this.scene.add(this.hud.anchor);
    this.minimap = new Minimap(this.camera);
    this.menu = new Menu(this.scene, this.camera, this.input);
    this.sfx = new Sfx();
    this.music = new Music(this.sfx);
    this.music.enabled = settings.music;
    this.dashT = 0; this.dashReady = 0; this.invulnUntil = 0;
    this.stats = { damage: {} };
    this.weapons = [];
    this.boss = null;
    this.hpMul = 1;
    this.wave = 0; this.waveTotal = 0; this.waveSpawned = 0; this.waveTimer = 0; this.waveBreak = 0; this.waveRate = 1;
    this.clock = new THREE.Clock();
    this.state = 'menu'; // menu | playing | levelup | gameover | paused
    this.time = 0;

    // Post-processing is desktop-only; inside the headset we render directly for framerate.
    // The composer renders into a 4× MSAA target (the canvas' own antialiasing doesn't apply to render targets).
    const rt = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.applyLevelLook();

    this.overlay = document.getElementById('overlay');
    this.ovTitle = document.getElementById('ovTitle');
    this.ovMsg = document.getElementById('ovMsg');
    this.playBtn = document.getElementById('playDesktop');
    this.bindUi();
    this.bindSettings();
    this.setupXR();

    window.addEventListener('resize', () => {
      if (this.renderer.xr.isPresenting) return;
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.composer.setSize(window.innerWidth, window.innerHeight);
    });

    this.title.show(true);
    this.renderer.setAnimationLoop(() => this.loop());
  }

  // ---------- UI / sessions ----------

  bindUi() {
    this.playBtn.onclick = () => {
      if (this.state === 'paused') { if (this.input.usingPad) this.resume(); else this.input.requestPointerLock(); }
    };
    this.input.onKey = (code) => this.onKey(code);
    this.input.onHands = () => this.hud.toast('Hands: swing arms to run · pinch to pick', 5);
    this.input.onUnlockedClick = () => {
      if (this.state === 'levelup' || this.state === 'gameover') this.input.requestPointerLock();
    };
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === this.renderer.domElement;
      if (!locked && this.state === 'playing' && !this.renderer.xr.isPresenting && !this.input.usingPad) {
        this.state = 'paused';
        this.showOverlay('PAUSED', 'Click Resume to get back into the fight.', 'Resume');
      } else if (locked && this.state === 'paused') {
        this.state = 'playing';
        this.overlay.classList.add('hidden');
        this.clock.getDelta();
      }
    });
  }

  // The desktop front end. Settings changed here persist and apply immediately.
  bindSettings() {
    this.title = new TitleScreen({
      levels: LEVELS, settings, sfx: this.sfx,
      onFirstInput: () => { this.sfx.init(); this.music.start(); },
      onPlay: () => { this.enterFullscreen(); this.start(); },
      onEnterVR: () => this.enterVR(),
      onFullscreen: () => this.toggleFullscreen(),
      onLevel: (id) => { settings.level = id; saveSettings(); },
      onSetting: (key, value) => {
        settings[key] = value; saveSettings();
        if (key === 'music') this.music.setEnabled(value);
      },
    });
  }

  // Rebuilds the world when the chosen level differs from the one loaded; also syncs rim light, grade and player light.
  applyLevelLook() {
    const level = levelById(settings.level);
    if (this.world.level !== level) {
      this.world.dispose();
      this.world = new World(this.scene, level);
    }
    this.playerLight.intensity = level.playerLight;
    toonUniforms.uRimColor.value.set(level.rimLight?.color ?? 0xa9b8ff);
    toonUniforms.uRimStrength.value = level.rimLight?.strength ?? 0.6;
    const gr = this.grade?.uniforms;
    if (gr) { gr.uSaturation.value = level.grade?.saturation ?? 1.12; gr.uTint.value.set(level.grade?.tint ?? 0xffffff); }
  }

  cycleLevel() {
    const i = LEVELS.findIndex((l) => l.id === settings.level);
    settings.level = LEVELS[(i + 1) % LEVELS.length].id;
    saveSettings();
  }

  // ---------- in-world menus (VR) ----------

  showVrMenu() {
    this.state = 'menu';
    const level = levelById(settings.level);
    this.menu.show('', 'Point at a card and pull the trigger (or pinch)', [
      { kind: 'weapon', title: 'Start', sub: 'Play', desc: level.id === 'castle' ? 'Clear four rooms, claim treasure, and slay the Vampire Lord.' : 'Survive 25 waves. Aim the revolver; magic fires automatically.', apply: () => this.start() },
      { kind: 'bonus', title: `Level: ${level.name}`, sub: 'Select', desc: level.desc, apply: () => { this.cycleLevel(); this.applyLevelLook(); this.showVrMenu(); } },
      { kind: 'passive', title: 'Settings', sub: 'Comfort', desc: 'Turning, comfort vignette, HUD placement.', apply: () => this.showSettings(() => this.showVrMenu()) },
    ], (item) => item.apply(), true, { logo: true, art: true });
  }

  showPauseMenu() {
    this.menu.show('PAUSED', 'Press X / Y / A / B again to resume', [
      { kind: 'weapon', title: 'Resume', sub: '', desc: 'Back into the fight.', apply: () => this.resume() },
      { kind: 'passive', title: 'Settings', sub: 'Comfort', desc: 'Turning, comfort vignette, HUD placement.', apply: () => this.showSettings(() => this.showPauseMenu()) },
      { kind: 'bonus', title: 'Restart', sub: '', desc: 'Abandon this run and start over.', apply: () => this.start() },
    ], (item) => item.apply(), true);
  }

  showSettings(back) {
    const toggle = (key, values) => { settings[key] = values[(values.indexOf(settings[key]) + 1) % values.length]; saveSettings(); this.showSettings(back); };
    this.menu.show('SETTINGS', 'Select a card to change it', [
      { kind: 'passive', title: settings.turn === 'snap' ? 'Turn: Snap 45°' : 'Turn: Smooth', sub: 'Turning',
        desc: settings.turn === 'snap' ? 'Right stick jumps in 45° steps. Most comfortable.' : 'Right stick turns continuously. Can cause nausea.',
        apply: () => toggle('turn', ['smooth', 'snap']) },
      { kind: 'passive', title: `Vignette: ${settings.vignette ? 'On' : 'Off'}`, sub: 'Comfort',
        desc: 'Darkens the edges of your view while moving or turning.', apply: () => toggle('vignette', [true, false]) },
      { kind: 'passive', title: settings.hud === 'wrist' ? 'HUD: Wrist' : 'HUD: Fixed', sub: 'Display',
        desc: settings.hud === 'wrist' ? 'Stats float above your off-hand. Boss HP and alerts stay in view.' : 'Stats are locked to the bottom of your view.',
        apply: () => toggle('hud', ['wrist', 'camera']) },
      { kind: 'passive', title: `Music: ${settings.music ? 'On' : 'Off'}`, sub: 'Audio',
        desc: 'Procedural soundtrack that intensifies with the fight.', apply: () => { toggle('music', [true, false]); this.music.setEnabled(settings.music); } },
      { kind: 'weapon', title: 'Back', sub: '', desc: 'Return.', apply: back },
    ], (item) => item.apply(), true);
  }

  resume() {
    this.menu.hide();
    this.overlay.classList.add('hidden');
    this.clock.getDelta();
    this.state = 'playing';
  }

  enterFullscreen() {
    const el = document.documentElement;
    if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen().catch(() => {});
  }

  toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else this.enterFullscreen();
  }

  showOverlay(title, msg, btn) {
    this.ovTitle.textContent = title;
    this.ovMsg.innerHTML = msg;
    this.playBtn.textContent = btn;
    this.overlay.classList.remove('hidden');
  }

  async enterVR() {
    try {
      const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] });
      await this.renderer.xr.setSession(session);
    } catch (err) { console.error('Could not start XR session', err); this.hud.toast('Could not start VR'); }
  }

  setupXR() {
    if (!navigator.xr) this.title.setVR(false, 'WebXR not available in this browser');
    else navigator.xr.isSessionSupported('immersive-vr')
      .then((ok) => this.title.setVR(ok, ok ? '' : 'No VR headset detected'))
      .catch(() => this.title.setVR(false, 'No VR headset detected'));
    this.renderer.xr.addEventListener('sessionstart', () => {
      this.title.hide();
      this.overlay.classList.add('hidden');
      this.hud.setMode(settings.hud);
      this.showVrMenu();
    });
    this.renderer.xr.addEventListener('sessionend', () => {
      this.state = 'menu';
      this.menu.hide();
      this.hud.setMode('camera');
      this.title.show();
    });
  }

  onKey(code) {
    if (this.title.visible && !this.renderer.xr.isPresenting) { this.title.key(code); return; }
    if (code === 'KeyF' && !this.renderer.xr.isPresenting) { this.toggleFullscreen(); return; }
    if (code === 'ShiftLeft' || code === 'ShiftRight') { this.tryDash(); return; }
    if (!this.menu.open) return;
    const m = /^(?:Digit|Numpad)([1-9])$/.exec(code);
    if (m) this.menu.pick(Number(m[1]) - 1);
    else if (code === 'Enter' || code === 'Space') { if (this.state === 'gameover') this.menu.pick(0); }
  }

  // ---------- game flow ----------

  start() {
    this.sfx.init();
    this.music.start();
    this.applyLevelLook();
    this.player.reset();
    this.siege = this.world.level.id === 'castle' ? new CastleSiege(this) : null;
    this.world.ambient?.reset?.();
    this.enemies.reset();
    this.gems.reset();
    this.bossFx.reset();
    this.chests.reset();
    for (const w of this.weapons) w.dispose();
    this.weapons = [];
    this.addWeapon(Gun);
    this.addWeapon(Wand);
    this.boss = null; this.hpMul = 1;
    this.time = 0; this.spawnAcc = 0;
    this.wave = 0; this.waveBreak = 1.5; // first wave starts after a short breather
    this.pendingLevels = 0; this.hurtTimer = 0; this.slowUntil = 0;
    this.dashT = 0; this.dashReady = 0; this.invulnUntil = 0;
    this.stats = { damage: {} };
    this.hud.toastTimer = 0;
    this.rig.position.set(0, 0, 0);
    if (!this.renderer.xr.isPresenting) {
      this.rig.rotation.y = 0; this.input.yaw = 0; this.input.pitch = 0;
      this.input.requestPointerLock();
    }
    this.menu.hide();
    this.overlay.classList.add('hidden');
    this.title.hide();
    this.clock.getDelta();
    this.state = 'playing';
    if (this.modelStatus) this.hud.toast(this.modelStatus, this.modelStatus.includes('failed') ? 8 : 3);
  }

  addWeapon(W) { this.weapons.push(new W(this)); }

  openLevelUp() {
    this.state = 'levelup';
    this.sfx.levelup();
    const p = this.player.pos;
    this.particles.burst(p.x, 0.3, p.z, 0xffd166, 50, 5);
    this.particles.burst(p.x, 1.4, p.z, 0x9fd8ff, 24, 3);
    this.menu.show('LEVEL UP!', `Level ${this.player.level} — choose an upgrade`, getChoices(this), (item) => {
      item.apply();
      this.pendingLevels--;
      this.state = 'playing';
    }, this.renderer.xr.isPresenting);
  }

  // Run summary card: time, wave, level, kills and damage dealt per weapon.
  statsCard() {
    const p = this.player, names = Object.fromEntries(WEAPONS.map((W) => [W.id, W.title]));
    const fmt = (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : Math.round(v));
    const rows = Object.entries(this.stats.damage).sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([id, v]) => `${names[id] || id}: ${fmt(v)}${this.weapons.find((w) => w.constructor.id === id)?.evolved ? ' ★' : ''}`);
    const where = this.siege ? `Room ${this.siege.index + 1}/4` : `Wave ${this.wave}/${WAVES}`;
    return { kind: 'stats', title: 'Run Stats', sub: where, disabled: true,
      desc: `${fmtTime(this.time)} · Lv ${p.level} · ${p.kills} kills\n${rows.join('\n')}` };
  }

  endMenu(title, sub, againTitle, againDesc) {
    this.state = 'gameover';
    this.menu.show(title, sub, [
      { kind: 'bonus', title: againTitle, sub: '', desc: againDesc, apply: () => this.start() },
      this.statsCard(),
      { kind: 'passive', title: 'Main Menu', sub: '', desc: 'Change level or settings.', apply: () => this.toMainMenu() },
    ], (item) => item.apply(), this.renderer.xr.isPresenting);
  }

  toMainMenu() {
    this.enemies.reset(); this.gems.reset(); this.chests.reset(); this.bossFx.reset();
    this.boss = null; this.music.intensity = 0.15;
    if (this.renderer.xr.isPresenting) this.showVrMenu();
    else { this.state = 'menu'; if (document.pointerLockElement) document.exitPointerLock(); this.title.show(); }
  }

  gameOver() {
    this.sfx.die();
    const p = this.player;
    this.endMenu('YOU DIED', `Survived ${fmtTime(this.time)}  ·  Level ${p.level}  ·  ${p.kills} kills`, 'Try Again', 'The night is long. Go again.');
  }

  victory() {
    this.sfx.levelup();
    this.endMenu('VICTORY!', `The Vampire Lord is dust.  ${fmtTime(this.time)}  ·  ${this.player.kills} kills`, 'Play Again', 'Dawn breaks. Until next night.');
  }

  onEvolve(w, E) {
    const p = this.player.pos;
    this.sfx.evolve();
    this.hud.toast(`EVOLVED: ${E.title}!`, 3.5);
    this.particles.burst(p.x, 1, p.z, 0xc77dff, 80, 6);
    this.addShake(0.3);
  }

  // Dash: a short burst in the move direction (or forward) with invulnerability frames.
  tryDash() {
    if (this.state !== 'playing' || this.time < this.dashReady) return;
    this.dashT = DASH.time;
    this.dashReady = this.time + DASH.cooldown;
    this.invulnUntil = this.time + DASH.iframes;
    this.dashDir = _lastMove.clone();
    this.sfx.dash();
    this.input.rumble(0.3, 0.6, 90);
    const p = this.player.pos;
    this.particles.burst(p.x, 0.4, p.z, 0x9fd8ff, 18, 3);
  }

  addShake(v) { this.shake = Math.min(1, this.shake + v); }

  damagePlayer(amount, effect = null) {
    if (this.time < this.invulnUntil) return;
    this.player.hurt(amount);
    this.addShake(0.35);
    this.hud.hurt();
    this.sfx.hurt();
    this.input.rumble(0.8, 0.5, 150);
    if (effect === 'slow') { this.slowUntil = this.time + 2; this.hud.toast('Frozen!', 1.2); }
  }

  spawnBoss(def) {
    const a = rand(0, Math.PI * 2), p = this.player.pos;
    this.boss = this.enemies.spawnBoss(def, p.x + Math.cos(a) * 14, p.z + Math.sin(a) * 14, 1 + (this.wave - 1) * 0.03);
    this.particles.burst(this.boss.x, def.y, this.boss.z, def.color, 60, 6);
    this.hud.toast(`⚠ ${def.name.toUpperCase()} ⚠`, 4);
    this.sfx.roar();
  }

  // Central damage entry point so every weapon gets the same feedback (flash, numbers, sfx, gems, particles).
  hitEnemy(e, dmg, opts = {}) {
    if (e.dead) return;
    if (opts.src) this.stats.damage[opts.src] = (this.stats.damage[opts.src] || 0) + Math.min(dmg, Math.max(0, e.hp));
    const died = this.enemies.damage(e, dmg);
    if (!opts.quiet) this.sfx.hit();
    this.numbers.spawn(e.x, e.t.y * (e.scale ?? 1) + 0.4, e.z, Math.round(dmg), opts.precision ? '#5ffff0' : died ? '#ffd166' : '#ffffff');
    if (died) {
      this.player.kills++;
      this.gems.spawn(e.x, e.z, e.xp ?? e.t.xp);
      if (e.t.boss) { for (let i = 0; i < 3; i++) this.gems.spawnHeal(e.x + rand(-1.5, 1.5), e.z + rand(-1.5, 1.5)); }
      else if (Math.random() < 0.05) this.gems.spawnHeal(e.x, e.z);
      this.particles.burst(e.x, e.t.y * (e.scale ?? 1), e.z, e.t.color, e.t.boss ? 120 : 16, e.t.boss ? 8 : 4);
      this.sfx.kill();
      if (e.t.boss) {
        this.boss = null;
        this.hud.toast(`${e.t.name} slain!`, 3);
        if (e.t.final) this.victory();
      }
    }
  }

  // ---------- per-frame ----------

  loop() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const xr = this.renderer.xr.isPresenting;
    fxTime.value += dt;
    this.glow.begin();
    if (xr && this.input.getMenuPress()) {
      if (this.state === 'playing') { this.state = 'paused'; this.showPauseMenu(); }
      else if (this.state === 'paused') this.resume();
    }
    if (!xr) {
      this.input.pollGamepad(dt);
      const ui = this.input.consumeUi();
      const face = this.input.padFace; this.input.padFace = -1; // A/Cross = 0, B = 1
      const start = this.input.consumePadStart();
      if (this.title.visible) {
        for (const a of ui) this.title.action(a === 'any' ? 'accept' : a);
        this.input.consumePadNav();
      } else if (start && this.state === 'playing') {
        this.state = 'paused';
        this.showOverlay('PAUSED', 'Press Start or A to resume.', 'Resume');
        if (document.pointerLockElement) document.exitPointerLock();
      } else if ((start || face === 0) && this.state === 'paused') this.resume();
      else if (face === 0 && this.state === 'gameover') this.menu.pick(0);
      else if (face === 1 && this.state === 'playing') this.tryDash();
    }
    if (this.input.consumeSqueeze()) this.tryDash();
    // soundtrack intensity follows the fight
    const target = this.state === 'menu' ? 0.15 : this.state === 'playing' || this.state === 'levelup'
      ? Math.min(1, 0.4 + this.enemies.alive / 260 + (this.boss ? 0.45 : 0)) : 0.3;
    this.music.intensity += (target - this.music.intensity) * Math.min(1, dt * 0.8);
    this.hud.dash = this.state === 'playing' ? Math.min(1, 1 - (this.dashReady - this.time) / DASH.cooldown) : 1;
    this.updateMovement(dt, xr);
    if (this.state === 'playing') this.tick(dt);
    else if (this.menu.open) this.menu.update(xr);
    if (xr) { this.hud.setMode(settings.hud); this.updateWristAnchor(); }
    for (const w of this.weapons) w.draw(dt);
    this.gems.draw(fxTime.value, this.glow);
    this.chests.draw(fxTime.value, this.glow);
    for (const e of this.enemies.list) if (e.kind !== 'normal') this.glow.add(e.x, e.t.y * e.scale, e.z, 0.9 * e.scale, _kindColor.set(KINDS[e.kind].color), 0.7);
    this.enemies.outlinesVisible = !xr;
    this.shadows.begin();
    this.enemies.drawShadows(this.shadows);
    for (const c of this.chests.list) this.shadows.add(c.x, c.z, 0.6, 0.5);
    if (this.state !== 'menu') this.shadows.add(this.player.pos.x, this.player.pos.z, 0.42, 0.45);
    this.shadows.end();
    this.particles.update(dt);
    this.numbers.update(dt);
    this.world.update(dt, fxTime.value, this.player.pos);
    this.playerLight.position.set(this.player.pos.x, 2.2, this.player.pos.z);
    const inMenu = this.state === 'menu';
    this.hud.mesh.visible = !inMenu;
    this.minimap.mesh.visible = !inMenu;
    this.hud.update(dt, this.player, this.time, this.boss, this.waveInfo());
    this.minimap.update(dt, this);
    this.crosshair?.classList.toggle('hidden', xr || this.state === 'menu' || this.state === 'paused');
    this.glow.end();
    if (xr) this.renderer.render(this.scene, this.camera);
    else if (this.title.visible) { /* the title art covers the canvas: save the GPU */ }
    else {
      // desktop-only camera shake (never in the headset: moving the view without the head moving is nauseating)
      this.shake = Math.max(0, this.shake - dt * 2.2);
      const k = this.shake * this.shake * 0.06;
      this.camera.position.set(Math.sin(fxTime.value * 53) * k, 1.6 + Math.sin(fxTime.value * 47 + 1) * k, 0);
      this.grade.uniforms.uHurt.value = this.hud.flash;
      this.grade.uniforms.uTime.value = fxTime.value;
      this.composer.render();
    }
  }

  headPos() { return this.camera.getWorldPosition(_head); }

  updateMovement(dt, xr) {
    let moving = 0, turning = 0;
    if (!xr) {
      this.rig.rotation.y = this.input.yaw;
      this.camera.rotation.x = this.input.pitch;
    } else {
      this.input.updateArmSwing(dt);
      if (settings.turn === 'snap') {
        const snap = this.input.getSnapTurn();
        if (snap) { this.rotateRig(-snap * Math.PI / 4); turning = 1; }
      } else {
        const turn = this.input.getTurnAxis();
        if (turn) { this.rotateRig(-turn * settings.turnSpeed * Math.PI / 180 * dt); turning = Math.abs(turn); }
      }
    }
    if (this.state === 'playing') {
      const mv = this.input.getMove(xr);
      moving = Math.min(1, Math.hypot(mv.x, mv.y));
      if (mv.x || mv.y) {
        this.camera.getWorldQuaternion(_q);
        _fwd.set(0, 0, -1).applyQuaternion(_q); _fwd.y = 0; _fwd.normalize();
        _right.crossVectors(_fwd, UP);
        _move.copy(_fwd).multiplyScalar(mv.y).addScaledVector(_right, mv.x);
        if (_move.lengthSq() > 1) _move.normalize();
        const slow = this.slowUntil > this.time ? 0.55 : 1;
        this.rig.position.addScaledVector(_move, this.player.speed * slow * dt);
        _lastMove.copy(_move).normalize();
      } else if (this.dashT <= 0) {
        this.camera.getWorldQuaternion(_q);
        _lastMove.set(0, 0, -1).applyQuaternion(_q); _lastMove.y = 0; _lastMove.normalize();
      }
      if (this.dashT > 0) {
        this.dashT -= dt;
        this.rig.position.addScaledVector(this.dashDir, DASH.speed * dt);
        moving = 1;
        this.glow.add(this.player.pos.x, 0.8, this.player.pos.z, 1.2, _kindColor.set(0x9fd8ff), 0.5);
      }
      const h = this.headPos(), d = Math.hypot(h.x, h.z);
      if (d > ARENA_RADIUS) {
        const k = ARENA_RADIUS / d;
        this.rig.position.x -= h.x * (1 - k);
        this.rig.position.z -= h.z * (1 - k);
      }
    }
    // keep the player out of props (also nudges the rig if you physically lean into one in VR)
    const h = this.headPos();
    this.world.colliders.resolve(h.x, h.z, PLAYER_RADIUS, _col);
    if (_col.x !== h.x || _col.z !== h.z) { this.rig.position.x += _col.x - h.x; this.rig.position.z += _col.z - h.z; this.headPos(); }
    if (this.siege) {
      const limited = this.siege.constrainPlayer(_col.x, _col.z);
      this.rig.position.x += limited.x - _col.x; this.rig.position.z += limited.z - _col.z;
      _col.x = limited.x; _col.z = limited.z;
    }
    this.player.pos.set(_col.x, 0, _col.z);
    this.hud.setComfort(xr && settings.vignette ? Math.min(1, moving * 0.85 + turning * 0.9) : 0);
  }

  // Float the wrist HUD above the off-hand (left by default), facing the head. Works for controllers and tracked hands.
  updateWristAnchor() {
    const cs = this.input.controllers;
    const c = cs.find((c) => c.source && c.hand === 'left') || cs.find((c) => c.source);
    if (!c) { this.hud.anchor.visible = false; return; }
    const src = c.source.hand ? c.hand3d.joints?.wrist : c.grip;
    if (!src) { this.hud.anchor.visible = false; return; }
    src.getWorldPosition(_tmp);
    _tmp.y += 0.12;
    this.hud.anchor.position.copy(_tmp);
    this.hud.anchor.lookAt(this.headPos());
    this.hud.anchor.visible = true;
  }

  // Rotate the rig around the head so the player stays in place.
  rotateRig(angle) {
    const h = this.headPos();
    _tmp.set(this.rig.position.x - h.x, 0, this.rig.position.z - h.z).applyAxisAngle(UP, angle);
    this.rig.position.x = h.x + _tmp.x;
    this.rig.position.z = h.z + _tmp.z;
    this.rig.rotation.y += angle;
  }

  tick(dt) {
    const p = this.player;
    this.time += dt;
    if (this.siege) this.siege.update(dt);
    else this.spawnDirector(dt);
    if (this.boss) this.boss.t.ai(this.boss, dt, this);
    if (this.siege) for (const e of this.enemies.list) confine(e, Math.max(0, this.siege.index));
    const contact = this.enemies.update(dt, p.pos, this.time, this.world.colliders, (e, k) => {
      const dx = p.pos.x - e.x, dz = p.pos.z - e.z, d = Math.hypot(dx, dz) || 1;
      this.bossFx.shoot(e.x, e.z, dx / d * k.speed, dz / d * k.speed, k.dmg * this.hpMul * 0.5, k.color, k.effect);
      this.particles.burst(e.x, e.t.y, e.z, k.color, 6, 2);
    });
    for (const w of this.weapons) w.update(dt);
    this.bossFx.update(dt, this);
    this.gems.update(dt, p, (g) => {
      if (g.heal) {
        p.heal(Math.round(p.maxHp * 0.25));
        this.hud.toast(`+${Math.round(p.maxHp * 0.25)} HP`, 1.2);
        this.particles.burst(p.pos.x, 1.2, p.pos.z, 0xff3b5c, 16, 3);
      } else this.pendingLevels += p.addXp(g.v);
      this.sfx.pickup();
    });
    this.chests.update(dt, p, () => this.openChest());
    p.heal(p.stats.regen * dt);
    this.hurtTimer -= dt;
    if (contact > 0 && this.time >= this.invulnUntil) {
      p.hurt(contact);
      if (this.hurtTimer <= 0) { this.hurtTimer = 0.35; this.hud.hurt(); this.sfx.hurt(); this.input.rumble(0.6, 0.4, 120); this.addShake(0.2); }
    }
    if (p.hp <= 0) { p.hp = 0; this.gameOver(); return; }
    if (this.state !== 'playing') return; // victory may have ended the run this frame
    if (this.pendingLevels > 0) { this.openLevelUp(); return; }
  }

  // A chest hands out one random upgrade from the same pool as level-ups.
  openChest() {
    const evo = evolutionChoices(this);
    const choices = evo.length ? evo : getChoices(this);
    const item = choices[Math.floor(Math.random() * choices.length)];
    item.apply();
    this.hud.toast(`Chest: ${item.title} ${item.sub}`.trim(), 3);
    this.particles.burst(this.player.pos.x, 1, this.player.pos.z, 0xffd166, 40, 4);
    this.sfx.levelup();
  }

  waveInfo() {
    if (this.siege) return this.siege.info();
    const remaining = Math.max(0, this.waveTotal - this.waveSpawned) + this.enemies.alive;
    return { wave: this.wave, total: WAVES, remaining, brk: this.waveBreak > 0 };
  }

  // ---------- waves ----------

  startWave(w) {
    this.wave = w;
    this.waveTotal = BOSS_WAVES[w] ? Math.ceil(waveCount(w) * 0.6) : waveCount(w);
    this.waveSpawned = 0;
    this.waveTimer = 0;
    this.spawnAcc = 0;
    this.waveRate = Math.max(2, this.waveTotal / 18); // spread the wave over ~18 s
    this.hpMul = waveHpMul(w);
    const bossName = BOSS_WAVES[w];
    if (bossName) this.spawnBoss(BOSSES.find((b) => b.name === bossName));
    this.hud.toast(bossName ? `WAVE ${w} — ${bossName.toUpperCase()}` : `WAVE ${w}`, 3);
    const chests = bossName ? 2 : 1;
    for (let i = 0; i < chests; i++) {
      const a = rand(0, Math.PI * 2), d = rand(10, 22), p = this.player.pos;
      const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d, r = Math.hypot(x, z);
      const k = r > ARENA_RADIUS - 5 ? (ARENA_RADIUS - 5) / r : 1;
      this.world.colliders.resolve(x * k, z * k, 1.2, _col); // never inside a tree or fence
      this.chests.spawn(_col.x, _col.z);
    }
  }

  spawnDirector(dt) {
    if (this.waveBreak > 0) {
      this.waveBreak -= dt;
      if (this.waveBreak <= 0) this.startWave(this.wave + 1);
      return;
    }
    if (this.wave === 0) return;
    this.waveTimer += dt;
    if (this.waveSpawned < this.waveTotal) {
      this.spawnAcc += this.waveRate * dt;
      while (this.spawnAcc >= 1 && this.waveSpawned < this.waveTotal && this.enemies.alive < MAX_ENEMIES) {
        this.spawnAcc -= 1;
        this.spawnAt(this.pickType(this.wave), rand(0, Math.PI * 2), rand(18, 26), this.hpMul, casterChance(this.wave));
        this.waveSpawned++;
      }
      if (this.enemies.alive >= MAX_ENEMIES) this.spawnAcc = Math.min(this.spawnAcc, 1);
    }
    // wave is over once everything has spawned and died (a couple of stragglers, or 2 minutes, won't hold it up)
    const cleared = !this.boss && ((this.waveSpawned >= this.waveTotal && this.enemies.alive <= 2) || this.waveTimer > waveTimeLimit(this.wave));
    if (cleared && this.wave < WAVES) {
      this.waveBreak = 3;
      this.hud.toast(`Wave ${this.wave} cleared!`, 2.5);
    }
  }

  spawnAt(type, angle, dist, hpMul, casters = 0) {
    const e = this.enemies.spawn(type, this.player.pos.x + Math.cos(angle) * dist, this.player.pos.z + Math.sin(angle) * dist, hpMul, casters);
    if (e && !e.t.fly) this.particles.burst(e.x, 0.15, e.z, 0x2a1f3a, 8, 1.5); // grave dirt as it claws out of the ground
  }

  pickType(w) {
    const wt = {
      bat: Math.max(3, 10 - Math.max(0, w - 6) * 0.6),
      ghoul: 3 + w * 0.8,
      wraith: w >= 3 ? 2 + (w - 3) * 0.8 : 0,
      brute: w >= 5 ? 1 + (w - 5) * 0.6 : 0,
    };
    let total = 0;
    for (const k in wt) total += wt[k];
    let r = Math.random() * total;
    for (const k in wt) { r -= wt[k]; if (r <= 0) return k; }
    return 'bat';
  }

}
