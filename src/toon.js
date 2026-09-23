import * as THREE from 'three';

// Shared anime look: a stepped light ramp (cel shading), a fresnel rim light, and inverted-hull ink outlines.
// Every creature material (procedural, static GLB, VAT) goes through `toonShader()` so the style is consistent.

function makeRamp() {
  // four bands: deep shadow, shadow, lit, highlight
  const data = new Uint8Array([70, 70, 70, 255, 140, 140, 140, 255, 215, 215, 215, 255, 255, 255, 255, 255]);
  const t = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}
export const RAMP = makeRamp();

// Level-tunable uniforms, shared by reference with every creature shader.
export const toonUniforms = {
  uRimColor: { value: new THREE.Color(0xa9b8ff) },
  uRimStrength: { value: 0.7 },
  uOutlineColor: { value: new THREE.Color(0x07040d) },
};

export function toonMaterial(params) {
  return new THREE.MeshToonMaterial({ gradientMap: RAMP, ...params });
}

// Outline pass for a material: back faces, pushed out along the normal, flat ink colour.
export function makeOutline(mat, width) {
  mat.side = THREE.BackSide;
  mat.defines = { ...(mat.defines || {}), OUTLINE: '', OUTLINE_W: width.toFixed(4) };
  return mat;
}

// Injects rim light / outline code. Call from a material's onBeforeCompile *after* its own replacements
// have produced `transformed` and `objectNormal`.
export function toonShader(shader) {
  shader.uniforms.uRimColor = toonUniforms.uRimColor;
  shader.uniforms.uRimStrength = toonUniforms.uRimStrength;
  shader.uniforms.uOutlineColor = toonUniforms.uOutlineColor;
  shader.vertexShader = shader.vertexShader.replace('#include <morphtarget_vertex>', `#include <morphtarget_vertex>
    #ifdef OUTLINE
      transformed += normalize(objectNormal) * OUTLINE_W;
    #endif`);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform vec3 uRimColor; uniform float uRimStrength; uniform vec3 uOutlineColor;')
    .replace('#include <opaque_fragment>', `
    #ifdef OUTLINE
      outgoingLight = uOutlineColor;
    #else
      {
        float fres = 1.0 - saturate(dot(normal, normalize(vViewPosition)));
        outgoingLight += uRimColor * smoothstep(0.68, 0.95, fres) * uRimStrength * (0.18 + 0.32 * diffuseColor.rgb);
      }
    #endif
    #include <opaque_fragment>`);
}

// Stepped anime matcap for handheld/prop objects: shading independent of scene lights (the player's lantern
// sits right above the gun and would blow it out). Multiplied by the material colour.
let _matcap = null;
export function toonMatcap() {
  if (_matcap) return _matcap;
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const nx = (x / S) * 2 - 1, ny = (y / S) * 2 - 1, r2 = nx * nx + ny * ny;
    let v = 0;
    if (r2 <= 1) {
      const nz = Math.sqrt(1 - r2), l = Math.max(0, -0.45 * nx - 0.55 * ny + 0.7 * nz);
      v = l > 0.93 ? 1.0 : l > 0.62 ? 0.86 : l > 0.3 ? 0.62 : 0.38;
      if (r2 > 0.86) v = Math.max(v, 0.7); // rim
    }
    const i = (y * S + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(v * 255); img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  _matcap = new THREE.CanvasTexture(c);
  _matcap.colorSpace = THREE.SRGBColorSpace;
  return _matcap;
}
export function matcapMaterial(params) { return new THREE.MeshMatcapMaterial({ matcap: toonMatcap(), ...params }); }
