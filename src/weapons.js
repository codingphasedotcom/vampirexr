import * as THREE from 'three';
import { rand } from './utils.js';
import { fxTime } from './fx.js';

const dummy = new THREE.Object3D();
const BOLT_COLOR = new THREE.Color(0x66d4ff);
const ORB_COLOR = new THREE.Color(0xffc94d);
const ZAP_COLOR = new THREE.Color(0xbfe8ff);
const TRACER_COLOR = new THREE.Color(0xffe08a);
const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _m = new THREE.Vector3(), _q = new THREE.Quaternion();

// Every weapon auto-fires; the player only moves. Stats scale with level and the player's passives.
// update(dt) runs while playing; draw() runs every frame so visuals persist through the level-up pause.
export class Weapon {
  static maxLevel = 8;
  constructor(game) { this.game = game; this.level = 1; this.timer = 0; }
  get maxed() { return this.level >= this.constructor.maxLevel; }
  upgrade() { this.level++; this.onLevel?.(); }
  cd(base) { return base * this.game.player.stats.cooldown; }
  dmg(base) { return base * this.game.player.stats.damage; }
  area(base) { return base * this.game.player.stats.area; }
  update() {}
  draw() {}
  dispose() {}
}

export class Wand extends Weapon {
  static id = 'wand';
  static title = 'Arcane Bolt';
  static count(l) { return 1 + Math.floor((l - 1) / 2); }
  static damage(l) { return 14 + l * 4; }
  static describe(l) {
    if (l === 1) return 'Fires a bolt at the nearest enemy.';
    return `${Wand.count(l)} bolt${Wand.count(l) > 1 ? 's' : ''}, ${Wand.damage(l)} damage${l >= 6 ? ', pierces' : ''}${l === 4 ? ', faster' : ''}.`;
  }

  constructor(game) {
    super(game);
    this.mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xd8f4ff }), 300);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    game.scene.add(this.mesh);
    this.shots = [];
  }

  update(dt) {
    const g = this.game, p = g.player, L = this.level;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = this.cd(L >= 4 ? 0.5 : 0.6);
      const targets = g.enemies.nearestN(p.pos, 22, Wand.count(L));
      for (const e of targets) {
        const dx = e.x - p.pos.x, dz = e.z - p.pos.z, d = Math.hypot(dx, dz) || 1;
        this.shots.push({ x: p.pos.x, z: p.pos.z, vx: dx / d * 16, vz: dz / d * 16, life: 2, pierce: L >= 6 ? 3 : 1, hit: new Set() });
      }
      if (targets.length) g.sfx.shoot();
    }
    const dmg = this.dmg(Wand.damage(L));
    let w = 0;
    for (const s of this.shots) {
      s.x += s.vx * dt; s.z += s.vz * dt; s.life -= dt;
      if (s.life > 0) {
        g.enemies.forEachNear(s.x, s.z, 1.2, (e) => {
          if (s.pierce <= 0 || s.hit.has(e)) return;
          if (Math.hypot(e.x - s.x, e.z - s.z) < 0.15 + e.t.size * 0.5) {
            s.hit.add(e); s.pierce--;
            g.hitEnemy(e, dmg);
            g.particles.burst(s.x, 1.3, s.z, 0x66d4ff, 5, 2);
          }
        });
      }
      if (s.life > 0 && s.pierce > 0) this.shots[w++] = s;
    }
    this.shots.length = w;
  }

  draw() {
    const glow = this.game.glow, n = this.shots.length;
    for (let i = 0; i < n; i++) {
      const s = this.shots[i];
      dummy.position.set(s.x, 1.3, s.z);
      dummy.updateMatrix();
      this.mesh.setMatrixAt(i, dummy.matrix);
      glow.add(s.x, 1.3, s.z, 0.6, BOLT_COLOR, 1.0);
      for (let k = 1; k <= 5; k++) glow.add(s.x - s.vx * k * 0.018, 1.3, s.z - s.vz * k * 0.018, 0.5 - k * 0.08, BOLT_COLOR, 0.5 - k * 0.08);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() { this.game.scene.remove(this.mesh); }
}

export class Orbs extends Weapon {
  static id = 'orbs';
  static title = 'Spirit Orbs';
  static damage(l) { return 8 + l * 3; }
  static describe(l) {
    if (l === 1) return 'An orb circles you, striking anything it touches.';
    return `${l} orbs, ${Orbs.damage(l)} damage each.`;
  }

  constructor(game) {
    super(game);
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.orbs = [];
    this.angle = 0;
    this.rebuild();
  }

  rebuild() {
    while (this.orbs.length < this.level) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), new THREE.MeshBasicMaterial({ color: 0xfff1c0 }));
      this.group.add(m);
      this.orbs.push(m);
    }
  }
  onLevel() { this.rebuild(); }

  orbPos(i, angle, r) {
    const a = angle + i * Math.PI * 2 / this.orbs.length;
    return [Math.cos(a) * r, 1.1 + Math.sin(this.game.time * 3 + i) * 0.1, Math.sin(a) * r];
  }

  update(dt) {
    const g = this.game, p = g.player;
    this.angle += dt * 2.6;
    const r = this.area(2.2), dmg = this.dmg(Orbs.damage(this.level));
    this.orbs.forEach((m, i) => {
      const [ox, , oz] = this.orbPos(i, this.angle, r);
      const wx = p.pos.x + ox, wz = p.pos.z + oz;
      g.enemies.forEachNear(wx, wz, 1.3, (e) => {
        if (g.time - e.orbHit < 0.45) return;
        if (Math.hypot(e.x - wx, e.z - wz) < 0.25 + e.t.size * 0.5) {
          e.orbHit = g.time;
          g.hitEnemy(e, dmg);
          g.enemies.knockback(e, wx, wz, 3);
          g.particles.burst(wx, 1.1, wz, 0xffc94d, 4, 2);
        }
      });
    });
  }

  draw() {
    const g = this.game, p = g.player, glow = g.glow, r = this.area(2.2);
    this.group.position.set(p.pos.x, 0, p.pos.z);
    this.orbs.forEach((m, i) => {
      const [ox, oy, oz] = this.orbPos(i, this.angle, r);
      m.position.set(ox, oy, oz);
      m.rotation.set(fxTime.value * 2, fxTime.value * 3, 0);
      glow.add(p.pos.x + ox, oy, p.pos.z + oz, 0.55, ORB_COLOR, 0.7);
      for (let k = 1; k <= 6; k++) {
        const [tx, ty, tz] = this.orbPos(i, this.angle - k * 0.09, r);
        glow.add(p.pos.x + tx, ty, p.pos.z + tz, 0.35 - k * 0.05, ORB_COLOR, 0.3 - k * 0.045);
      }
    });
  }

  dispose() { this.game.scene.remove(this.group); }
}

export class Aura extends Weapon {
  static id = 'aura';
  static title = 'Holy Ground';
  static damage(l) { return 4 + l * 2; }
  static describe(l) {
    if (l === 1) return 'Burns and pushes back everything near you.';
    return `Wider ring, ${Aura.damage(l)} damage per tick.`;
  }

  constructor(game) {
    super(game);
    this.disc = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.ShaderMaterial({
      uniforms: { uTime: fxTime, uColor: { value: new THREE.Color(0xff6b6b) } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        uniform float uTime; uniform vec3 uColor; varying vec2 vUv;
        void main() {
          vec2 p = vUv * 2.0 - 1.0; float r = length(p); if (r > 1.0) discard;
          float a = atan(p.y, p.x);
          float ring = smoothstep(0.9, 0.95, r) * (1.0 - smoothstep(0.97, 1.0, r));
          float inner = smoothstep(0.7, 0.73, r) * (1.0 - smoothstep(0.75, 0.78, r)) * 0.5;
          float spokes = pow(abs(sin(a * 3.0 + uTime * 1.2)), 30.0) * smoothstep(0.2, 0.9, r) * 0.45;
          float wave = fract(uTime * 0.6); wave = smoothstep(0.06, 0.0, abs(r - wave)) * (1.0 - wave) * 0.9;
          float fill = 0.07 * (1.0 - r) + 0.03 * sin(uTime * 4.0);
          float v = ring + inner + spokes + wave + fill;
          gl_FragColor = vec4(uColor * v, v);
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.disc.rotation.x = -Math.PI / 2;
    this.disc.position.y = 0.03;
    game.scene.add(this.disc);
  }

  radius() { return this.area(2.0 + this.level * 0.3); }

  update(dt) {
    const g = this.game, p = g.player, r = this.radius();
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = this.cd(0.5);
    const dmg = this.dmg(Aura.damage(this.level));
    g.enemies.forEachNear(p.pos.x, p.pos.z, r + 1, (e) => {
      if (Math.hypot(e.x - p.pos.x, e.z - p.pos.z) < r + e.t.size * 0.5) {
        g.hitEnemy(e, dmg, { quiet: true });
        g.enemies.knockback(e, p.pos.x, p.pos.z, 1.2);
      }
    });
  }

  draw() {
    const p = this.game.player;
    this.disc.position.set(p.pos.x, 0.03, p.pos.z);
    this.disc.scale.setScalar(this.radius());
  }

  dispose() { this.game.scene.remove(this.disc); }
}

export class Lightning extends Weapon {
  static id = 'lightning';
  static title = 'Thunder';
  static strikes(l) { return 1 + Math.floor(l / 2); }
  static damage(l) { return 24 + l * 9; }
  static describe(l) {
    if (l === 1) return 'Lightning strikes a random nearby enemy.';
    return `${Lightning.strikes(l)} strike${Lightning.strikes(l) > 1 ? 's' : ''}, ${Lightning.damage(l)} damage.`;
  }

  constructor(game) {
    super(game);
    this.bolts = [];
    const scorchMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false });
    for (let i = 0; i < 12; i++) {
      const path = new Float32Array(10 * 3);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(path, 3).setUsage(THREE.DynamicDrawUsage));
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }));
      line.visible = false; line.frustumCulled = false;
      const scorch = new THREE.Mesh(new THREE.CircleGeometry(0.9, 20), scorchMat.clone());
      scorch.rotation.x = -Math.PI / 2; scorch.position.y = 0.02; scorch.visible = false;
      game.scene.add(line, scorch);
      this.bolts.push({ line, path, scorch, life: 0, scorchLife: 0 });
    }
    this.light = new THREE.PointLight(0xbfe8ff, 0, 16, 2);
    game.scene.add(this.light);
    this.timer = 1;
  }

  strikeAt(x, z) {
    const b = this.bolts.find((b) => b.life <= 0) || this.bolts[0];
    const p = b.path;
    let ox = rand(-1.5, 1.5), oz = rand(-1.5, 1.5);
    for (let i = 0; i < 10; i++) {
      const t = i / 9;
      const jitter = (1 - t) * 0.6;
      if (i > 0 && i < 9) { ox = ox * 0.6 + rand(-jitter, jitter); oz = oz * 0.6 + rand(-jitter, jitter); }
      if (i === 9) { ox = 0; oz = 0; }
      p[i * 3] = x + ox; p[i * 3 + 1] = 9 - t * 8.8; p[i * 3 + 2] = z + oz;
    }
    b.line.geometry.attributes.position.needsUpdate = true;
    b.line.visible = true; b.life = 1;
    b.scorch.position.set(x, 0.02, z); b.scorch.visible = true; b.scorchLife = 1;
    this.light.position.set(x, 3, z);
    this.light.intensity = 60;
  }

  update(dt) {
    const g = this.game, p = g.player, L = this.level;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = this.cd(Math.max(0.8, 2.2 - L * 0.15));
    const pool = [];
    g.enemies.forEachNear(p.pos.x, p.pos.z, 14, (e) => { if (Math.hypot(e.x - p.pos.x, e.z - p.pos.z) < 14) pool.push(e); });
    if (!pool.length) return;
    const dmg = this.dmg(Lightning.damage(L));
    for (let k = 0; k < Lightning.strikes(L) && pool.length; k++) {
      const e = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
      this.strikeAt(e.x, e.z);
      g.particles.burst(e.x, e.t.y, e.z, 0xdff6ff, 18, 5);
      g.hitEnemy(e, dmg, { quiet: true });
    }
    g.sfx.zap();
  }

  draw(dt) {
    const glow = this.game.glow;
    this.light.intensity *= Math.max(0, 1 - dt * 9);
    for (const b of this.bolts) {
      if (b.life > 0) {
        b.life -= dt * 5;
        b.line.material.opacity = Math.max(0, b.life);
        const p = b.path;
        for (let i = 0; i < 10; i++) glow.add(p[i * 3], p[i * 3 + 1], p[i * 3 + 2], 0.5 + (i / 9) * 0.6, ZAP_COLOR, b.life * 1.4);
        if (b.life <= 0) b.line.visible = false;
      }
      if (b.scorchLife > 0) {
        b.scorchLife -= dt * 0.3;
        b.scorch.material.opacity = Math.max(0, b.scorchLife) * 0.7;
        if (b.scorchLife <= 0) b.scorch.visible = false;
      }
    }
  }

  dispose() {
    for (const b of this.bolts) this.game.scene.remove(b.line, b.scorch);
    this.game.scene.remove(this.light);
  }
}

// A simple pistol: body, barrel, grip, and a muzzle point for tracers / flashes.
function makeGunModel() {
  const g = new THREE.Group();
  const dark = new THREE.MeshLambertMaterial({ color: 0x2a2a34 });
  const metal = new THREE.MeshLambertMaterial({ color: 0x9a9aae });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.2), dark); body.position.set(0, 0.01, -0.08);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.16, 8).rotateX(Math.PI / 2), metal); barrel.position.set(0, 0.03, -0.24);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.1, 0.055), dark); grip.position.set(0, -0.06, 0.01); grip.rotation.x = 0.35;
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.03, -0.33);
  g.add(body, barrel, grip, muzzle);
  g.muzzle = muzzle; g.kick = 0; g.baseZ = 0; g.baseRx = 0;
  return g;
}

// The player's own aimed weapon. VR: one on each controller, hold trigger (or pinch). Desktop: hold left mouse.
export class Gun extends Weapon {
  static id = 'gun';
  static title = 'Revolver';
  static damage(l) { return 20 + l * 6; }
  static rate(l) { return 3 + l * 0.3; } // shots per second
  static describe(l) {
    if (l === 1) return 'Your sidearm. Aim it yourself.';
    return `${Gun.damage(l)} damage, ${Gun.rate(l).toFixed(1)} shots/s${l >= 5 ? ', pierces' : ''}.`;
  }

  constructor(game) {
    super(game);
    this.tracers = [];
    this.guns = game.input.controllers.map((c) => { const gm = makeGunModel(); c.obj.add(gm); return gm; });
    this.deskGun = makeGunModel();
    this.deskGun.position.set(0.22, -0.2, -0.45);
    this.deskGun.rotation.set(0, -0.06, 0);
    this.deskGun.baseZ = -0.45;
    game.camera.add(this.deskGun);
  }

  update(dt) {
    const g = this.game, xr = g.renderer.xr.isPresenting;
    this.timer -= dt;
    if (this.timer > 0) return;
    let fired = false;
    if (xr) {
      g.input.controllers.forEach((c, i) => {
        if (!c.selecting || !c.source) return;
        const gm = this.guns[i];
        gm.muzzle.getWorldPosition(_o);
        gm.getWorldQuaternion(_q);
        _d.set(0, 0, -1).applyQuaternion(_q);
        this.fire(_o, _d, gm);
        fired = true;
      });
    } else if (g.input.mouseDown) {
      // aim from the camera so the crosshair is exact; the tracer still starts at the muzzle
      g.camera.getWorldPosition(_o);
      g.camera.getWorldQuaternion(_q);
      _d.set(0, 0, -1).applyQuaternion(_q);
      this.fire(_o, _d, this.deskGun);
      fired = true;
    }
    if (fired) this.timer = this.cd(1 / Gun.rate(this.level));
  }

  fire(origin, dir, gm) {
    const g = this.game, dmg = this.dmg(Gun.damage(this.level)), pierce = this.level >= 5 ? 3 : 1;
    // hitscan: ray vs. a sphere around each enemy's centre, nearest first
    const hits = [];
    for (const e of g.enemies.list) {
      if (e.dead) continue;
      const ocx = e.x - origin.x, ocy = e.t.y - origin.y, ocz = e.z - origin.z;
      const tca = ocx * dir.x + ocy * dir.y + ocz * dir.z;
      if (tca < 0 || tca > 60) continue;
      const r = Math.max(0.4, e.t.size * 0.6);
      const d2 = ocx * ocx + ocy * ocy + ocz * ocz - tca * tca;
      if (d2 > r * r) continue;
      hits.push({ e, t: tca - Math.sqrt(r * r - d2) });
    }
    hits.sort((a, b) => a.t - b.t);
    let end = 60;
    for (let i = 0; i < Math.min(pierce, hits.length); i++) {
      const h = hits[i];
      g.hitEnemy(h.e, dmg);
      g.particles.burst(origin.x + dir.x * h.t, origin.y + dir.y * h.t, origin.z + dir.z * h.t, 0xffe08a, 6, 3);
      end = h.t + 0.3;
    }
    gm.muzzle.getWorldPosition(_m);
    this.tracers.push({ x0: _m.x, y0: _m.y, z0: _m.z, x1: origin.x + dir.x * end, y1: origin.y + dir.y * end, z1: origin.z + dir.z * end, life: 1 });
    gm.kick = 1;
    g.sfx.gunshot();
  }

  draw(dt) {
    const g = this.game, xr = g.renderer.xr.isPresenting, glow = g.glow;
    this.deskGun.visible = !xr;
    for (let i = 0; i < this.guns.length; i++) this.guns[i].visible = xr && !!g.input.controllers[i].source;
    for (const gm of [...this.guns, this.deskGun]) {
      gm.kick = Math.max(0, gm.kick - dt * 8);
      gm.position.z = gm.baseZ + gm.kick * 0.04;
      gm.rotation.x = gm.baseRx + gm.kick * 0.25;
      if (gm.visible && gm.kick > 0.5) { gm.muzzle.getWorldPosition(_m); glow.add(_m.x, _m.y, _m.z, 0.6, TRACER_COLOR, gm.kick); }
    }
    let w = 0;
    for (const t of this.tracers) {
      t.life -= dt * 7;
      if (t.life <= 0) continue;
      const len = Math.hypot(t.x1 - t.x0, t.y1 - t.y0, t.z1 - t.z0), n = Math.min(60, Math.ceil(len / 0.5));
      for (let k = 0; k <= n; k++) {
        const f = k / n;
        glow.add(t.x0 + (t.x1 - t.x0) * f, t.y0 + (t.y1 - t.y0) * f, t.z0 + (t.z1 - t.z0) * f, 0.22, TRACER_COLOR, t.life * 0.7);
      }
      this.tracers[w++] = t;
    }
    this.tracers.length = w;
  }

  dispose() {
    for (const gm of this.guns) gm.parent?.remove(gm);
    this.game.camera.remove(this.deskGun);
  }
}

export const WEAPONS = [Gun, Wand, Orbs, Aura, Lightning];
