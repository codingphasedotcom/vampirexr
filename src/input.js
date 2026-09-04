import * as THREE from 'three';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';
import { clamp } from './utils.js';

// Unifies desktop (WASD + mouse look) and VR (thumbsticks + trigger) input.
export class Input {
  constructor(renderer, rig, dom) {
    this.dom = dom;
    this.keys = new Set();
    this.yaw = 0; this.pitch = 0;
    this.clickPressed = false;
    this.mouseDown = false; // left button held while pointer-locked (desktop gun)
    // desktop gamepad (standard mapping): left stick move, right stick look, RT fire, A select, Start pause
    this.pad = null;
    this.padFire = false;
    this.padSelectEdge = false;
    this.padStartEdge = false;
    this.padNav = 0; // -1 / +1 edge from d-pad or bumpers, for cycling menu cards
    this.usingPad = false;
    this._padHeld = {};
    this.onKey = null;
    this.onUnlockedClick = null;
    this.onHands = null;
    this.handsSeen = false;
    // arm-swing locomotion state (hand tracking without controllers)
    this.swing = 0;
    this.swingMove = 0;
    this.snapReady = true;

    window.addEventListener('keydown', (e) => { this.keys.add(e.code); this.onKey?.(e.code); });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    dom.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== dom) return;
      this.yaw -= e.movementX * 0.0022;
      this.pitch = clamp(this.pitch - e.movementY * 0.0022, -1.45, 1.45);
    });
    dom.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (document.pointerLockElement === dom) { this.clickPressed = true; this.mouseDown = true; }
      else this.onUnlockedClick?.();
    });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) this.mouseDown = false; });
    document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement !== dom) this.mouseDown = false; });

    this.controllers = [];
    this.hands = [];
    const handFactory = new XRHandModelFactory();
    for (let i = 0; i < 2; i++) {
      const obj = renderer.xr.getController(i);
      const laser = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]),
        new THREE.LineBasicMaterial({ color: 0xff4d6d }),
      );
      laser.scale.z = 6;
      laser.visible = false;
      obj.add(laser);
      rig.add(obj);

      const grip = renderer.xr.getControllerGrip(i);
      grip.add(new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.028, 0.12, 10).rotateX(Math.PI / 2),
        new THREE.MeshLambertMaterial({ color: 0x3a3550 }),
      ));
      rig.add(grip);

      // tracked hands render as simple spheres; no external model files needed
      const hand = renderer.xr.getHand(i);
      hand.add(handFactory.createHandModel(hand, 'spheres'));
      rig.add(hand);
      this.hands.push(hand);

      const c = { obj, grip, hand3d: hand, laser, source: null, hand: null, selectEdge: false, selecting: false, prev: null, menuHeld: false };
      obj.addEventListener('connected', (e) => {
        c.source = e.data; c.hand = e.data.handedness;
        if (e.data.hand && !this.handsSeen) { this.handsSeen = true; this.onHands?.(); }
      });
      obj.addEventListener('disconnected', () => { c.source = null; c.hand = null; });
      obj.addEventListener('selectstart', () => { c.selectEdge = true; c.selecting = true; });
      obj.addEventListener('selectend', () => { c.selecting = false; });
      this.controllers.push(c);
    }
  }

  // Poll the first connected standard gamepad. Call once per frame (desktop only).
  pollGamepad(dt) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null;
    for (const g of pads) if (g && g.connected && g.mapping === 'standard') { gp = g; break; }
    if (!gp) for (const g of pads) if (g && g.connected) { gp = g; break; }
    this.pad = gp;
    if (!gp) { this.padFire = false; return; }
    const a = gp.axes, b = gp.buttons;
    const dz = (v) => (Math.abs(v) > 0.15 ? v : 0);
    const lx = dz(a[0] || 0), ly = dz(a[1] || 0), rx = dz(a[2] || 0), ry = dz(a[3] || 0);
    const pressed = (i) => !!(b[i] && (b[i].pressed || b[i].value > 0.5));
    const edge = (name, now) => { const was = this._padHeld[name]; this._padHeld[name] = now; return now && !was; };
    if (lx || ly || rx || ry || b.some((x) => x.pressed)) this.usingPad = true;
    this.padMove = { x: lx, y: -ly };
    // right stick look: yaw 150°/s, pitch 100°/s at full tilt, with a gentle curve
    this.yaw -= rx * Math.abs(rx) * 2.6 * dt;
    this.pitch = clamp(this.pitch - ry * Math.abs(ry) * 1.8 * dt, -1.45, 1.45);
    this.padFire = pressed(7) || pressed(5); // RT or RB
    if (edge('select', pressed(0))) this.padSelectEdge = true; // A / Cross
    if (edge('start', pressed(9))) this.padStartEdge = true;
    const nav = (pressed(15) || pressed(5) ? 1 : 0) - (pressed(14) || pressed(4) ? 1 : 0);
    if (edge('nav', nav !== 0)) this.padNav = nav;
    for (let i = 0; i < 4; i++) if (edge('face' + i, pressed(i))) this.padFace = i; // A B X Y edges for menus
  }

  rumble(strong = 0.6, weak = 0.3, ms = 80) {
    const act = this.pad?.vibrationActuator;
    if (act?.playEffect) act.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }).catch(() => {});
  }

  consumePadSelect() { const v = this.padSelectEdge; this.padSelectEdge = false; return v; }
  consumePadStart() { const v = this.padStartEdge; this.padStartEdge = false; return v; }
  consumePadNav() { const v = this.padNav; this.padNav = 0; return v; }

  requestPointerLock() {
    try { this.dom.requestPointerLock()?.catch?.(() => {}); } catch { /* ignore */ }
  }

  setLasers(visible) { for (const c of this.controllers) c.laser.visible = visible; }

  axes(hand) {
    const c = this.controllers.find((c) => c.hand === hand && c.source?.gamepad);
    if (!c) return null;
    const a = c.source.gamepad.axes;
    // Quest/Touch report the thumbstick on axes 2/3; fall back to 0/1 for other controllers.
    return { x: a.length >= 4 ? a[2] : a[0] || 0, y: a.length >= 4 ? a[3] : a[1] || 0 };
  }

  get usingHands() { return this.controllers.some((c) => c.source?.hand); }

  // Arm-swing locomotion: wrist speed (in play-space coordinates, so rig movement doesn't count)
  // is smoothed and mapped to a forward speed. Call every XR frame.
  updateArmSwing(dt) {
    let total = 0, n = 0;
    for (let i = 0; i < 2; i++) {
      const c = this.controllers[i];
      const wrist = this.hands[i].joints?.wrist;
      if (!c.source?.hand || !wrist || !wrist.visible) { c.prev = null; continue; }
      if (c.prev) { total += c.prev.distanceTo(wrist.position) / Math.max(dt, 1e-3); n++; }
      else c.prev = new THREE.Vector3();
      c.prev.copy(wrist.position);
    }
    const raw = n ? total / n : 0;
    this.swing += (raw - this.swing) * Math.min(1, dt * 6);
    this.swingMove = clamp((this.swing - 0.45) / 1.6, 0, 1);
  }

  // {x: strafe, y: forward}, each in [-1, 1]
  getMove(xr) {
    if (xr) {
      const a = this.axes('left') || this.axes('right');
      if (!a) return { x: 0, y: this.swingMove }; // no thumbstick: arm swing drives forward motion
      const dz = 0.15;
      return { x: Math.abs(a.x) > dz ? a.x : 0, y: Math.abs(a.y) > dz ? -a.y : 0 };
    }
    let x = 0, y = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (!x && !y && this.padMove) { x = this.padMove.x; y = this.padMove.y; }
    const l = Math.hypot(x, y);
    return l > 1 ? { x: x / l, y: y / l } : { x, y };
  }

  // -1 / 0 / 1, edge-triggered on the right stick (snap-turn mode)
  getSnapTurn() {
    if (!this.axes('left')) return 0;
    const a = this.axes('right');
    if (!a) return 0;
    if (Math.abs(a.x) < 0.6) { this.snapReady = true; return 0; }
    if (!this.snapReady) return 0;
    this.snapReady = false;
    return Math.sign(a.x);
  }

  // Edge-triggered press of X/Y/A/B on either controller (pause / menu).
  getMenuPress() {
    let pressed = false;
    for (const c of this.controllers) {
      const b = c.source?.gamepad?.buttons;
      const now = !!(b && ((b[4] && b[4].pressed) || (b[5] && b[5].pressed)));
      if (now && !c.menuHeld) pressed = true;
      c.menuHeld = now;
    }
    return pressed;
  }

  // Right stick x in [-1, 1] for smooth turning (0 inside the deadzone).
  getTurnAxis() {
    if (!this.axes('left')) return 0; // single-controller setups use the one stick to move
    const a = this.axes('right');
    if (!a) return 0;
    const dz = 0.2;
    if (Math.abs(a.x) < dz) return 0;
    const v = (Math.abs(a.x) - dz) / (1 - dz);
    return Math.sign(a.x) * v * v; // quadratic curve: fine control near centre, fast at full tilt
  }

  consumeSelect() {
    let hit = null;
    for (const c of this.controllers) if (c.selectEdge) { c.selectEdge = false; hit = c; }
    return hit;
  }

  consumeClick() { const v = this.clickPressed; this.clickPressed = false; return v; }

  // Called after a menu pick so the same press doesn't immediately fire the gun.
  clearSelecting() { for (const c of this.controllers) c.selecting = false; this.mouseDown = false; this.padFire = false; this.padSelectEdge = false; }
}
