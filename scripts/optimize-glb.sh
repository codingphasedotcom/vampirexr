#!/usr/bin/env bash
# Shrinks a Meshy GLB for the web: 1K WebP textures + meshopt geometry compression.
# usage: scripts/optimize-glb.sh in.glb out.glb
set -euo pipefail
IN="$1"; OUT="$2"; TMP="$(mktemp -d)"
npx --yes @gltf-transform/cli resize "$IN" "$TMP/a.glb" --width 1024 --height 1024 >/dev/null
npx --yes @gltf-transform/cli webp "$TMP/a.glb" "$TMP/b.glb" --quality 85 >/dev/null
npx --yes @gltf-transform/cli meshopt "$TMP/b.glb" "$OUT" --level medium >/dev/null
rm -rf "$TMP"
ls -la "$IN" "$OUT" | awk '{print $NF, $5}'
