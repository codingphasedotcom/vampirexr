import { WEAPONS } from './weapons.js';
import { shuffle } from './utils.js';

// Build slots, Vampire Survivors-style: a run can hold six weapons (Revolver and Arcane Bolt included) and six
// passives, so every NEW card is a real choice.
export const MAX_WEAPONS = 6;
export const MAX_PASSIVES = 6;

export const PASSIVES = [
  { id: 'might',  title: 'Might',        desc: '+15% weapon damage.',            max: 5, apply: (p) => { p.stats.damage += 0.15; } },
  { id: 'haste',  title: 'Haste',        desc: 'Weapons fire 10% faster.',       max: 5, apply: (p) => { p.stats.cooldown *= 0.9; } },
  { id: 'vigor',  title: 'Vigor',        desc: '+20 max HP and heal 20.',        max: 5, apply: (p) => { p.maxHp += 20; p.heal(20); } },
  { id: 'swift',  title: 'Swiftness',    desc: '+10% movement speed.',           max: 5, apply: (p) => { p.speed *= 1.1; } },
  { id: 'magnet', title: 'Magnet',       desc: '+1m gem pickup range.',          max: 5, apply: (p) => { p.magnet += 1; } },
  { id: 'reach',  title: 'Reach',        desc: '+12% weapon area.',              max: 5, apply: (p) => { p.stats.area += 0.12; } },
  { id: 'regen',  title: 'Regeneration', desc: 'Recover 0.6 HP every second.',   max: 5, apply: (p) => { p.stats.regen += 0.6; } },
  { id: 'armor',  title: 'Armor',        desc: 'Take 8% less damage.',           max: 5, apply: (p) => { p.stats.armor += 0.08; } },
];

const passiveTitle = (id) => PASSIVES.find((p) => p.id === id)?.title ?? id;
// Card hints: which passive a weapon evolves with, and which weapons a passive evolves.
export const evolvesWith = (W) => (W.evolution ? passiveTitle(W.evolution.passive) : null);
export const evolves = (P) => WEAPONS.filter((W) => W.evolution?.passive === P.id).map((W) => W.title);

// A maxed weapon plus its paired passive (any level) unlocks an evolution.
export function evolutionChoices(game) {
  const out = [];
  for (const w of game.weapons) {
    const W = w.constructor, E = W.evolution;
    if (!E || w.evolved || !w.maxed || !(game.player.passives[E.passive] > 0)) continue;
    out.push({ kind: 'evolve', icon: W.id, title: E.title, sub: 'EVOLUTION', desc: E.desc, hint: `${W.title} + ${passiveTitle(E.passive)}`,
      apply: () => { w.evolve(); game.onEvolve?.(w, E); } });
  }
  return out;
}

// Snack / treasure cards that pad the hand once the build is complete.
function bonusCards(game) {
  return [
    { kind: 'bonus', icon: 'chicken', title: 'Roast Chicken', sub: 'SNACK', desc: 'Heal 30 HP.', apply: () => game.player.heal(30) },
    { kind: 'bonus', icon: 'gold', title: 'Gold Pouch', sub: 'TREASURE', desc: '+25 gold to spend in the Crypt.', apply: () => game.addGold?.(25) },
  ];
}

// Builds the three cards offered on level-up; an available evolution always takes the first slot.
export function getChoices(game) {
  const evolutions = evolutionChoices(game);
  const pool = [];
  const weaponSlots = game.weapons.length < MAX_WEAPONS, passiveSlots = Object.keys(game.player.passives).length < MAX_PASSIVES;
  for (const W of WEAPONS) {
    const owned = game.weapons.find((w) => w instanceof W);
    const hint = W.evolution ? `Evolves with ${evolvesWith(W)}` : '';
    if (!owned && weaponSlots) pool.push({ kind: 'weapon', icon: W.id, title: W.title, sub: 'NEW WEAPON', level: 1, max: W.maxLevel, desc: W.describe(1), hint, apply: () => game.addWeapon(W) });
    else if (owned && !owned.maxed) pool.push({ kind: 'weapon', icon: W.id, title: W.title, sub: 'WEAPON', level: owned.level + 1, max: W.maxLevel, desc: W.describe(owned.level + 1), hint, apply: () => owned.upgrade() });
  }
  for (const P of PASSIVES) {
    const lvl = game.player.passives[P.id] || 0;
    if (lvl >= P.max || (!lvl && !passiveSlots)) continue;
    const ev = evolves(P);
    pool.push({ kind: 'passive', icon: P.id, title: P.title, sub: lvl ? 'PASSIVE' : 'NEW PASSIVE', level: lvl + 1, max: P.max, desc: P.desc,
      hint: ev.length ? `Evolves ${ev.join(' & ')}` : '', apply: () => { P.apply(game.player); game.player.passives[P.id] = lvl + 1; } });
  }
  const choices = [...evolutions.slice(0, 1), ...shuffle(pool)].slice(0, 3);
  const extras = bonusCards(game);
  while (choices.length < 3) choices.push(extras[choices.length % extras.length]);
  return choices;
}
