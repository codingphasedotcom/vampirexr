# VampiresXR — Architecture & Handover Guide

> **Keep this file current.** Any change to gameplay rules, module responsibilities, asset pipeline, controls, or deploy flow
> must be reflected here in the same commit. This is the document a new engineer (human or LLM) reads first.
> Last updated: 2026-09-11 (precision shooting and impact feedback).

## 1. What the game is

A Vampire Survivors–style horde survival game built with **Three.js (r185) + WebXR**, playable in a **VR headset** (Quest,
controllers or hand tracking), on **desktop** (keyboard+mouse or gamepad), with an anime art style. 25 waves, five bosses,
auto-firing weapons plus a player-aimed revolver, level-ups, chests, three levels. No backend, no build-time codegen: Vite +
vanilla ES modules.

- **Live site:** https://vampirexr.vercel.app (Vercel auto-deploys `main` of `github.com/codingphasedotcom/vampirexr`).
- **Local dev:** `npm run dev` (http://localhost:5173). `npm run dev:vr` serves HTTPS on the LAN for a headset, but the user
  tests on the Vercel URL instead — **every change must be committed and pushed to `main`.**
- **Build:** `npm run build` (Vite → `dist/`). `public/` (models, images) is copied verbatim.

## 2. Repository map

```
index.html            Title overlay (logo, key art, Play, Enter VR, Fullscreen, settings selects), crosshair div
vite.config.js        basic-ssl only when SSL=1
scripts/optimize-glb.sh   gltf-transform: 1K WebP textures + meshopt → public/models/*.glb (~300 KB each)
public/models/*.glb   10 AI-generated anime models (see §9)
public/img/           logo.png (black bg, alpha-keyed at runtime), keyart.jpg
docs/ARCHITECTURE.md  this file
CLAUDE.md             working rules for AI agents (deploy, testing, docs)

src/main.js           creates `new Game()` and exposes `window.game` (used for headless testing)
src/game.js           THE orchestrator: renderer/XR setup, state machine, wave director, menus, damage routing, per-frame loop
src/settings.js       persisted prefs (localStorage `survivorxr.settings`): turn, turnSpeed, vignette, hud, level
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
src/minimap.js        radar (forward-up), camera-fixed bottom-right
src/menu.js           world-space card menu (VR ray/pinch, desktop gaze+click/keys/gamepad), logo + key art dressing
src/fx.js             GlowLayer (immediate-mode additive point sprites), DamageNumbers, glowTexture, fxTime
src/particles.js      pooled additive particles (death bursts, hits)
src/sfx.js            WebAudio oscillator SFX (no audio assets)
src/utils.js          rand/clamp/pick/shuffle/fmtTime/canvas helpers
```

## 3. Frame loop & state machine (`game.js`)

`renderer.setAnimationLoop(loop)`; `dt` is clamped to 50 ms. States: `menu | playing | levelup | gameover | paused`.

Per frame (`loop()`):
1. `fxTime += dt` (wall clock for ambient shaders; `this.time` is *game* time and only advances while `playing`).
2. `glow.begin()` — every glow consumer pushes points during the frame; `glow.end()` uploads once.
3. VR: X/Y/A/B pause toggle. Desktop: `input.pollGamepad(dt)`; Start/A start/pause/resume; A restarts on game over.
4. `updateMovement(dt, xr)` — rig movement, turning, prop collision, comfort vignette, `player.pos` (head projected to floor).
5. If `playing` → `tick(dt)`; else if a menu is open → `menu.update(xr)`.
6. Always: weapon `draw()`, gems/chests draw, caster glows, particles, damage numbers, world ambience, player light, HUD,
   minimap, wrist anchor (VR).
7. Render: `composer.render()` on desktop (RenderPass → UnrealBloomPass → OutputPass), `renderer.render()` in XR (no bloom).

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

All damage goes through `game.hitEnemy(e, dmg, {quiet})` → flash, damage number, sfx, kill handling (gems, orbs, particles,
boss bookkeeping, victory).

## 8. Levels & world (`world.js`, `levels/`)

A level def provides: `sky {top, horizon}`, `fog {color, density}`, `hemi`, `key`, optional `rim` lights, optional `celestial`
(moon/sun + halo), `stars`, `clouds`, `bloom {strength, threshold}`, `playerLight` intensity, `ground()` texture factory, and
`build(group, colliders)` which adds props and returns an optional `{update(dt, time, playerPos)}` (used for `Drifters`).
`World` puts everything in one group so `dispose()` swaps cleanly; `applyLevelLook()` rebuilds when `settings.level` changes
(desktop select on the title screen; VR main menu "Level" card cycles).

- **Graveyard** (night): cobblestones, tombstones, crosses, dead trees, pillars, iron fences, fireflies.
- **Village** (day): grass, 22 instanced cottages (walls/pyramid roofs/chimneys/doors/emissive windows, rotated-rect colliders),
  leafy trees, wooden fences, hay bales, barrels, crates, a well, pollen.
- **City** (night): pavement, road grid every 40 m with dashed lines, 4 instanced tower variants with window map+emissiveMap,
  ~190 street lamps (one Points draw for glows), parked cars, dumpsters, ash. Centre block kept clear.

`Colliders`: circles `{x,z,r}` and segments `{x1,z1,x2,z2,r}` (+ `addBox`), 6 m grid, `resolve(x,z,r,out)`.

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
- Meshopt-compressed GLBs have **Int16 quantized attributes**: convert with `toFloat()` before any transform.
- `normalizeRoot` rescales to `height`, centres x/z, feet at y = 0; `lift` raises flyers (applied to geometry / baked positions).
- Bosses clone the loaded geometry and share the material; flash via `emissive`.

## 10. HUD, menus, art

- `Hud`: 512×184 canvas plane. Rows: boss bar (top, when a boss is alive), HP, XP, `LV / WAVE n/25 (+remaining·time) / kills`;
  toasts replace the bottom line. VR `settings.hud`: `wrist` (panel floats 12 cm above the off-hand, faces the head; a slim
  camera-locked "alerts" strip keeps boss HP + toasts) or `camera` (fixed at bottom of view). Hurt vignette and comfort vignette
  (peripheral darkening while moving/turning in VR) are camera children.
- `Minimap`: 256 px canvas, 32 m range, forward-up (`ctx.rotate(+yaw)` — sign matters), camera-fixed at (0.46, −0.27, −0.9).
- Title screen: `index.html` overlay with `img#logo` (`mix-blend-mode: screen`) over `keyart.jpg`; scrollable on phones.
  VR main menu shows the logo (alpha-keyed from black at runtime) above cards with the key art behind.

## 11. Settings

`settings.js` → localStorage. Keys: `turn` (`smooth|snap`), `turnSpeed` (deg/s), `vignette` (bool), `hud` (`wrist|camera`),
`level` (`graveyard|village|city`). Editable from the title-screen selects and the in-VR Settings cards.

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
- No audio assets/music (oscillator SFX only). No haptics in VR (gamepad rumble only).
- The Butcher boss is unscheduled since bosses moved to waves 4/8/12/17/25.
- No meta-progression, weapon evolutions, or run summary screen.
- Balance numbers (§5) were tuned with a headless bot, not with real VR play.
