import * as THREE from 'three';

export class Player {
  constructor() {
    this.pos = new THREE.Vector3(); // head position projected onto the floor
    this.reset();
  }

  reset() {
    this.maxHp = 100; this.hp = 100;
    this.speed = 4.2;
    this.magnet = 3;
    this.xp = 0; this.level = 1; this.xpToNext = this.xpNeeded(1);
    this.kills = 0;
    this.stats = { damage: 1, cooldown: 1, area: 1, regen: 0, armor: 0 };
    this.passives = {};
  }

  xpNeeded(l) { return Math.floor(4 + l * 3 + l * l * 0.4); }

  // Returns how many levels were gained (can be >1 on a big pickup).
  addXp(v) {
    this.xp += v;
    let gained = 0;
    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.level++;
      this.xpToNext = this.xpNeeded(this.level);
      gained++;
    }
    return gained;
  }

  hurt(d) { this.hp -= d * (1 - this.stats.armor); }
  heal(v) { this.hp = Math.min(this.maxHp, this.hp + v); }
}
