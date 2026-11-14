# VampiresXR — Architecture & Handover Guide

> **Keep this file current.** Any change to gameplay rules, module responsibilities, asset pipeline, controls, or deploy flow
> must be reflected here in the same commit. This is the document a new engineer (human or LLM) reads first.
> Last updated: 2026-11-13 (VR seated height: `settings.height` lifts a seated player's eyes to 1.6 m; the first VR menu
> waits for a real headset pose — §4). Previous: 2026-11-11 v3 overhaul (baked lighting, procedural sky,
> decals/ribbons/instanced numbers, 3 new weapons, relics, gold + Crypt meta-progression, revival, icon cards/HUD build row,
> banners, hit-stop, spatial audio, VR haptics).

## 1. What the game is

A Vampire Survivors–style horde survival game built with **Three.js (r185) + WebXR**, playable in a **VR headset** (Quest,
controllers or hand tracking), on **desktop** (keyboard+mouse or gamepad), with an anime art style. 25 waves, five bosses,
auto-firing weapons plus a player-aimed revolver (eight weapons, each with an evolution), level-ups with six weapon / six
passive slots, chests, floor relics, three survival levels and Castle Siege. Gold earned in runs buys permanent upgrades in
the Crypt (§17). No backend, no build-time codegen: Vite + vanilla ES modules.

- **Live site:** https://vampirexr.vercel.app (Vercel auto-deploys `main` of `github.com/codingphasedotcom/vampirexr`).
- **Local dev:** `npm run dev` (http://localhost:5173). `npm run dev:vr` serves HTTPS on the LAN for a headset, but the user
  tests on the Vercel URL instead — **every change must be committed and pushed to `main`.**
- **Build:** `npm run build` (Vite → `dist/`). `public/` (models, images) is copied verbatim.

## 2. Repository map

```
index.html            #title (built by src/title.js), #overlay (in-game pause only), crosshair, all front-end CSS
vite.config.js        basic-ssl only when SSL=1
scripts/optimize-glb.sh   gltf-transform: 1K WebP textures + meshopt → public/models/*.glb (~300 KB each)
public/models/*.glb   10 AI-generated anime models + 4 boss attack clips (`*_attack.glb`, see §9)
public/img/           logo.png (black bg, alpha-keyed at runtime), keyart.jpg
docs/ARCHITECTURE.md  this file
CLAUDE.md             working rules for AI agents (deploy, testing, docs)

src/main.js           creates `new Game()` and exposes `window.game` (used for headless testing)
src/game.js           THE orchestrator: renderer/XR setup, state machine, wave director, menus, damage routing, per-frame loop
src/settings.js       persisted prefs (localStorage `survivorxr.settings`): turn, turnSpeed, vignette, hud, level, music, view,
                      numbers, shake, height; `EYE_HEIGHT` (1.6 m) and `seatedLift()` for seated VR (§4)
src/meta.js           persistent meta-progression (localStorage `survivorxr.meta`): gold, Crypt UPGRADES, records (§17)
src/pickups.js        floor pickups: gold coins/bags + relics (Vampire Magnet, Holy Bomb, Frozen Hourglass, Roast Chicken),
                      shock rings
src/icons.js          procedural canvas icon set (weapons, passives, relics, Crypt) for cards, HUD row, title, pause screen
src/avatar.js         HunterAvatar: procedural toon gunslinger shown only in top-down (walk cycle, aims, recoil)
src/title.js          console-style desktop front end: splash, main menu, battlefield preview (+ records), the Crypt shop,
                      settings, how-to (keys/mouse/gamepad)
src/toon.js           cel-shading ramp, rim light, ink outlines (`toonShader`, `makeOutline`), stepped matcap for the revolver
src/shadows.js        BlobShadows: one instanced draw of soft discs under creatures, chests and the player
src/music.js          procedural soundtrack (Am–F–Dm–E), layers scale with `intensity`
src/input.js          keyboard/mouse, XR controllers + hands (arm-swing locomotion), desktop gamepad
src/player.js         HP/XP/level/stats/passives; MAX_LEVEL = 30
src/enemies.js        ENEMY_TYPES, KINDS (fire/ice), EnemyManager (instanced horde + boss meshes, grid, movement, contact dmg)
src/creatures.js      procedural low-poly fallback models + shader animation material (FLAP / SHAMBLE / WAVE)
src/models.js         GLB loading, normalization, vertex-animation-texture (VAT) baking, VAT material
src/bosses.js         BOSSES defs + AI (dive, shockwave, ranged, teleport, charge, summon), BossFx (enemy projectiles, rings)
src/weapons.js        Weapon base + Gun (player-aimed), Wand, Orbs, Aura, Lightning, HolyWater, Cross, FrostNova; WEAPONS list
src/upgrades.js       PASSIVES, MAX_WEAPONS / MAX_PASSIVES (6/6), getChoices() (level-up / chest card pool with icon/level/hint)
src/gems.js           XP gems + red health orbs (instanced, magnet pull)
src/chests.js         treasure chests with light beams (walk-in → free random upgrade)
src/world.js          Colliders, LightBake (baked shadows + light pools, §16), World (procedural sky dome, ground blend,
                      lights, clouds from a level def), Drifters, Weather, Flames, GroundFog
src/levels/*.js       graveyard (night), village (day), city (night) — props with colliders; index.js exports LEVELS
src/hud.js            camera-locked or wrist HUD canvas (bars, wave, gold, build icon row), toasts, hurt/low-HP/glow
                      vignette, comfort vignette; Banner (big wave / boss / evolution title cards)
src/minimap.js        radar (forward-up), camera-fixed top-right
src/menu.js           world-space card menu (VR ray/pinch, desktop gaze+click/keys/gamepad), icon cards with level pips and
                      evolution hints, entrance animation, 1 or 2 rows, logo + key art dressing
src/fx.js             GlowLayer (additive point sprites), Ribbons (camera-facing additive strips), Decals (ground splats /
                      scorches / cracks), DamageNumbers (instanced digit atlas), glowTexture, noiseTexture, fxTime
src/particles.js      pooled additive particles (death bursts, hits)
src/sfx.js            WebAudio SFX: oscillators + filtered noise, reverb send, stereo panning by world position, pickup pitch
                      ladder (no audio assets)
src/utils.js          rand/clamp/pick/shuffle/fmtTime/canvas helpers
```

## 3. Frame loop & state machine (`game.js`)

`renderer.setAnimationLoop(loop)`; `dt` is clamped to 50 ms. States: `menu | playing | levelup | gameover | paused`.
**Game time scale:** `freeze(sec)` (hit-stop) and `slowMo(sec, scale)` produce `gdt = dt · scale`; `tick`, weapon `draw`,
particles and damage numbers use `gdt`, while player movement, head tracking, HUD, music and banners always use real `dt`
(so VR comfort is unaffected). Hit-stop: elite kill 0.07 s, big hit on the player 0.05 s, evolution 0.15 s, Holy Bomb 0.12 s;
slow motion 0.25× for 1.8 s on a boss kill and 0.3× for 1.2 s on a revive.

Per frame (`loop()`):
0. VR boot: from `sessionstart` until the first frame with a headset pose, `bootVR()` waits (`vrBoot`), then measures the
   seated lift, syncs the camera to the headset (`renderer.xr.updateCamera`) and only then shows the VR main menu (§4).
1. `fxTime += dt` (wall clock for ambient shaders; `this.time` is *game* time and only advances while `playing`).
2. `glow.begin()` / `ribbons.begin(head)` — every glow / ribbon consumer pushes geometry during the frame; `end()` uploads
   only the used prefix once (`addUpdateRange`).
3. VR: X/Y/A/B pause toggle, grip = dash. Desktop: `input.pollGamepad(dt)`; while the title is visible gamepad `uiEvents`
   (up/down/left/right/accept/back/any) go to `title.action()`; otherwise Start pause, A resume/restart, B dash. Music intensity
   eases toward 0.15 (menu) … 1.0 (boss + full horde).
4. `updateMovement(dt, xr)` — rig movement, turning, prop collision, comfort vignette, `player.pos` (head projected to floor).
5. If `playing` → `tick(dt)`; else if a menu is open → `menu.update(xr)`.
6. Always: weapon `draw()`, gems/chests draw, caster glows, particles, damage numbers, world ambience, player light, HUD,
   minimap, wrist anchor (VR).
7. Render: XR → `renderer.render()` (no post). Desktop → skipped while the title covers the canvas, else camera shake then
   `composer.render()`: RenderPass into a 4× MSAA half-float target → OutputPass → GradeShader (saturation, contrast, level tint,
   vignette, red chromatic pulse when hurt, faint grain). **No bloom** (removed at the user's request).

`tick(dt)`: time → `spawnDirector` → boss AI (skipped while the boss is frozen) → `enemies.update` (returns contact damage) →
weapons `update` → `bossFx.update` → gems → chests → pickups → regen → contact damage (rumble/vignette throttled) → death check
(a `player.revives` charge triggers `revive()` instead of `gameOver()`) → victory check → level-up check.
Also per frame: `decals.update` (collapses expired decals), `banner.update`, `hud.layout`, sky follows the camera
(`world.update(..., camPos)`), spatial-audio listener (`sfx.setListener`), low-HP heartbeat (<30% HP), `music.boss` flag.

Menus are the same `Menu` class everywhere: `menu.show(title, sub, items, onPick, xr, {logo, art})`; each item has
`{kind, title, sub, desc, apply}`. VR: point + trigger/pinch. Desktop: gaze at card + click/A, or keys 1–9, D-pad cycles.

## 4. Player, movement, input

- The **rig** (`THREE.Group`) moves; the camera sits inside it (desktop: yaw on rig, pitch on camera; XR: headset drives camera).
  `player.pos` = head world position projected to y = 0. Turning rotates the rig **around the head** (`rotateRig`).
- **Eye height.** Desktop: the camera sits at `EYE_HEIGHT` = 1.6 m inside the rig. VR uses the `local-floor` reference space and
  three.js replaces the camera pose with rig × headset pose, so the view is the player's *real* eye height above the Quest's
  floor (a seated player sees from ~1.1–1.3 m, under monsters that are 1.7–4 m tall). The rig stays at y = 0 (movement, dash,
  turning, collisions and siege bounds only touch x/z) except in **seated VR** (`settings.height = 'seated'`):
  `calibrateHeight()` reads this frame's left-eye height (`eyeHeight()` = `renderer.xr.getCamera().position.y`, independent of
  the rig) and `seatedLift(eye)` raises the rig by `1.6 − eye` — never lowers anyone, rejects readings under 0.3 m, caps at
  1.2 m. It is measured on entering VR (`bootVR`) and whenever the VR Height card is switched to Seated; `start()` keeps it
  (`eyeLift()`), `sessionend` drops it. Controllers and hands are rig children, so they rise with the head.
- **VR session start:** `sessionstart` fires before the first headset frame, while the camera still holds the desktop pose
  (1.6 m, or 13.5 m up and 8.5 m back after a top-down run). So it only sets `vrBoot`; `bootVR()` waits for a viewer pose,
  calls `applyView()` (drops top-down leftovers: scenery cutaway, reticle, cursor), applies the seated lift, syncs the camera
  with `renderer.xr.updateCamera(camera)` and then calls `showVrMenu()`, which places the cards in front of the real head.
- **VR controllers:** left stick move (relative to head yaw), right stick turn (smooth 120°/s with quadratic curve, or snap 45°
  per `settings.turn`), trigger = shoot / select, X/Y/A/B = pause.
- **Hand tracking:** `Input.updateArmSwing` — smoothed wrist speed → forward speed (threshold 0.45 m/s, full at ~2 m/s); pinch
  = select/shoot (WebXR fires select events on pinch).
- **Desktop:** WASD + pointer-locked mouse; hold LMB to shoot; F = fullscreen; Esc → paused overlay (unless a gamepad is active).
- **Gamepad (standard mapping):** left stick move, right stick look, RT/RB fire, A select/start/resume, Start pause, D-pad/bumpers
  cycle menu cards, rumble on shots/hits. `input.usingPad` suppresses the pointer-lock-lost pause.
- **Collision:** `world.colliders.resolve(x, z, PLAYER_RADIUS=0.35)` pushes the head out of props and shifts the rig by the delta.
  Ground enemies use the same resolver (flyers ignore it). Arena is clamped to radius 90.
- **Slow effect:** ice projectiles set `slowUntil = time + 2` → movement × 0.55.
- **Dash** (`tryDash`, `DASH` constant): Shift / gamepad B / VR grip. 22 m/s for 0.2 s (~4.5 m) along the last move direction (or
  facing), 0.45 s invulnerability (`invulnUntil` gates contact damage and `damagePlayer`), 1.6 s cooldown shown as a cyan bar
  under the XP bar. Desktop-only camera shake (`addShake`) on hits; never in XR.

## 5. Waves, difficulty, bosses (`game.js` top constants)

| Thing | Rule |
|---|---|
| Waves | 25. `waveCount(w) = min(1500, floor(30 · 1.28^(w−1)))` → 30, 38, 49, 63, 86 (w5), 273 (w10). Boss waves use 60%. |
| Alive cap | `MAX_ENEMIES = 200`; spawning pauses at the cap. From ~wave 8 waves are effectively time-boxed streams. |
| Pace | `waveRate = max(2, total/18)` per second, spawns at 18–26 m from the player, random angle. |
| Wave end | all spawned **and** ≤2 alive **and** no boss, **or** `waveTimeLimit(w) = 50 + 5w` seconds elapsed. 3 s breather, toast. |
| HP scaling | `waveHpMul(w) = 1 + 0.2(w−1) + 0.01(w−1)²` (≈2× w5, 3.6× w10, 11.6× w25). Boss HP × (1 + 0.03(w−1)). |
| Composition | weights per wave: bat `max(3, 10 − 0.6·max(0,w−6))`, ghoul `3 + 0.8w`, wraith `w≥3: 2 + 0.8(w−3)`, brute `w≥5: 1 + 0.6(w−5)`. |
| Casters | `casterChance(w) = min(0.35, 0.03(w−2))` — fire/ice from wave 3, 35% by wave ~14. |
| Bosses | `BOSS_WAVES = {4: Bat Lord, 8: Grave Golem, 12: Necromancer, 17: Wraith Queen, 25: Vampire Lord}`. The Butcher exists in `BOSSES` but is unscheduled. `final: true` on the Vampire Lord → `victory()`. |
| Chests | 1 per wave (2 on boss waves), 10–22 m away, never inside a collider, max 3 on field. Opening applies one random `getChoices()` item. |
| Health orbs | 5% drop per kill, 3 per boss; heal 25% max HP. |
| Level cap | `MAX_LEVEL = 30`; `xpNeeded(l) = floor(4 + 3l + 0.4l²)`. Multiple level-ups queue via `pendingLevels`. XP × `stats.growth`. |
| Loot (`dropLoot`) | Boss: gold bag (30) + random relic. Elite: bag (10) + Magnet/Bomb/Hourglass. Horde (× 0.3 in top-down): relic rolls 0.3% Magnet, 0.15% Bomb, 0.15% Hourglass, 0.15% Chicken; 4% coin (brute coin = 3). Chests also give 5–12 gold. Pickup caps in `PICKUPS` (over-cap gold folds into an existing pile). |
| Relics | Magnet: every gem + coin streams to you (`gems.vacuum`). Holy Bomb: everything within 22 m — horde killed, elites −50% max HP, bosses −6%. Hourglass: freezes all enemies 5 s (bosses 2.5 s). Chicken: heal 30% max HP. |
| Revival | Crypt "Second Chance" gives `player.revives`; at 0 HP: back to 50% HP, 3 s invulnerable, enemy shots cleared, 250·hpMul blast + knockback within 9 m (bosses 5%), banner + slow-mo. |

Bosses have an epithet (`title`) shown on the intro banner with a brass horn + roar (spatialized) and a boss music layer.
**Boss AI** (`bosses.js`, one `ai(e, dt, game)` per boss, state in `e.s`): Bat Lord orbits at 7 m, dives every 5 s, summons bats;
Golem winds up 1 s then `bossFx.shockwave` (expanding ring, 22 dmg if it passes you); Necromancer keeps 8–12 m, 3-shot spread
every 3 s, raises 6 ghouls every 10 s; Wraith Queen teleports every 6 s, 8-way ring every 4 s, summons wraiths; Butcher charges
(0.8 s wind-up, 15 m/s, 2.5× damage); Vampire Lord: 5-shot spread, teleport, summons. `BossFx` owns enemy projectiles
(`shoot(x,z,vx,vz,dmg,color,effect)`) and shockwave rings; projectiles hit within 0.55 m of the player.

## 6. Enemies (`enemies.js`)

`ENEMY_TYPES`: bat (6 hp, 3.2 m/s, 3 dmg, size 0.45, flies), ghoul (22/2.1/6/0.8), wraith (40/2.8/9/0.9, flies), brute
(130/1.4/16/1.5). Per-type `MAX` instances: 320/220/120/60.

Each spawn (`spawn(type, x, z, hpMul, casterChance)`) rolls a **variant**: `scale` 0.75–1.35 (6% giants at 1.7), `tint`
(random pastel or fire/ice tint), `kind` normal/fire/ice. Derived: `size = t.size·scale`, `speed = t.speed·(1.25−0.25·scale)`,
`hp = t.hp·hpMul·scale^1.5`, `dmgMul = scale`, `xp = round(t.xp·scale)`. **Always use `e.size`/`e.speed`/`e.xp`, not `e.t.*`.**

Casters (`KINDS.fire/ice`) hold range (9/10 m), back off if you close in, and call the `shoot` callback every 3.0/3.4 s
(damage 14/8 × hpMul × 0.5; ice applies `slow`). Casters get a glow orb drawn by `game.js` every frame.

`update(dt, playerPos, time, colliders, shoot)`: compacts dead (removes boss meshes), rebuilds a 2 m spatial grid (used by
weapons via `forEachNear`/`nearestN`), moves toward the player (stop at `size/2 + 0.45`), applies knockback, separation
(bosses never get pushed), prop collision, then writes instance matrices/colors (`instanceColor` = tint × (1 + flash·3)) and
per-instance `aPhase`. Returns contact damage (`t.dmg · dmgMul · dt` for enemies within `stop + 0.3`).

Bosses are single `Mesh`es (`spawnBoss`) in the same list with `t.boss = true`; flash uses `material.emissive`.
**Freeze:** `e.frozenUntil > time` (Frost Nova, Hourglass) skips movement, roles, caster fire and contact damage, zeroes
knockback, pauses the walk clock and tints the instance icy (bosses: emissive). With the Absolute Zero evolution
(`game.frostBonus`) frozen enemies take +50% damage from everything.
**Light probes:** `enemies.probe(x, z, outColor)` (set by the game to `World.probe`) multiplies each instance colour (boss:
`material.color`) by the baked light at its feet, so creatures darken in baked shadows and glow warm under lamps (§16).
Each type has a `blood` colour for its kill splat decal (fire casters leave scorch marks, ice casters frost splats).

**Horde roles** (`ROLES`, rolled by `game.spawnOpts(type, tier)`; castle rooms pass their tier):
- *Charger* (ghoul/brute, from wave 4, 8→25%): `chargerStep` — run → 0.75 s wind-up (stands still, red `warn` pulse) → 0.55 s
  straight lunge at 11 m/s with 1.8× contact damage → 0.9 s recovery → 2.6 s cooldown. Magenta tint.
- *Bomber* (bat, from wave 3, 12→30%): rushes in, 0.55 s fuse under 1.8 m, then `hooks.explode` → `game.explode(e, true)`
  (2.6 m radius, hurts the player). Shooting one first detonates it with `hurtsPlayer = false`, so bombers chain through the
  horde (damage source `bomber` in Run Stats). Orange tint + glow.
- *Splitter* (ghoul, from wave 6): on death spawns two 0.62× copies (`noSplit`). Green tint.
- *Elite* (non-bat, from wave 5, 1.3→5%, max 3 alive): ≥1.5× scale, 4× HP, 5× XP, 1.3× damage, gold tint, rotating golden
  halo + crown glow, and a modifier `mod`: `swift` (1.5× speed), `vampiric` (heals 4× the contact damage it deals), `regen`
  (3% max HP/s). Drops a chest and a heal orb.
- Movement: every non-boss enemy has a `flank` offset (±0.95 rad) applied while far away (`approach`), fading to a straight line
  within ~3 m — the horde fans out and encircles instead of queueing behind one another.
- `update(dt, playerPos, time, colliders, hooks)` — `hooks = { shoot(e, kind), explode(e) }` (a bare function = `shoot`).

**Horde events** (survival, waves ≥ 3 except boss waves, once per wave 9–16 s in, rotating `HORDE_EVENTS`): `encircle`
(16 + 2w ghouls in a 14 m ring), `swarm` (18 + 2w bats from one direction, 30% bombers), `stampede` (6 + w/2 chargers from one
side), `escort` (an elite brute with 10 ghouls). Extra to the wave total; respects the 200 cap.

**Look:** every type has an ink-outline companion `InstancedMesh` sharing the instance buffers (`setTypeMesh`); outlines are
hidden in XR (`outlinesVisible`) to stay inside the Quest vertex budget, bosses keep theirs (child mesh). New spawns rise out of
the ground with an overshoot (`age`); killed enemies move to `this.dying` for a 0.42 s flash-swell-crumple (1.4 s for bosses)
before disappearing — they are no longer in `list`, so targeting and counts ignore them. `drawShadows()` feeds `BlobShadows`.

## 7. Weapons & upgrades

All weapons extend `Weapon` (`weapons.js`): `update(dt)` while playing, `draw(dt)` every frame, `dispose()`. Helpers `cd()`,
`dmg()`, `area()` apply the player's cooldown/damage/area stats. `maxLevel = 8`.

| Weapon | Behaviour | Scaling |
|---|---|---|
| Gun (Revolver, always owned) | hitscan along controller ray / camera centre; tracers, muzzle flash, recoil, rumble | dmg `20 + 6l`, rate `3 + 0.3l`/s, pierces 3 at l≥5 |
| Wand (Arcane Bolt, always owned) | bolts at nearest N enemies (22 m) | N `1 + ⌊(l−1)/2⌋`, dmg `14 + 4l`, faster at l≥4, pierce 3 at l≥6 |
| Orbs (Spirit Orbs) | l orbs circling at 2.2 m·area, 0.45 s per-enemy hit cooldown, knockback | dmg `8 + 3l` |
| Aura (Holy Ground) | ring radius `(2 + 0.3l)·area`, ticks every 0.5 s, knockback, shader ring | dmg `4 + 2l` |
| Lightning (Thunder) | random targets within 14 m, forked ribbon bolt + scorch decal + point-light flash | strikes `1 + ⌊l/2⌋`, dmg `24 + 9l`, cd `max(0.8, 2.2 − 0.15l)` |
| HolyWater | lobs flasks (0.5 s arc) at random enemies within 11 m; each leaves a burning pool (instanced shader disc) ticking every 0.35 s | flasks `1 + ⌊l/3⌋`, dmg `7 + 3l`/tick, radius `(1.4 + 0.12l)·area`, lasts `2.4 + 0.25l` s, cd `max(1.7, 3 − 0.15l)` |
| Cross (Silver Cross) | boomerang toward the nearest enemy (17 m/s, decelerates, returns), hits each enemy once per pass, knockback | crosses `1 + ⌊(l−1)/3⌋`, dmg `16 + 6l`, cd `max(1.3, 2.4 − 0.1l)` |
| FrostNova | ring bursts from the player: damage + freeze everything inside | dmg `12 + 5l`, radius `(3.6 + 0.35l)·area`, freeze `1 + 0.12l` s (bosses 30%), cd `max(2.6, 4.2 − 0.18l)` |

Passives (`upgrades.js`, max 5 each): Might +15% dmg, Haste ×0.9 cooldown, Vigor +20 max HP & heal 20, Swiftness +10% speed,
Magnet +1 m, Reach +12% area, Regeneration +0.6 HP/s, Armor −8% damage taken. `getChoices(game)` builds 3 random cards from
unowned weapons (NEW), upgradable weapons, and non-maxed passives, padding with "Roast Chicken" (heal 30).

**Evolutions:** each weapon has `static evolution = { passive, title, desc }`. A maxed weapon (level 8) plus its passive at
level ≥ 1 puts an `evolve` card first in `getChoices()` (chests grant it outright). `weapon.evolve()` sets `evolved`:
Gun + Haste → Hellfire Repeater (2× rate, +30%, pierce 8, red tracers); Wand + Might → Arcane Storm (8 homing bolts, +50%,
pierce 4); Orbs + Reach → Seraph Halo (12 orbs, 1.4× radius, faster, +60%); Aura + Armor → Sanctuary (1.5× radius, +50%,
heals 0.5 per enemy burned, max 4/tick); Lightning + Swiftness → Tempest (half cooldown, each strike chains to 3 foes at 70%);
HolyWater + Regeneration → Blessed Flood (+1 flask, 1.6× pools lasting 2×, +50%, 2.5 HP/s while standing in one);
Cross + Magnet → Grand Cross (4 crosses in a wide fan, 1.6× size, +40%, pulls every gem they pass);
FrostNova + Vigor → Absolute Zero (1.4× radius, +50%, 2.5 s freeze, frozen foes take +50% from everything).
Every passive pairs with exactly one weapon (unit-tested).

**Build slots:** `MAX_WEAPONS = 6` (Revolver + Arcane Bolt included) and `MAX_PASSIVES = 6`; NEW cards stop appearing once the
slots are full. Cards carry `{kind, icon, title, sub, level, max, desc, hint}`: the icon, level pips and an evolution hint
("Evolves with Haste" / "Evolves Revolver") are drawn on the card. Padding cards: Roast Chicken (heal 30) / Gold Pouch (+25).

All damage goes through `game.hitEnemy(e, dmg, {quiet, precision, src})` → flash, damage number, sfx, kill handling (gems,
orbs, particles, boss bookkeeping, victory). `src` accumulates `game.stats.damage[weaponId]` for the Run Stats card on the
game-over / victory screen (Try Again · Run Stats (disabled card) · Main Menu).

## 8. Levels & world (`world.js`, `levels/`)

A level def provides: `sky {top, horizon}`, `fog {color, density}`, `hemi`, `key`, optional `rim` lights, optional `celestial`
(moon/sun + halo), `stars`, `clouds`, optional `groundFog {color, opacity, height}`, `rimLight {color, strength}`,
optional `groundVariation`, `playerLight` intensity, `ground()` texture factory, and
`build(group, colliders)` which adds props and returns an optional `{update(dt, time, playerPos)}` (used for `Drifters`).
`World` puts everything in one group so `dispose()` swaps cleanly; `applyLevelLook()` rebuilds when `settings.level` changes
(desktop select on the title screen; VR main menu "Level" card cycles).

- **Graveyard** (night): irregular cobbles + mossy-earth patches, tombstones, crosses, dead trees, pillars, iron fences,
  braziers (baked warm pools), fireflies.
- **Village** (day): grass, 22 instanced cottages (walls/pyramid roofs/chimneys/doors/emissive windows, rotated-rect colliders),
  leafy trees, wooden fences, hay bales, barrels, crates, a well, pollen.
- **City** (night): pavement, road grid every 40 m with dashed lines, 4 instanced tower variants with window map+emissiveMap,
  ~190 street lamps (one Points draw for glows), parked cars, dumpsters, ash. Centre block kept clear.

`Colliders`: circles `{x,z,r}` and segments `{x1,z1,x2,z2,r}` (+ `addBox`), 6 m grid, `resolve(x,z,r,out)`.

Look: after `build()`, `toonify()` converts every Lambert prop to a toon material (set `userData.keepMaterial` to opt out) that
also reads the light bake (`bakeProps`; `userData.bakeGround` = flat surfaces like City roads take full baked shadows). The
ground (`groundMaterial`) samples its texture twice (second copy rotated/rescaled) swapped by noise, blends an optional second
surface (`groundAlt`: graveyard mossy earth, village dirt, city wet asphalt, castle snow; `groundAltMask: [lo, hi]`,
`groundAltScale`) in organic patches, adds macro light/dark noise and the bake (5 texture reads + 1 bake read).
**Sky:** one shader dome (`SKY_FRAG`) in `skyGroup`, which follows the camera (moon/sun and clouds too): gradient + horizon
glow, a hashed 3D-cell star field that twinkles (`uStars`, driven by the day cycle), nebula wisps from two noise reads
(`level.nebula: {a, b, strength}`) and dithering. Drawn after opaques (`renderOrder 50`, depth-tested) so early-z skips pixels
behind the ground. The moon has limb darkening + maria (`celestialMaterial`). `GroundFog` is one transparent
noise-scrolled disc (42 m) following the player. `Weather` (level `weather: { type: 'rain'|'snow', count, thunder }`) is one
draw call — drops live in a box that wraps around the player and are animated purely in the vertex shader; City has rain with
lightning (`World.update` returns true on a thunder frame → `sfx.thunder()`, hemi light + sky flash), Castle Siege has snow.
`dayCycle: { duration, keys[] }` (Village: noon → sunset at 6 min → night at 12 min) is applied by `World.setTimeOfDay(u)`
each frame from game time: lerps sky, fog, hemisphere/key lights, sun height and glow, cloud colour, star opacity and the
player's lantern (`playerLightNow`). `Flames` are flickering additive glow points (graveyard braziers) — no real
lights, the Quest pays per light per pixel.

## 9. Models & the asset pipeline (`models.js`, `creatures.js`)

All 10 enemy/boss models are AI-generated (Higgsfield MCP: Nano Banana Pro concept art → Meshy 7 image-to-3D → Meshy rigging).
Details, costs and gotchas live in the memory note `higgsfield-3d-pipeline`. Key runtime facts:

- Configured per type as `model: { url, height, lift, yaw, rate, animated }`. `loadModels(BOSSES)` runs at startup; failures
  fall back to the procedural `creatures.js` geometry and are reported on the HUD ("Models loaded (10)" / "failed: …").
- **Rigged bipeds** (ghoul, brute, golem, necro, butcher, vampire): `loadVATModel` bakes 24 frames of the skinned clip into a
  float RGBA texture (positions rows 0..F−1, normals rows F..2F−1); `vatMaterial` samples it by `gl_VertexID` with a
  per-instance `aPhase`. **Sampler and uniforms are declared `highp`** — lowp defaults on Quest corrupt positions.
- **Static non-bipeds** (bat, wraith, batlord, queen): `loadStaticModel` + `creatureMaterial(mode, opts, map)` with the
  procedural FLAP/WAVE vertex animation (`tagForShaderAnim`).
- All creature materials are `MeshToonMaterial` (4-band ramp) patched by `toonShader()` for rim light; `{ outline: w }` builds
  the inverted-hull ink pass (back faces pushed out along the normal by `w`). Rim colour/strength come from the level.
- Meshopt-compressed GLBs have **Int16 quantized attributes**: convert with `toFloat()` before any transform.
- `normalizeRoot` rescales to `height`, centres x/z, feet at y = 0; `lift` raises flyers (applied to geometry / baked positions).
- **Boss attack clips** (`attackModel` on golem/necro/butcher/vampire → `public/models/*_attack.glb`: Charged_Ground_Slam,
  Charged_Spell_Cast, Charged_Axe_Chop, mage_soell_cast from the Meshy library, re-rigged from the same meshes). Baked to a
  separate 36-frame VAT; `enemies.bossAttack(e, seconds)` (called from the boss AI when it slams / casts / charges) swaps the
  boss mesh + outline to the attack geometry/material and plays the clip once over that duration, then `endBossAttack` swaps
  back. Boss wind-ups set `e.warn` → pulsing red emissive (hit flashes stay white).
- Bosses clone the loaded geometry. Animated bosses have a private VAT material and clock; static bosses share the loaded material. Flash uses `emissive`. Private materials and boss geometry are disposed on death/restart.

## 10. HUD, menus, art

- `Hud`: 512×232 canvas plane. Rows: boss bar (top, when a boss is alive), HP (✚ = revive available), XP, dash, `LV / WAVE n/25
  / kills` with time, remaining and run gold underneath; toasts replace that line; the bottom **build row** shows six weapon
  slots (level, MAX, ★ evolved) and six passive slots using `icons.js`. `hud.layout(xr, fov)` keeps the camera-mode panel
  inside the 52° top-down view. The edge vignette is white-textured and tinted: red for hurt and the low-HP heartbeat pulse,
  any colour for `hud.glow(color, amount)` flashes (level-up, evolution, relics, boss intro, revive).
- `Banner` (hud.js): camera-attached 1024×256 title card (kicker, Cinzel title, subtitle) for wave starts (`WAVE_INTRO` tips
  for first appearances), boss intros (name + epithet), evolutions, boss kills, siege chambers and revives. Pops in, fades out,
  hidden whenever a card menu opens; 1 m wide at 1.6 m in VR.
- Pause (desktop `#overlay`): `buildHTML()` lists weapon/passive icons with levels, time, kills and run gold.
- End screen: Try Again · Run Stats (damage per weapon + gold earned / banked) · Main Menu; the subtitle announces new records. VR `settings.hud`: `wrist` (panel floats 12 cm above the off-hand, faces the head; a slim
  camera-locked "alerts" strip keeps boss HP + toasts) or `camera` (fixed at bottom of view). Hurt vignette and comfort vignette
  (peripheral darkening while moving/turning in VR) are camera children.
- `Minimap`: 256 px canvas, 32 m range, forward-up (`ctx.rotate(+yaw)` — sign matters), top-right: desktop uses camera FOV/aspect with 0.13 m edge inset; XR uses (0.4, 0.28, −0.9).
  Dead enemies are filtered; healing orbs are red; FRONT marks the forward-up orientation.
- Title screen (`title.js`): “Press any button” splash (first input also starts audio + music), then a vertical menu — Play,
  Battlefield ‹ ›, Enter VR (disabled with reason if unsupported), How to Play, Settings, Fullscreen — with a battlefield
  preview card and a button-prompt bar. Keyboard (arrows/WASD, Enter/Space, Esc/Backspace, F), mouse hover/click, gamepad
  (D-pad or left stick, A/Start, B). Logo is alpha-keyed from black at runtime. `#overlay` is only the in-game PAUSED screen.
- Revolver: primitives with a stepped matcap (`matcapMaterial`) so the player's lantern can't blow it out, glowing rune channel,
  back-face ink outline.
  VR main menu shows the logo (alpha-keyed from black at runtime) above cards with the key art behind: Start · Level · The
  Crypt · Settings. Menus with more than five cards (VR Crypt pages, VR settings) use two rows of 0.78× cards.

## 11. Settings

`settings.js` → localStorage. Keys: `turn` (`smooth|snap`), `turnSpeed` (deg/s), `vignette` (bool), `hud` (`wrist|camera`),
`level` (`graveyard|village|city|castle`), `music` (bool), `view` (`fps|topdown`), `numbers` (damage numbers, bool), `shake`
(desktop camera shake, bool), `height` (`real|seated`, VR eye height, default `real`, §4). Editable from the title screen and
the in-VR Settings cards (shake is desktop-only). VR Settings cards: Turn · Vignette · HUD · Height / Music · Numbers · Back
(two rows); the Height card shows the measured eye height (Real) or the lift in cm (Seated). The title's Settings and Crypt
screens hide the logo so their lists stay above the button-hint bar.

## 12. Testing without a headset (important)

The in-app browser pane used for verification reports `document.hidden = true`, so `requestAnimationFrame` never fires.
Drive the loop manually from the console:

```js
game.start(); game.clock.getDelta = () => 1/60;      // fixed timestep
for (let f = 0; f < 60 * 120; f++) game.loop();        // 2 minutes of game time
game.menu.pick(0);                                     // choose a card when state === 'levelup'
```

Steer with `game.input.yaw` + `game.input.keys.add('KeyW')`; a ~10-line bot (attract to gems, repel from enemies) gives a
realistic balance read. Fake a gamepad by overriding `navigator.getGamepads`. **Read `game.player.pos` only after a `loop()`**
(it updates in `updateMovement`). Don't fake `renderer.xr.isPresenting = true` for rendering (XR path renders black); XR
controller objects have `matrixAutoUpdate = false` — set `.matrix` or call `updateMatrix()` when faking poses. Editing a file
while a test runs triggers a Vite reload and invalidates `window.game`; dynamic `import()` in the console may get a different
module instance than the game (use the DOM selects to change settings).

VR-specific code paths (controller rays, thumbsticks, hand tracking, wrist HUD, controller haptics) cannot be exercised here —
the user tests them on a Quest via the Vercel URL and reports back.

Gotchas found in practice: the pane's screenshot often shows the *previous* composited frame right after a big change
(level switch, view switch) — run a couple of `game.loop()`s and screenshot twice. Classes imported in the console with
`import('/src/weapons.js')` after a hot reload can be a different module instance, so `instanceof` checks in `getChoices`
won't match them. Keep single `javascript_tool` calls under ~40 s of simulation (the tool times out at 45 s).
`node --test tests/*.test.js` runs 27 tests (aim, animation, boss materials, minimap, siege, Crypt economy/records, build
slots/evolutions, freeze, light probes, seated VR height).

The VR boot / seated-height path can be exercised without a session by faking it and calling the methods directly (never
`loop()` while faking — the XR render path breaks): set `renderer.xr.isPresenting = true`, push a dummy into
`renderer.xr.getCamera().cameras` and set its `position.y` (the "real" eye height), stub `getFrame` (`{ getViewerPose }`),
`getReferenceSpace` and `updateCamera`, `dispatchEvent({ type: 'sessionstart' })`, then call `game.bootVR()` /
`game.heightCard(back).apply()`. Restore the stubs and dispatch `sessionend` afterwards.

### Precision combat verification

Verified locally: five Node tests pass; browser ran 120 fixed-timestep frames and a scaled brute took 39 precision damage
(base 26), with cyan numbers and an active rendered impact. Real Quest/controller paths remain untested.

Run `node --test tests/aim.test.js` for scaled hitboxes, flight bob, precision radius, range, inside-sphere shots,
behind-camera rejection and dead targets. Gun hit tests live in `src/aim.js`: normalized ray versus a sphere centered at
`type.y * scale + flight bob`, radius `max(0.4, size * 0.6)`. A ray passing within 45% of the radius earns 1.5× damage,
including bosses. This is a center-mass precision bonus, not an anatomical headshot. Existing fire rate and piercing apply.
`Gun` owns 12 reusable world-space impact rings (gold hit, cyan precision, pink kill), fading/expanding over 0.22 seconds;
they are disposed with the weapon. Precision damage numbers are cyan. No camera shake, XR postprocessing or new assets.
`Game.hitEnemy` ignores dead targets and positions damage numbers/death bursts at scaled height.

## 13a. Top-down mode (desktop only; `settings.view = 'topdown'`, title → View)

A Vampire Survivors-style overhead camera. VR ignores the setting (`game.topdown` is false while presenting).
- **Camera** (`TOPDOWN` constant, `applyView()`): camera child of the rig at (0, 13.5, 8.5), pitched down, FOV 52; the rig stays
  unrotated and *is* the player position (`bodyPos()`), so movement is screen-relative (W = up screen). Shake scales up.
- **Avatar** (`avatar.js`): visible hunter; faces `game.aimDir`, walk/dash poses, `recoil()` on each shot.
- **Aim** (`updateAim`): right stick (> 0.35) → mouse cursor on the y = 1.1 plane (`input.mouseNDC`, `mouseActive`) → auto-aim at the
  nearest enemy within 16 m. A ground reticle marks the aim. The revolver fires from `avatar.muzzle` along the aim with
  `traceFlat` (2D footprint test). Hold click / RT to fire; Space or Shift dash; Esc pauses (no pointer lock — `input.freeCursor`).
- **Menus**: `menu.attachToCamera` parents the card group to the camera and picks with the mouse cursor.
- **Hordes**: `enemies.cap` = 200 in VR, 300 desktop first-person, up to 800 top-down (`enemyCap()`); instance buffers are
  800/800/420/260. Top-down waves are 4× larger, HP ×0.8, contact damage ×0.6, XP per kill ×0.4, spawning 15–21 m away (just
  off-screen). Enemies outside `viewBounds()` are skipped when writing instances/shadows (`enemies.view`).
- **Adaptive quality** (`adaptQuality`): if the smoothed frame time stays above 24 ms for ~2 s, enemy outlines turn off, then the
  cap drops 100 at a time (floor 400).
- **Scenery**: levels may set `topdownClip` (City 8 m, Castle 7.4 m); `World.setTopdown()` moves a material clipping plane so
  tall towers/arches are cut away above that height (renderer `localClippingEnabled`), and thins fog / ground mist.
- Hurt feedback everywhere is now a red edge vignette (radial texture), not a full-screen tint.

## 13. Known gaps / ideas not yet done

- No touch controls (phones can view the title page only).
- No audio files (procedural music + SFX only). VR controller haptics are implemented (`input.pulse`) but untested on-device.
- The Butcher appears in Castle Siege; it is still unscheduled in survival.
- No characters to choose from yet (the Crypt is the only meta layer); no new enemy models (generation costs credits).
- Balance numbers (§5, §7, §17 gold economy) were tuned with a headless bot, not with real VR play.
- The light bake covers ±100 m (the arena is r 90); dynamic lights (player lantern, lightning flash) stay real-time.


## 14. Castle Siege (`src/siege.js`, `src/levels/castle.js`)

Select **Castle Siege (adventure)** in the desktop Level selector, or cycle the VR Level card to Castle Siege.
This selection replaces the survival wave director with `CastleSiege.update(dt)`; the original three levels retain 25 waves.
Room centers are z=0, -22, -44, -66 along a straight northbound route; all navigation stays on flat ground for VR comfort.

| Room | Enemies | HP multiplier | Composition tier / caster chance | Guardian |
|---|---:|---:|---|---|
| Courtyard | 30 | 1 | 2 / 0% | None |
| Banquet Hall | 48 | 1.5 | 5 / 12% | None |
| Dungeon | 65 | 2 | 8 / 20% | The Butcher (2,000 HP) |
| Throne Room | 80 | 2.6 | 11 / 25% | Vampire Lord (4,900 HP) |

A two-second entry grace period precedes spawning at 2/3/4/5 enemies per second in clear side lanes. No timeout or straggler
skip: every enemy must die. Dungeon/throne guardians appear only after their horde is cleared. Boss summons count toward
the encounter; the Vampire Lord retains its immediate-on-death victory rule. Existing XP, upgrades, gun precision and
health drops remain active. Each of the first three clears spawns one chest and two red healing orbs near the exit.
Collect them before proceeding: the previous gate seals behind you. Rewards use the existing random-upgrade chest system.

`CastleSiege` owns room index, spawn budget, guardian state, progression, and objective text. `roomBounds`/`confine` keep
boss teleports and summons within the encounter. The player is constrained to the active room until cleared; crossing the
center doorway starts the next room. `World.ambient.setGate` raises the portcullis and toggles its collider's `disabled`
flag (`Colliders.resolve` skips disabled entries). Restart calls the level's `reset` and creates a fresh director. Switching
levels still calls `World.dispose()`. Static architecture/furniture uses one colored InstancedMesh; torch flames use one
more. Gate meshes are a fixed small set. No purchased/generated assets or XR postprocessing were added.

HUD shows room name and objective instead of wave text. Castle radar draws wall/collider segments and marks the exit red
while locked or green when cleared. Common enemy spawning now checks a 200-live-enemy cap, including boss summons; siege
streaming leaves a slot free. Spawn lanes avoid banquet tables and courtyard ornament collision.

Validation: `node --test tests/*.test.js` passes nine tests covering aim, room budgets, guardian ordering, gate transitions, bounds, and front/behind/right radar positions at all four cardinal headings.
The local browser test drove fixed-dt `game.loop()` across all rooms with scripted lethal damage, confirmed victory/restart,
and inspected the rendered castle. This verifies progression, not combat balance. Real Quest inputs, comfort and performance
still require headset testing. Future work: richer room-specific objectives, side chambers, and balance tuning from playtests.


## 15. Animation playback (`src/animation.js`, `models.js`, `enemies.js`)

VAT retains 24 baked poses but now interpolates both positions and normals between adjacent frames, wrapping the last frame
to the first. Vertex samplers remain `highp`. This uses four texture reads per vertex instead of two, without adding draw
calls or texture memory. Instanced enemies carry an `aWalkTime` attribute; animated bosses receive their own time uniform.
`advanceWalk` accumulates time from actual displacement relative to `type.speed * scale`, smooths cadence changes, clamps
movement rate to 0.2–2, and ignores teleport-sized displacements. Standing creatures retain a slow walk-cycle idle because
these assets have no separate idle/attack clips. This reduces sliding; it is not foot planting or root-motion matching.

Playback multipliers relative to source clips: ghoul 1.8, brute 1.9, golem 1.5, necromancer 1.8, butcher 1.8, vampire 1.7.
Static bats/wraiths and procedural fallbacks keep their existing shader motion. Game pauses stop movement clocks.
`tests/animation.test.js` checks distance tracking, frame-rate independence, idle cadence, size compensation and teleports.
Browser verification loaded all ten models and rendered 120 fixed-dt frames of blended horde and boss animation with no console errors. All 12 Node tests and production build pass. Quest GPU cost/comfort must still be checked on-device.


### Boss material regression (2026-09-24)

`spawnBoss` must initialize `warn: 0`, just like normal enemies. Warning decay and the emissive flash calculation both
consume this field every frame. Leaving it undefined produces NaN RGB values and black boss models. Regression coverage
in `tests/boss-material.test.js` runs all six boss definitions through spawn, warning, hit flash and death, checking finite
emissive values. Browser verification loaded all six boss models and rendered 60 fixed-timestep frames with their textures
and colors visible. Real Quest rendering remains an on-device check.


## 16. Baked lighting (`world.js` `LightBake`, `bakeUniforms`)

Real-time shadows are too expensive on a Quest and the props are scattered at load time (no lightmap UVs), so lighting is
baked **at level load** into one 1024² RGBA `DataTexture` covering ±100 m (≈20 cm/px):

- **A = occlusion** (white = open): soft contact AO blobs under every caster plus long sun/moon shadows swept along the level's
  key light (`level.key.position`; length = height × cot(elevation), clamped to `level.bake.maxLen`, strength
  `level.bake.shadow`). Round casters sweep a capsule, boxes sweep the convex hull of their footprint (raised boxes such as
  castle arch ribs cast offset stripes). Drawn with `ctx.filter = blur(1.5px)` where supported.
- **RGB = light pools** added together ('lighter'): graveyard braziers, City sodium street lamps and neon spill, castle torches,
  village windows (night only).
- Casters come from `bake.circle/box/segment` calls in each level's `build(group, colliders, bake)` plus every collider that
  declares a height `h` (and strength `k`): `scatter(..., radiusFn, heightFn, k)` and colliders like fences
  (`{…, h: 1.3, k: 0.35}`) feed it automatically.
- **Readers:** the ground shader (full occlusion, light × albedo × 2.6 as emissive), every toonified prop (`bakeProps`: 40% of
  the occlusion + contact darkening below 1.1 m, light pools on the lower 7 m only so towers don't glow to the roof), and
  creatures via the CPU probe (`World.probe`) — no extra GPU work for the horde.
- `bakeUniforms.uBakeLight / uBakeShadow` scale the two halves; the Village day cycle fades window light in at dusk and sun
  shadows out at night. Build cost ≈ 30–100 ms once per level (City has ~215 lights). `World.dispose()` frees the texture.

## 17. Meta-progression, gold and records (`meta.js`, `title.js`, `game.js`)

- **Gold** comes from coins/bags (`pickups.js`), chests and a completion bonus: `runReward = picked + 3·wave + 20·rooms
  (+150 victory)`, scaled by `stats.greed` at pickup. `finishRun(won)` banks it once per run and records per-battlefield bests
  (`time, wave/chamber, kills, level, wins`); beaten records are announced on the end screen.
- **The Crypt** (`UPGRADES`, cost `round(base·(1 + 0.75·rank)/5)·5`): Vitality (+10% HP ×5), Bloodlust (+5% dmg ×5), Iron Hide
  (−3% dmg taken ×3), Fleet Foot (+5% speed ×3), Quick Hands (−3% cooldown ×3), Wide Ward (+5% area ×3), Attraction (+0.5 m ×3),
  Recovery (+0.15 HP/s ×3), Growth (+6% XP ×5), Greed (+12% gold ×5), Second Chance (1 revive, 900). `applyMeta(player)` runs
  on every `start()`. Refund All returns every coin. Desktop: title → Crypt; VR: main menu → The Crypt (pages of 8 cards).
- Player armor is capped at 70% damage reduction.

## 18. Feel, audio and haptics

- **Juice:** hit-stop / slow-mo (§3), banners, edge-glow flashes, kill splat decals (`Decals`, ring buffer of 320, fade by
  themselves; scorch for fire/bomber/lightning, cracks for golem slams and boss deaths), ribbons for lightning (forked),
  tracers, wand/cross/orb trails and the dash streak, instanced damage numbers (`DamageNumbers`: 260 numbers × 6 digits, one
  draw; heals/gold use a `+` glyph; 1.7× in top-down), crystal gem shader, fresnel spirit orbs, chest light shaft with a
  lid-flip opening, top-down player ring and a 2.6× brighter lantern pool with a slight exposure lift.
- **Audio (`sfx.js`):** reverb send (generated 1.4 s impulse), stereo panning + distance falloff for boss roars, explosions,
  enemy shots, lightning and splashes (`spatial(x, z)` against `setListener`), gunshot pitch spread, XP pickups climbing a major
  scale while they chain, new SFX for coins, chests, relics, new weapons, revive, boss horn, heartbeat and victory. Music adds a
  boss layer (war toms + minor-second stabs) while a boss lives.
- **VR haptics:** `input.pulse(intensity, ms, hand)` on `gamepad.hapticActuators[0]`; the revolver kicks only the firing hand,
  `rumble()` also pulses both controllers (hurt, level-up, relics, heartbeat, revive).
