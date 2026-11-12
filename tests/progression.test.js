import test from 'node:test';
import assert from 'node:assert/strict';
import { UPGRADES, upgradeCost, buyUpgrade, refundAll, applyMeta, recordRun, runReward, loadMeta } from '../src/meta.js';
import { getChoices, MAX_WEAPONS, MAX_PASSIVES, PASSIVES } from '../src/upgrades.js';
import { WEAPONS, Gun, Wand } from '../src/weapons.js';
import { Player } from '../src/player.js';

const fresh = () => ({ gold: 0, up: {}, records: {}, runs: 0, kills: 0, wins: 0 });

test('crypt purchases cost gold, respect max rank and refund exactly', () => {
  const m = fresh();
  const vit = UPGRADES.find((u) => u.id === 'hp');
  assert.equal(buyUpgrade('hp', m), false, 'cannot buy without gold');
  m.gold = 10000;
  let spent = 0;
  for (let l = 0; l < vit.max; l++) { spent += upgradeCost(vit, l); assert.equal(buyUpgrade('hp', m), true); }
  assert.equal(buyUpgrade('hp', m), false, 'maxed');
  assert.equal(m.up.hp, vit.max);
  assert.equal(m.gold, 10000 - spent);
  refundAll(m);
  assert.equal(m.gold, 10000);
  assert.deepEqual(m.up, {});
});

test('costs grow with rank', () => {
  for (const u of UPGRADES) for (let l = 1; l < u.max; l++) assert.ok(upgradeCost(u, l) > upgradeCost(u, l - 1), u.id);
});

test('meta upgrades apply to a fresh player', () => {
  const m = fresh();
  m.up = { hp: 2, might: 1, growth: 2, greed: 1, revival: 1, magnet: 2 };
  const p = new Player();
  applyMeta(p, m);
  assert.equal(p.maxHp, 120);
  assert.equal(p.hp, 120);
  assert.ok(Math.abs(p.stats.damage - 1.05) < 1e-9);
  assert.ok(Math.abs(p.stats.growth - 1.12) < 1e-9);
  assert.ok(Math.abs(p.stats.greed - 1.12) < 1e-9);
  assert.equal(p.revives, 1);
  assert.equal(p.magnet, 4);
  p.addXp(10);
  assert.ok(Math.abs(p.xp - (11.2 - p.xpNeeded(1))) < 1e-9, 'growth multiplies XP');
});

test('runs bank gold and report beaten records', () => {
  const m = fresh();
  assert.deepEqual(recordRun('graveyard', { time: 300, wave: 6, kills: 500, level: 12, gold: 80 }, m), [], 'first run sets, does not "beat"');
  assert.equal(m.gold, 80);
  const beaten = recordRun('graveyard', { time: 200, wave: 7, kills: 900, level: 10, won: true, gold: 40 }, m);
  assert.deepEqual(beaten.sort(), ['kills', 'wave']);
  assert.equal(m.records.graveyard.time, 300);
  assert.equal(m.records.graveyard.wins, 1);
  assert.equal(m.runs, 2);
  assert.equal(m.gold, 120);
  assert.equal(runReward({ picked: 10.6, wave: 5 }), 26);
  assert.equal(runReward({ picked: 0, rooms: 4, won: true }), 230);
});

test('loadMeta survives missing or corrupt storage', () => {
  assert.equal(loadMeta({ getItem: () => '{bad json' }).gold, 0);
  assert.equal(loadMeta(null).gold, 0);
});

// Weapon stand-ins built from the real classes without running constructors (those need WebGL/DOM).
const fakeWeapon = (W, level = 1) => Object.assign(Object.create(W.prototype), { level, evolved: false });

test('level-up cards respect six weapon and six passive slots', () => {
  const player = new Player();
  const game = { player, weapons: WEAPONS.slice(0, MAX_WEAPONS).map((W) => fakeWeapon(W)), addWeapon() {} };
  for (let i = 0; i < 40; i++) {
    for (const c of getChoices(game)) assert.ok(!(c.kind === 'weapon' && c.sub === 'NEW WEAPON'), 'no new weapons once all slots are full');
  }
  for (const P of PASSIVES.slice(0, MAX_PASSIVES)) player.passives[P.id] = 1;
  for (let i = 0; i < 40; i++) {
    for (const c of getChoices(game)) assert.ok(!(c.kind === 'passive' && c.sub === 'NEW PASSIVE'), 'no new passives once all slots are full');
  }
  assert.equal(getChoices(game).length, 3);
});

test('a maxed weapon with its passive always offers the evolution first', () => {
  const player = new Player();
  const gun = fakeWeapon(Gun, 8), wand = fakeWeapon(Wand, 3);
  const game = { player, weapons: [gun, wand], addWeapon() {} };
  player.passives.haste = 1;
  const first = getChoices(game)[0];
  assert.equal(first.kind, 'evolve');
  assert.equal(first.title, Gun.evolution.title);
});

test('every passive pairs with exactly one weapon evolution', () => {
  const pairs = WEAPONS.filter((W) => W.evolution).map((W) => W.evolution.passive).sort();
  assert.deepEqual(pairs, PASSIVES.map((p) => p.id).sort());
});
