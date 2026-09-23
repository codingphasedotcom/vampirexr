# VampiresXR — Architecture & Handover Guide

> **Keep this file current.** Any change to gameplay rules, module responsibilities, asset pipeline, controls, or deploy flow
> must be reflected here in the same commit. This is the document a new engineer (human or LLM) reads first.
> Last updated: 2026-09-23 (horde roles/elites/events, boss attack clips, weather, village day→night).

## 1. What the game is

A Vampire Survivors–style horde survival game built with **Three.js (r185) + WebXR**, playable in a **VR headset** (Quest,
controllers or hand tracking), on **desktop** (keyboard+mouse or gamepad), with an anime art style. 25 waves, five bosses,
auto-firing weapons plus a player-aimed revolver, level-ups, chests, three survival levels and Castle Siege. No backend, no build-time codegen: Vite +
vanilla ES modules.

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
src/settings.js       persisted prefs (localStorage `survivorxr.settings`): turn, turnSpeed, vignette, hud, level, music
src/title.js          console-style desktop front end: splash, main menu, battlefield preview, settings, how-to (keys/mouse/gamepad)
src/toon.js           cel-shading ramp, rim light, ink outlines (`toonShader`, `makeOutline`), stepped matcap for the revolver
src/shadows.js        BlobShadows: one instanced draw of soft discs under creatures, chests and the player
src/music.js          procedural soundtrack (Am–F–Dm–E), layers scale with `intensity`
src/input.js          keyboard/mouse, XR controllers + hands (arm-swing locomotion), desktop gamepad
src/player.js         HP/XP/level/stats/passives; MAX_LEVEL = 30
src/enemies.js        ENEMY_TYPES, KINDS (fire/ice), EnemyManager (instanced horde + boss meshes, grid, movement, contact dmg)
src/creatures.js      procedural low-poly fallback models + shader animation material (FLAP / SHAMBLE / WAVE)
src/models.js         GLB loading, normalization, vertex-animation-texture (VAT) baking, VAT material
src/bosses.js         BOSSES defs + AI (dive, shockwave, ranged, teleport, charge, summon), BossFx (enemy projectiles, rings)
src/weapons.js        Weapon base + Gun (player-aimed), Wand, Orbs, Aura, Lightning; WEAPONS list
src/upgrades.js       PASSIVES + getChoices() (level-up / chest card pool)
src/gems.js           XP gems + red health orbs (instanced, magnet pull)
src/chests.js         treasure chests with light beams (walk-in → free random upgrade)
src/world.js          Colliders (grid of circles/segments), World (sky/fog/lights/ground/clouds from a level def), Drifters
src/levels/*.js       graveyard (night), village (day), city (night) — props with colliders; index.js exports LEVELS
src/hud.js            camera-locked or wrist HUD canvas, boss bar, toasts, hurt vignette, comfort vignette
src/minimap.js        radar (forward-up), camera-fixed top-right
src/menu.js           world-space card menu (VR ray/pinch, desktop gaze+click/keys/gamepad), logo + key art dressing
src/fx.js             GlowLayer (immediate-mode additive point sprites), DamageNumbers, glowTexture, fxTime
src/particles.js      pooled additive particles (death bursts, hits)
src/sfx.js            WebAudio SFX: oscillators + filtered noise through a limiter (no audio assets)
src/utils.js          rand/clamp/pick/shuffle/fmtTime/canvas helpers
```

## 3. Frame loop & state machine (`game.js`)

`renderer.setAnimationLoop(loop)`; `dt` is clamped to 50 ms. States: `menu | playing | levelup | gameover | paused`.

Per frame (`loop()`):
1. `fxTime += dt` (wall clock for ambient shaders; `this.time` is *game* time and only advances while `playing`).
2. `glow.begin()` — every glow consumer pushes points during the frame; `glow.end()` uploads once.
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

`tick(dt)`: time → `spawnDirector` → boss AI → `enemies.update` (returns contact damage) → weapons `update` → `bossFx.update`
→ gems → chests → regen → contact damage (rumble/vignette throttled) → death check → victory check → level-up check.

Menus are the same `Menu` class everywhere: `menu.show(title, sub, items, onPick, xr, {logo, art})`; each item has
`{kind, title, sub, desc, apply}`. VR: point + trigger/pinch. Desktop: gaze at card + click/A, or keys 1–9, D-pad cycles.

## 4. Player, movement, input

- The **rig** (`THREE.Group`) moves; the camera sits inside it (desktop: yaw on rig, pitch on camera; XR: headset drives camera).
  `player.pos` = head world position projected to y = 0. Turning rotates the rig **around the head** (`rotateRig`).
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
| Level cap | `MAX_LEVEL = 30`; `xpNeeded(l) = floor(4 + 3l + 0.4l²)`. Multiple level-ups queue via `pendingLevels`. |

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
| Lightning (Thunder) | random targets within 14 m, jagged bolt + scorch + point-light flash | strikes `1 + ⌊l/2⌋`, dmg `24 + 9l`, cd `max(0.8, 2.2 − 0.15l)` |

Passives (`upgrades.js`, max 5 each): Might +15% dmg, Haste ×0.9 cooldown, Vigor +20 max HP & heal 20, Swiftness +10% speed,
Magnet +1 m, Reach +12% area, Regeneration +0.6 HP/s, Armor −8% damage taken. `getChoices(game)` builds 3 random cards from
unowned weapons (NEW), upgradable weapons, and non-maxed passives, padding with "Roast Chicken" (heal 30).

**Evolutions:** each weapon has `static evolution = { passive, title, desc }`. A maxed weapon (level 8) plus its passive at
level ≥ 1 puts an `evolve` card first in `getChoices()` (chests grant it outright). `weapon.evolve()` sets `evolved`:
Gun + Haste → Hellfire Repeater (2× rate, +30%, pierce 8, red tracers); Wand + Might → Arcane Storm (8 homing bolts, +50%,
pierce 4); Orbs + Reach → Seraph Halo (12 orbs, 1.4× radius, faster, +60%); Aura + Armor → Sanctuary (1.5× radius, +50%,
heals 0.5 per enemy burned, max 4/tick); Lightning + Swiftness → Tempest (half cooldown, each strike chains to 3 foes at 70%).

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

- **Graveyard** (night): cobblestones, tombstones, crosses, dead trees, pillars, iron fences, fireflies.
- **Village** (day): grass, 22 instanced cottages (walls/pyramid roofs/chimneys/doors/emissive windows, rotated-rect colliders),
  leafy trees, wooden fences, hay bales, barrels, crates, a well, pollen.
- **City** (night): pavement, road grid every 40 m with dashed lines, 4 instanced tower variants with window map+emissiveMap,
  ~190 street lamps (one Points draw for glows), parked cars, dumpsters, ash. Centre block kept clear.

`Colliders`: circles `{x,z,r}` and segments `{x1,z1,x2,z2,r}` (+ `addBox`), 6 m grid, `resolve(x,z,r,out)`.

Look: after `build()`, `toonify()` converts every Lambert prop to a toon material (set `userData.keepMaterial` to opt out). The
ground keeps Lambert with `macroVariation` (two octaves of `noiseTexture()` to hide tiling). `GroundFog` is one transparent
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

- `Hud`: 512×184 canvas plane. Rows: boss bar (top, when a boss is alive), HP, XP, `LV / WAVE n/25 (+remaining·time) / kills`;
  toasts replace the bottom line. VR `settings.hud`: `wrist` (panel floats 12 cm above the off-hand, faces the head; a slim
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
  VR main menu shows the logo (alpha-keyed from black at runtime) above cards with the key art behind.

## 11. Settings

`settings.js` → localStorage. Keys: `turn` (`smooth|snap`), `turnSpeed` (deg/s), `vignette` (bool), `hud` (`wrist|camera`),
`level` (`graveyard|village|city|castle`), `music` (bool). Editable from the title screen and the in-VR Settings cards.

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

VR-specific code paths (controller rays, thumbsticks, hand tracking, wrist HUD) cannot be exercised here — the user tests them
on a Quest via the Vercel URL and reports back.

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

## 13. Known gaps / ideas not yet done

- No touch controls (phones can view the title page only).
- No audio files (procedural music + SFX only). No haptics in VR (gamepad rumble only).
- The Butcher appears in Castle Siege; it is still unscheduled in survival.
- No meta-progression.
- Balance numbers (§5) were tuned with a headless bot, not with real VR play.


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
