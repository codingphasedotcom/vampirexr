import { WEAPONS } from './weapons.js';
import { shuffle } from './utils.js';

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

// Builds the three cards offered on level-up.
export function getChoices(game) {
  const pool = [];
  for (const W of WEAPONS) {
    const owned = game.weapons.find((w) => w instanceof W);
    if (!owned) pool.push({ kind: 'weapon', title: W.title, sub: 'NEW', desc: W.describe(1), apply: () => game.addWeapon(W) });
    else if (!owned.maxed) pool.push({ kind: 'weapon', title: W.title, sub: `Lv ${owned.level + 1}`, desc: W.describe(owned.level + 1), apply: () => owned.upgrade() });
  }
  for (const P of PASSIVES) {
    const lvl = game.player.passives[P.id] || 0;
    if (lvl < P.max) pool.push({ kind: 'passive', title: P.title, sub: `Lv ${lvl + 1}`, desc: P.desc, apply: () => { P.apply(game.player); game.player.passives[P.id] = lvl + 1; } });
  }
  const choices = shuffle(pool).slice(0, 3);
  while (choices.length < 3) {
    choices.push({ kind: 'bonus', title: 'Roast Chicken', sub: 'Snack', desc: 'Heal 30 HP.', apply: () => game.player.heal(30) });
  }
  return choices;
}
