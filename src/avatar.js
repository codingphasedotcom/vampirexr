import * as THREE from 'three';
import { toonMaterial, makeOutline } from './toon.js';

// The vampire hunter the player controls in top-down mode (first-person and VR never show it).
// Built from primitives in the cel-shaded style: wide-brim hat, long coat, red scarf, revolver in the right hand.
// Faces the aim direction; legs and arms swing with movement; the gun arm stays raised toward the target.

function outlined(geo, mat, width = 0.025) {
  const m = new THREE.Mesh(geo, mat);
  const ink = makeOutline(toonMaterial({ color: 0x000000 }), width);
  ink.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', 'outgoingLight = vec3(0.03, 0.015, 0.05);\n#include <opaque_fragment>');
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\ntransformed += normalize(objectNormal) * ${width.toFixed(3)};`);
  };
  ink.customProgramCacheKey = () => `avatar-ink-${width}`;
  m.add(new THREE.Mesh(geo, ink));
  return m;
}

export class HunterAvatar {
  constructor(scene) {
    const M = {
      coat: toonMaterial({ color: 0x2c2238 }), coatIn: toonMaterial({ color: 0x6a1428 }), leather: toonMaterial({ color: 0x3b2618 }),
      skin: toonMaterial({ color: 0xf0c9a8 }), hat: toonMaterial({ color: 0x1c1622 }), scarf: toonMaterial({ color: 0xc8203e }),
      steel: toonMaterial({ color: 0xaab2c4 }), gold: toonMaterial({ color: 0xf0b848 }), eye: new THREE.MeshBasicMaterial({ color: 0x7ff3ff }),
    };
    const root = this.root = new THREE.Group();
    const body = this.body = new THREE.Group();
    root.add(body);
    const add = (parent, geo, mat, x, y, z, o = true) => { const m = o ? outlined(geo, mat) : new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };

    // legs pivot at the hip so they can swing
    this.legs = [-0.13, 0.13].map((x) => {
      const hip = new THREE.Group(); hip.position.set(x, 0.85, 0); body.add(hip);
      add(hip, new THREE.CylinderGeometry(0.09, 0.08, 0.6, 8).translate(0, -0.3, 0), M.leather, 0, -0.05, 0);
      add(hip, new THREE.BoxGeometry(0.16, 0.12, 0.28).translate(0, -0.06, 0.05), M.hat, 0, -0.72, 0);
      return hip;
    });
    add(body, new THREE.CylinderGeometry(0.26, 0.42, 0.85, 10, 1, true).translate(0, 0.62, 0), M.coat, 0, 0, 0);       // coat skirt
    const lining = new THREE.Mesh(new THREE.CylinderGeometry(0.255, 0.415, 0.84, 10, 1, true).translate(0, 0.62, 0), M.coatIn);
    lining.material = M.coatIn.clone(); lining.material.side = THREE.BackSide; body.add(lining);
    add(body, new THREE.CylinderGeometry(0.22, 0.27, 0.5, 10).translate(0, 1.25, 0), M.coat, 0, 0, 0);                 // torso
    add(body, new THREE.CylinderGeometry(0.035, 0.035, 0.46, 6).translate(0, 1.2, 0.2), M.gold, 0, 0, 0.02, false);  // coat buttons strip
    add(body, new THREE.TorusGeometry(0.16, 0.06, 6, 12).rotateX(Math.PI / 2), M.scarf, 0, 1.52, 0);                   // scarf
    const tail = add(body, new THREE.BoxGeometry(0.1, 0.4, 0.04), M.scarf, 0.1, 1.33, -0.2); tail.rotation.z = 0.25;
    this.tail = tail;
    add(body, new THREE.SphereGeometry(0.17, 12, 10), M.skin, 0, 1.7, 0);                                               // head
    for (const x of [-0.06, 0.06]) add(body, new THREE.SphereGeometry(0.022, 6, 4), M.eye, x, 1.72, 0.15, false);
    add(body, new THREE.CylinderGeometry(0.42, 0.42, 0.03, 16), M.hat, 0, 1.82, 0);                                      // brim
    add(body, new THREE.CylinderGeometry(0.17, 0.2, 0.26, 12), M.hat, 0, 1.96, 0);                                       // crown
    add(body, new THREE.CylinderGeometry(0.205, 0.205, 0.05, 12), M.scarf, 0, 1.86, 0, false);                          // hat band

    // arms pivot at the shoulder; the right one holds the revolver and points at the target
    const arm = (x) => {
      const sh = new THREE.Group(); sh.position.set(x, 1.42, 0); body.add(sh);
      add(sh, new THREE.CylinderGeometry(0.07, 0.06, 0.55, 8).translate(0, -0.27, 0), M.coat, 0, 0, 0);
      add(sh, new THREE.SphereGeometry(0.065, 8, 6), M.skin, 0, -0.58, 0);
      return sh;
    };
    this.armL = arm(-0.3);
    this.armR = arm(0.3);
    const gun = new THREE.Group(); gun.position.set(0, -0.62, 0.02); this.armR.add(gun); // barrel runs along the arm
    add(gun, new THREE.BoxGeometry(0.05, 0.22, 0.08), M.hat, 0, -0.02, 0);
    add(gun, new THREE.CylinderGeometry(0.018, 0.018, 0.3, 8), M.steel, 0, -0.24, 0.02);
    add(gun, new THREE.CylinderGeometry(0.04, 0.04, 0.07, 6), M.steel, 0, -0.06, 0.02, false);
    add(gun, new THREE.BoxGeometry(0.006, 0.26, 0.006), M.eye, 0, -0.24, 0.045, false);
    add(gun, new THREE.BoxGeometry(0.045, 0.1, 0.06), M.gold, 0, 0.1, -0.03);
    this.muzzle = new THREE.Object3D(); this.muzzle.position.set(0, -0.4, 0.02); gun.add(this.muzzle);

    root.visible = false;
    scene.add(root);
    this.phase = 0; this.kick = 0; this.facing = 0;
  }

  // pos: floor position; aim: horizontal unit vector; speed01: 0..1 movement; dashing: bool
  update(dt, pos, aim, speed01, dashing) {
    this.root.position.set(pos.x, 0, pos.z);
    const target = Math.atan2(aim.x, aim.z);
    let d = target - this.facing; d = Math.atan2(Math.sin(d), Math.cos(d));
    this.facing += d * Math.min(1, dt * 16);
    this.root.rotation.y = this.facing;
    this.phase += dt * (4 + speed01 * 8) * (speed01 > 0.05 ? 1 : 0);
    const swing = Math.sin(this.phase) * 0.7 * speed01;
    this.legs[0].rotation.x = swing; this.legs[1].rotation.x = -swing;
    this.armL.rotation.x = -swing * 0.8;
    this.kick = Math.max(0, this.kick - dt * 9);
    this.armR.rotation.x = -Math.PI / 2 + 0.1 + this.kick * 0.35; // gun arm raised toward the aim
    this.body.position.y = Math.abs(Math.sin(this.phase)) * 0.05 * speed01;
    this.body.rotation.x = dashing ? 0.35 : speed01 * 0.08;
    this.tail.rotation.x = -0.3 - speed01 * 0.6 + Math.sin(this.phase * 0.5) * 0.1;
  }

  recoil() { this.kick = 1; }
}
