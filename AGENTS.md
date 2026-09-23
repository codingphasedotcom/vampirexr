# VampiresXR — working rules for AI agents

Read `docs/ARCHITECTURE.md` first: it explains every module, the wave/boss/enemy rules, the model pipeline, and how to test
headlessly. Then follow these rules:

1. **Keep the docs current.** Any change that touches gameplay rules, module responsibilities, controls, assets, settings, or
   deploy must update `docs/ARCHITECTURE.md` (and `README.md` if user-facing) **in the same commit**. Bump the "Last updated"
   line. A change without a doc update is incomplete.
2. **Every change goes to production.** The user playtests on a Quest via https://vampirexr.vercel.app, which deploys from
   `main`. Finish each task with `npm run build` (must pass), then `git add -A && git commit && git push origin main`, and say
   so in the reply.
3. **Verify before pushing.** Use the headless loop technique in `docs/ARCHITECTURE.md` §12 (drive `game.loop()` with a fixed
   dt, screenshot the pane) — the browser pane's rAF is paused. VR-only paths can't be tested here; say so explicitly.
4. **Assets cost real credits.** Model/art generation goes through the Higgsfield MCP and bills the user (see memory note
   `higgsfield-3d-pipeline` for the exact recipe: safety checker OFF, mesh first, rig second, then `scripts/optimize-glb.sh`).
   Confirm spend before generating; the art style is anime cel-shaded.
5. **Performance budget is a Quest.** Horde enemies stay one `InstancedMesh` per type (VAT animation), no per-enemy draw calls,
   no post-processing in XR, keep `MAX_ENEMIES` at 200. Declare vertex-shader samplers `highp`.
6. **Don't regress the fallbacks.** Model loading must keep the procedural creatures as fallback; level switching must go
   through `World.dispose()`.

Commit style: short imperative subject, body explains the why. Co-author trailer as configured by the harness.
