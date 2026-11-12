// Persistent meta-progression: gold carried between runs, permanent Crypt upgrades, and per-battlefield records.
// Saved per browser in localStorage (`survivorxr.meta`). Pure logic (no DOM), so it is unit-testable in Node.
const KEY = 'survivorxr.meta';

// Each upgrade's `apply(player, level)` runs on the fresh player at the start of every run.
export const UPGRADES = [
  { id: 'hp',       icon: 'vigor',   title: 'Vitality',      desc: '+10% max health per rank.',           max: 5, base: 100, apply: (p, l) => { p.maxHp = Math.round(p.maxHp * (1 + 0.1 * l)); p.hp = p.maxHp; } },
  { id: 'might',    icon: 'might',   title: 'Bloodlust',     desc: '+5% damage per rank.',                max: 5, base: 150, apply: (p, l) => { p.stats.damage += 0.05 * l; } },
  { id: 'armor',    icon: 'armor',   title: 'Iron Hide',     desc: '-3% damage taken per rank.',          max: 3, base: 180, apply: (p, l) => { p.stats.armor += 0.03 * l; } },
  { id: 'speed',    icon: 'swift',   title: 'Fleet Foot',    desc: '+5% move speed per rank.',            max: 3, base: 140, apply: (p, l) => { p.speed *= 1 + 0.05 * l; } },
  { id: 'cooldown', icon: 'haste',   title: 'Quick Hands',   desc: '-3% weapon cooldowns per rank.',      max: 3, base: 220, apply: (p, l) => { p.stats.cooldown *= 1 - 0.03 * l; } },
  { id: 'area',     icon: 'reach',   title: 'Wide Ward',     desc: '+5% weapon area per rank.',           max: 3, base: 160, apply: (p, l) => { p.stats.area += 0.05 * l; } },
  { id: 'magnet',   icon: 'magnet',  title: 'Attraction',    desc: '+0.5 m pickup range per rank.',       max: 3, base: 90,  apply: (p, l) => { p.magnet += 0.5 * l; } },
  { id: 'regen',    icon: 'regen',   title: 'Recovery',      desc: '+0.15 HP per second per rank.',       max: 3, base: 160, apply: (p, l) => { p.stats.regen += 0.15 * l; } },
  { id: 'growth',   icon: 'growth',  title: 'Growth',        desc: '+6% experience per rank.',            max: 5, base: 180, apply: (p, l) => { p.stats.growth += 0.06 * l; } },
  { id: 'greed',    icon: 'gold',    title: 'Greed',         desc: '+12% gold per rank.',                 max: 5, base: 110, apply: (p, l) => { p.stats.greed += 0.12 * l; } },
  { id: 'revival',  icon: 'revival', title: 'Second Chance', desc: 'Rise once per run at half health, blasting nearby foes away.', max: 1, base: 900, apply: (p, l) => { p.revives += l; } },
];

export const upgradeCost = (u, level) => Math.round((u.base * (1 + level * 0.75)) / 5) * 5;

function fresh() { return { gold: 0, up: {}, records: {}, runs: 0, kills: 0, wins: 0 }; }

export function loadMeta(storage = globalThis.localStorage) {
  const m = fresh();
  try { Object.assign(m, JSON.parse(storage?.getItem(KEY) || '{}')); } catch { /* private mode / bad data */ }
  m.up ??= {}; m.records ??= {};
  return m;
}

export const meta = loadMeta();

export function saveMeta(m = meta, storage = globalThis.localStorage) {
  try { storage?.setItem(KEY, JSON.stringify(m)); } catch { /* ignore */ }
}

export const rank = (id, m = meta) => m.up[id] || 0;

// Buys one rank. Returns false when maxed or too expensive.
export function buyUpgrade(id, m = meta) {
  const u = UPGRADES.find((x) => x.id === id);
  if (!u) return false;
  const l = rank(id, m);
  if (l >= u.max) return false;
  const c = upgradeCost(u, l);
  if (m.gold < c) return false;
  m.gold -= c;
  m.up[id] = l + 1;
  return true;
}

// Refund everything bought (lets players try other builds).
export function refundAll(m = meta) {
  for (const u of UPGRADES) for (let l = rank(u.id, m) - 1; l >= 0; l--) m.gold += upgradeCost(u, l);
  m.up = {};
}

export function applyMeta(player, m = meta) {
  for (const u of UPGRADES) { const l = rank(u.id, m); if (l) u.apply(player, l); }
}

// Gold for a finished run: everything picked up plus a completion bonus. `won` adds a victory purse.
export function runReward({ picked = 0, wave = 0, rooms = 0, won = false }) {
  return Math.round(picked + wave * 3 + rooms * 20 + (won ? 150 : 0));
}

// Records the run, banks the gold and returns which records were beaten.
export function recordRun(levelId, run, m = meta) {
  const r = m.records[levelId] ??= { time: 0, wave: 0, kills: 0, level: 0, wins: 0 };
  const beaten = [];
  for (const k of ['time', 'wave', 'kills', 'level']) if ((run[k] || 0) > r[k]) { if (r[k] > 0) beaten.push(k); r[k] = run[k]; }
  if (run.won) { r.wins++; m.wins++; }
  m.runs++; m.kills += run.kills || 0;
  m.gold += run.gold || 0;
  return beaten;
}
