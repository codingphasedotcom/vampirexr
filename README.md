# VampiresXR

A Vampire Survivors–style horde game built with Three.js and WebXR. Plays in a VR headset or on desktop.

## Run

```bash
npm install
npm run dev        # http://localhost:5173 — desktop play
npm run dev:vr     # https://<your-lan-ip>:5173 — for a headset on the same Wi-Fi
```

WebXR needs a secure context, so `dev:vr` serves over HTTPS with a self-signed cert. In the headset browser, open the LAN URL, accept the certificate warning, then press **Enter VR**.

## Controls

| | Desktop | VR |
|---|---|---|
| Move | WASD | Left thumbstick |
| Look / turn | Mouse | Head + right stick (smooth turn) |
| Shoot | Hold left mouse | Hold trigger (either hand) |
| Pick upgrade | Look + click, or 1 / 2 / 3 | Point controller + trigger |
| Hand tracking (no controllers) | — | Swing arms to run, pinch to shoot / pick |

Your revolver is aimed by you; every other weapon fires on its own. Aim through the center of an enemy for **1.5× precision damage**. Impact rings confirm hits: gold for a hit, cyan for precision, pink for a kill. Collect the gems enemies drop to level up.
25 waves, starting at 30 monsters and growing ~28% per wave (max 200 alive). Bosses on waves 4, 8, 12, 17 and 25; kill the Vampire Lord on wave 25 to win. Golden beams mark chests that give a free upgrade.

Walking enemies now blend smoothly between animation poses, with faster playback that adjusts to movement speed.

## Castle Siege

Choose **Castle Siege (adventure)** from the **Level** selector before playing. In VR, cycle the Level card to Castle Siege.
Fight through the Courtyard, Banquet Hall, Dungeon, and Throne Room. Clear every enemy to raise the next gate; collect your
reward chest and two healing orbs before moving on. The gate closes behind you when you enter the next room.
The Butcher guards the dungeon; defeat the Vampire Lord in the throne room to win. Room objectives and colored gate markers
on the top-right minimap guide the route. The radar rotates with your view: enemies above its player arrow are in front of you; red pickup dots mark healing orbs. The other three levels still use the original 25-wave survival mode.

## Structure

Full technical handover: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Agent rules: [CLAUDE.md](CLAUDE.md).


- `src/game.js` — loop, state machine, wave director, XR session
- `src/levels/` — Graveyard (night), Village (day), City (night): sky, lights, ground, props with colliders
- `src/enemies.js` — instanced enemies with a spatial grid for separation and queries
- `src/weapons.js` — Revolver (player-aimed), Arcane Bolt, Spirit Orbs, Holy Ground, Thunder
- `src/bosses.js` — six bosses with their own models, AI, projectiles and shockwaves
- `src/upgrades.js` — passives and the level-up card pool
- `src/menu.js` — world-space card picker (controller ray or gaze + click)
- `src/hud.js` — camera-attached HUD and hurt vignette
