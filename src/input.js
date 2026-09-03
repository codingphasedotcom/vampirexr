import * as THREE from 'three';
import { clamp } from './utils.js';

// Unifies desktop (WASD + mouse look) and VR (thumbsticks + trigger) input.
export class Input {
  constructor(renderer, rig, dom) {
    this.dom = dom;
    this.keys = new Set();
    this.yaw = 0; this.pitch = 0;
    this.clickPressed = false;
    this.snapReady = true;
    this.onKey = null;
    this.onUnlockedClick = null;

    window.addEventListener('keydown', (e) => { this.keys.add(e.code); this.onKey?.(e.code); });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    dom.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== dom) return;
      this.yaw -= e.movementX * 0.0022;
      this.pitch = clamp(this.pitch - e.movementY * 0.0022, -1.45, 1.45);
    });
    dom.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (document.pointerLockElement === dom) this.clickPressed = true;
      else this.onUnlockedClick?.();
    });

    this.controllers = [];
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

      const c = { obj, laser, source: null, hand: null, selectEdge: false };
      obj.addEventListener('connected', (e) => { c.source = e.data; c.hand = e.data.handedness; });
      obj.addEventListener('disconnected', () => { c.source = null; c.hand = null; });
      obj.addEventListener('selectstart', () => { c.selectEdge = true; });
      this.controllers.push(c);
    }
  }

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

  // {x: strafe, y: forward}, each in [-1, 1]
  getMove(xr) {
    if (xr) {
      const a = this.axes('left') || this.axes('right');
      if (!a) return { x: 0, y: 0 };
      const dz = 0.15;
      return { x: Math.abs(a.x) > dz ? a.x : 0, y: Math.abs(a.y) > dz ? -a.y : 0 };
    }
    let x = 0, y = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    const l = Math.hypot(x, y);
    return l > 1 ? { x: x / l, y: y / l } : { x, y };
  }

  // -1 / 0 / 1, edge-triggered on the right stick
  getSnapTurn() {
    if (!this.axes('left')) return 0; // single-controller setups use the one stick to move
    const a = this.axes('right');
    if (!a) return 0;
    if (Math.abs(a.x) < 0.6) { this.snapReady = true; return 0; }
    if (!this.snapReady) return 0;
    this.snapReady = false;
    return Math.sign(a.x);
  }

  consumeSelect() {
    let hit = null;
    for (const c of this.controllers) if (c.selectEdge) { c.selectEdge = false; hit = c; }
    return hit;
  }

  consumeClick() { const v = this.clickPressed; this.clickPressed = false; return v; }
}
