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
