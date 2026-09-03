# Survivor XR

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

Your revolver is aimed by you; every other weapon fires on its own. Collect the gems enemies drop to level up.
A boss spawns at levels 5, 10, 15, 20, 25 and 30 (the level cap). Kill the level-30 Vampire Lord to win.

## Structure

- `src/game.js` — loop, state machine, spawn director, XR session
- `src/enemies.js` — instanced enemies with a spatial grid for separation and queries
- `src/weapons.js` — Revolver (player-aimed), Arcane Bolt, Spirit Orbs, Holy Ground, Thunder
- `src/bosses.js` — six bosses with their own models, AI, projectiles and shockwaves
- `src/upgrades.js` — passives and the level-up card pool
- `src/menu.js` — world-space card picker (controller ray or gaze + click)
- `src/hud.js` — camera-attached HUD and hurt vignette
