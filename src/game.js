import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Input } from './input.js';
import { Player } from './player.js';
import { EnemyManager, KINDS } from './enemies.js';
import { Gems } from './gems.js';
import { Particles } from './particles.js';
import { Hud } from './hud.js';
import { Menu } from './menu.js';
import { Sfx } from './sfx.js';
import { Wand, Gun } from './weapons.js';
import { BOSSES, BossFx } from './bosses.js';
import { Chests } from './chests.js';
import { Minimap } from './minimap.js';
import { getChoices } from './upgrades.js';
import { World } from './world.js';
import { LEVELS, levelById } from './levels/index.js';
import { GlowLayer, DamageNumbers, fxTime } from './fx.js';
import { rand, fmtTime } from './utils.js';
import { settings, saveSettings } from './settings.js';

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

const INTRO = `Survive the horde. Weapons fire on their own — you just move.<br><br>
<b>Desktop:</b> WASD + mouse, or a gamepad (sticks to move/look, RT to shoot, A to pick, Start to pause). F toggles fullscreen.<br>
<b>VR:</b> left stick to move, right stick to turn, hold trigger to shoot, point + trigger to pick upgrades.<br>
<b>Hand tracking:</b> swing your arms to run, pinch to shoot or pick upgrades.<br>
Survive 25 waves. Bosses arrive on waves 4, 8, 12, 17 and 25 — slay the Vampire Lord to win.<br>
Golden light beams mark treasure chests: walk into one for a free upgrade.`;

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
    this.weapons = [];
    this.boss = null;
    this.hpMul = 1;
    this.wave = 0; this.waveTotal = 0; this.waveSpawned = 0; this.waveTimer = 0; this.waveBreak = 0; this.waveRate = 1;
    this.clock = new THREE.Clock();
    this.state = 'menu'; // menu | playing | levelup | gameover | paused
    this.time = 0;

    // Bloom is desktop-only; inside the headset we render directly for framerate.
    this.composer = new EffectComposer(this.renderer);
    this.composer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.55, 0.6, 0.72);
    this.composer.addPass(this.bloom);
    this.applyLevelLook();
    this.composer.addPass(new OutputPass());

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

    this.showOverlay('VAMPIRESXR', INTRO, 'Play on Desktop');
    this.renderer.setAnimationLoop(() => this.loop());
  }

  // ---------- UI / sessions ----------

  bindUi() {
    this.playBtn.onclick = () => {
      if (this.state === 'paused') { if (this.input.usingPad) this.resume(); else this.input.requestPointerLock(); }
      else { this.enterFullscreen(); this.start(); }
    };
    const fsBtn = document.getElementById('fullscreenBtn');
    if (fsBtn) fsBtn.onclick = () => this.toggleFullscreen();
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

  bindSettings() {
    const bind = (id, key, parse = (v) => v) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.value = String(typeof settings[key] === 'boolean' ? (settings[key] ? 1 : 0) : settings[key]);
      el.onchange = () => { settings[key] = parse(el.value); saveSettings(); };
    };
    bind('setTurn', 'turn');
    bind('setLevel', 'level');
    bind('setVignette', 'vignette', (v) => v === '1');
    bind('setHud', 'hud');
  }

  // Rebuilds the world when the chosen level differs from the one loaded; also syncs bloom and player light.
  applyLevelLook() {
    const level = levelById(settings.level);
    if (this.world.level !== level) {
      this.world.dispose();
      this.world = new World(this.scene, level);
    }
    this.bloom.strength = level.bloom.strength;
    this.bloom.threshold = level.bloom.threshold;
    this.playerLight.intensity = level.playerLight;
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
      { kind: 'weapon', title: 'Start', sub: 'Play', desc: 'Survive 25 waves. Weapons fire on their own; you aim the revolver.', apply: () => this.start() },
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
    // the logo image stands in for the title on the main menu; other screens (paused) show text
    const isMain = title === 'VAMPIRESXR';
    document.getElementById('logo').hidden = !isMain;
    this.ovTitle.hidden = isMain;
    this.ovTitle.textContent = title;
    this.ovMsg.innerHTML = msg;
    this.playBtn.textContent = btn;
    this.overlay.classList.remove('hidden');
  }

  setupXR() {
    const holder = document.getElementById('vrButtonHolder');
    if (!navigator.xr) { holder.innerHTML = '<small>WebXR not available in this browser</small>'; return; }
    navigator.xr.isSessionSupported('immersive-vr').then((ok) => {
      if (!ok) { holder.innerHTML = '<small>No VR headset detected</small>'; return; }
      const b = document.createElement('button');
      b.textContent = 'Enter VR';
      b.onclick = async () => {
        try {
          const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] });
          await this.renderer.xr.setSession(session);
        } catch (err) { console.error('Could not start XR session', err); }
      };
      holder.appendChild(b);
    });
    this.renderer.xr.addEventListener('sessionstart', () => {
      this.hud.setMode(settings.hud);
      this.showVrMenu();
    });
    this.renderer.xr.addEventListener('sessionend', () => {
      this.state = 'menu';
      this.menu.hide();
      this.hud.setMode('camera');
      this.showOverlay('VAMPIRESXR', INTRO, 'Play on Desktop');
    });
  }

  onKey(code) {
    if (code === 'KeyF' && !this.renderer.xr.isPresenting) { this.toggleFullscreen(); return; }
    if (!this.menu.open) return;
    const m = /^(?:Digit|Numpad)([1-9])$/.exec(code);
    if (m) this.menu.pick(Number(m[1]) - 1);
    else if (code === 'Enter' || code === 'Space') { if (this.state === 'gameover') this.menu.pick(0); }
  }

  // ---------- game flow ----------

  start() {
    this.sfx.init();
    this.applyLevelLook();
    this.player.reset();
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
    this.hud.toastTimer = 0;
    this.rig.position.set(0, 0, 0);
    if (!this.renderer.xr.isPresenting) {
      this.rig.rotation.y = 0; this.input.yaw = 0; this.input.pitch = 0;
      this.input.requestPointerLock();
    }
    this.menu.hide();
    this.overlay.classList.add('hidden');
    this.clock.getDelta();
    this.state = 'playing';
    if (this.modelStatus) this.hud.toast(this.modelStatus, this.modelStatus.includes('failed') ? 8 : 3);
  }

  addWeapon(W) { this.weapons.push(new W(this)); }

  openLevelUp() {
    this.state = 'levelup';
    this.sfx.levelup();
    this.menu.show('LEVEL UP!', `Level ${this.player.level} — choose an upgrade`, getChoices(this), (item) => {
      item.apply();
      this.pendingLevels--;
      this.state = 'playing';
    }, this.renderer.xr.isPresenting);
  }

  gameOver() {
    this.state = 'gameover';
    this.sfx.die();
    const p = this.player;
    this.menu.show('YOU DIED', `Survived ${fmtTime(this.time)}  ·  Level ${p.level}  ·  ${p.kills} kills`,
      [{ kind: 'bonus', title: 'Try Again', sub: '', desc: 'The night is long. Go again.' }],
      () => this.start(), this.renderer.xr.isPresenting);
  }

  victory() {
    this.state = 'gameover';
    this.sfx.levelup();
    const p = this.player;
    this.menu.show('VICTORY!', `The Vampire Lord is dust.  ${fmtTime(this.time)}  ·  ${p.kills} kills`,
      [{ kind: 'bonus', title: 'Play Again', sub: '', desc: 'Dawn breaks. Until next night.' }],
      () => this.start(), this.renderer.xr.isPresenting);
  }

  damagePlayer(amount, effect = null) {
    this.player.hurt(amount);
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
    const died = this.enemies.damage(e, dmg);
    if (!opts.quiet) this.sfx.hit();
    this.numbers.spawn(e.x, e.t.y + 0.4, e.z, Math.round(dmg), died ? '#ffd166' : '#ffffff');
    if (died) {
      this.player.kills++;
      this.gems.spawn(e.x, e.z, e.xp ?? e.t.xp);
      if (e.t.boss) { for (let i = 0; i < 3; i++) this.gems.spawnHeal(e.x + rand(-1.5, 1.5), e.z + rand(-1.5, 1.5)); }
      else if (Math.random() < 0.05) this.gems.spawnHeal(e.x, e.z);
      this.particles.burst(e.x, e.t.y, e.z, e.t.color, e.t.boss ? 120 : 16, e.t.boss ? 8 : 4);
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
      if (this.input.consumePadStart()) {
        if (this.state === 'playing') { this.state = 'paused'; this.showOverlay('PAUSED', 'Press Start or click Resume.', 'Resume'); if (document.pointerLockElement) document.exitPointerLock(); }
        else if (this.state === 'paused') this.resume();
        else if (this.state === 'menu' && !this.menu.open) { this.enterFullscreen(); this.start(); }
      }
      if (this.state === 'gameover' && this.input.padFace === 0) { this.input.padFace = -1; this.menu.pick(0); }
      else this.input.padFace = -1;
    }
    this.updateMovement(dt, xr);
    if (this.state === 'playing') this.tick(dt);
    else if (this.menu.open) this.menu.update(xr);
    if (xr) { this.hud.setMode(settings.hud); this.updateWristAnchor(); }
    for (const w of this.weapons) w.draw(dt);
    this.gems.draw(fxTime.value, this.glow);
    this.chests.draw(fxTime.value, this.glow);
    for (const e of this.enemies.list) if (e.kind !== 'normal') this.glow.add(e.x, e.t.y * e.scale, e.z, 0.9 * e.scale, _kindColor.set(KINDS[e.kind].color), 0.7);
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
    else this.composer.render();
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
        const h = this.headPos(), d = Math.hypot(h.x, h.z);
        if (d > ARENA_RADIUS) {
          const k = ARENA_RADIUS / d;
          this.rig.position.x -= h.x * (1 - k);
          this.rig.position.z -= h.z * (1 - k);
        }
      }
    }
    // keep the player out of props (also nudges the rig if you physically lean into one in VR)
    const h = this.headPos();
    this.world.colliders.resolve(h.x, h.z, PLAYER_RADIUS, _col);
    if (_col.x !== h.x || _col.z !== h.z) { this.rig.position.x += _col.x - h.x; this.rig.position.z += _col.z - h.z; this.headPos(); }
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
    this.spawnDirector(dt);
    if (this.boss) this.boss.t.ai(this.boss, dt, this);
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
    if (contact > 0) {
      p.hurt(contact);
      if (this.hurtTimer <= 0) { this.hurtTimer = 0.35; this.hud.hurt(); this.sfx.hurt(); this.input.rumble(0.6, 0.4, 120); }
    }
    if (p.hp <= 0) { p.hp = 0; this.gameOver(); return; }
    if (this.state !== 'playing') return; // victory may have ended the run this frame
    if (this.pendingLevels > 0) { this.openLevelUp(); return; }
  }

  // A chest hands out one random upgrade from the same pool as level-ups.
  openChest() {
    const choices = getChoices(this);
    const item = choices[Math.floor(Math.random() * choices.length)];
    item.apply();
    this.hud.toast(`Chest: ${item.title} ${item.sub}`.trim(), 3);
    this.particles.burst(this.player.pos.x, 1, this.player.pos.z, 0xffd166, 40, 4);
    this.sfx.levelup();
  }

  waveInfo() {
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
    this.enemies.spawn(type, this.player.pos.x + Math.cos(angle) * dist, this.player.pos.z + Math.sin(angle) * dist, hpMul, casters);
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
