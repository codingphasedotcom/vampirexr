import { BOSSES } from './bosses.js';

export const ROOMS = [
  { name: 'Courtyard', z: 0, count: 30, hp: 1, tier: 2, casters: 0 },
  { name: 'Banquet Hall', z: -22, count: 48, hp: 1.5, tier: 5, casters: 0.12 },
  { name: 'Dungeon', z: -44, count: 65, hp: 2, tier: 8, casters: 0.2, boss: 'The Butcher' },
  { name: 'Throne Room', z: -66, count: 80, hp: 2.6, tier: 11, casters: 0.25, boss: 'Vampire Lord' },
];
export function roomBounds(index) { return { minX: -12.5, maxX: 12.5, minZ: ROOMS[index].z - 9.5, maxZ: ROOMS[index].z + 9.5 }; }
export function confine(point, index) {
  const b = roomBounds(index);
  point.x = Math.max(b.minX, Math.min(b.maxX, point.x));
  point.z = Math.max(b.minZ, Math.min(b.maxZ, point.z));
}

export class CastleSiege {
  constructor(game) { this.game = game; this.index = -1; this.cleared = false; this.spawned = 0; this.acc = 0; this.delay = 2; }
  get room() { return ROOMS[Math.max(0, this.index)]; }
  enter(index) {
    const g = this.game;
    this.index = index; this.cleared = false; this.spawned = 0; this.acc = 0; this.delay = 2;
    g.wave = index + 1; g.hpMul = this.room.hp;
    g.world.ambient.setGate(index - 1, false);
    g.bossFx.reset();
    g.hud.toast(`${index + 1}/4 — ${this.room.name}`, 4);
  }
  update(dt) {
    const g = this.game;
    if (this.index < 0) this.enter(0);
    if (this.cleared) {
      if (this.index < 3 && g.player.pos.z < this.room.z - 13) this.enter(this.index + 1);
      return;
    }
    this.delay -= dt;
    if (this.delay > 0) return;
    this.acc += dt * (2 + this.index);
    while (this.acc >= 1 && this.spawned < this.room.count && g.enemies.alive < 199) {
      this.acc--;
      // Clear perimeter lanes keep every encounter reachable, including ground enemies.
      const x = Math.random() < 0.5 ? -8 : 8;
      const z = this.room.z + (Math.random() * 14 - 7);
      const type = g.pickType(this.room.tier);
      const e = g.enemies.spawn(type, x, z, this.room.hp, this.room.casters, g.spawnOpts(type, this.room.tier));
      if (e) this.spawned++;
    }
    if (this.spawned < this.room.count || g.enemies.list.some(e => !e.dead)) return;
    if (this.room.boss && !this.bossSent) {
      this.bossSent = true;
      const def = BOSSES.find(b => b.name === this.room.boss);
      g.boss = g.enemies.spawnBoss(def, 0, this.room.z - 5, this.index === 3 ? 0.35 : 0.25);
      g.hud.toast(`${def.name} guards the gate!`, 4); g.sfx.roar();
      return;
    }
    this.cleared = true; this.bossSent = false;
    g.bossFx.reset();
    if (this.index === 3) { g.victory(); return; }
    g.world.ambient.setGate(this.index, true);
    g.chests.reset(); g.chests.spawn(0, this.room.z - 7);
    g.gems.spawnHeal(-2, this.room.z - 7); g.gems.spawnHeal(2, this.room.z - 7);
    g.hud.toast('Room secured! Claim treasure, then follow the green gate.', 5);
    g.sfx.levelup();
  }
  constrainPlayer(x, z) {
    // Keep physical headset movement and locomotion inside the active encounter.
    const p = { x: Math.max(-12.8, Math.min(12.8, x)), z };
    const r = this.room;
    p.z = Math.min(r.z + 9.8, Math.max(r.z - (this.cleared ? 14.5 : 9.8), z));
    if (this.cleared && p.z < r.z - 9.8) p.x = Math.max(-2.5, Math.min(2.5, p.x));
    return p;
  }
  info() {
    return { wave: this.index + 1, total: 4, remaining: Math.max(0, this.room.count - this.spawned) + this.game.enemies.list.filter(e => !e.dead).length,
      label: this.room.name, objective: this.cleared ? 'Treasure → green gate' : this.game.boss ? 'Defeat the guardian' : 'Clear the room', brk: this.cleared };
  }
}
