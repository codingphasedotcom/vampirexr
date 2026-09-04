import * as THREE from 'three';
import { rand } from './utils.js';

const GOLD = new THREE.Color(0xffd166);
const MAX = 3;

// Treasure chests scattered around the arena. Walk into one for a free upgrade.
// A tall golden beam marks each so it can be spotted through the fog.
export class Chests {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.wood = new THREE.MeshLambertMaterial({ color: 0x6b4a2a });
    this.trim = new THREE.MeshLambertMaterial({ color: 0xd4a017, emissive: 0x4a3600 });
  }

  spawn(x, z) {
    if (this.list.length >= MAX) return null;
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.42, 0.45), this.wood); body.position.y = 0.21;
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.08, 0.47), this.trim); band.position.y = 0.21;
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.16, 0.45), this.wood); lid.position.y = 0.5;
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.06), this.trim); lock.position.set(0, 0.4, 0.25);
    g.add(body, band, lid, lock);
    g.position.set(x, 0, z);
    g.rotation.y = rand(0, Math.PI * 2);
    this.scene.add(g);
    const c = { g, x, z, phase: rand(0, 6.28) };
    this.list.push(c);
    return c;
  }

  // Returns the number of chests opened this frame.
  update(dt, player, onOpen) {
    let opened = 0, w = 0;
    for (const c of this.list) {
      if (Math.hypot(c.x - player.pos.x, c.z - player.pos.z) < 1.2) {
        this.scene.remove(c.g);
        onOpen(c);
        opened++;
        continue;
      }
      this.list[w++] = c;
    }
    this.list.length = w;
    return opened;
  }

  draw(time, glow) {
    for (const c of this.list) {
      c.g.position.y = Math.sin(time * 2 + c.phase) * 0.05;
      c.g.rotation.y += 0.004;
      glow.add(c.x, 0.5, c.z, 1.2, GOLD, 0.6);
      for (let k = 0; k < 26; k++) glow.add(c.x, 0.7 + k * 0.32, c.z, 1.1, GOLD, 0.32 * (1 - k / 26));
    }
  }

  reset() {
    for (const c of this.list) this.scene.remove(c.g);
    this.list.length = 0;
  }
}
