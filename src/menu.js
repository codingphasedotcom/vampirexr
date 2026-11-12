import * as THREE from 'three';
import { makeCanvas, wrapText, roundRect } from './utils.js';
import { drawIcon } from './icons.js';

const _center = new THREE.Vector2(0, 0);
const _m = new THREE.Matrix4();
const _pos = new THREE.Vector3(), _q = new THREE.Quaternion(), _fwd = new THREE.Vector3();
const FONT = 'Inter, system-ui, sans-serif';

const ACCENT = { weapon: '#ff4d6d', passive: '#4dd0ff', evolve: '#c77dff', stats: '#9a93ad', bonus: '#ffd166', shop: '#ffd166' };
const KIND_ICON = { stats: 'skull', bonus: 'star', evolve: 'star', weapon: 'gun', passive: 'might', shop: 'gold' };

// Card face: kind ribbon, glowing icon, title, level pips, description and an evolution hint.
function cardTexture(item, hint) {
  const W = 320, H = 440, c = makeCanvas(W, H), g = c.getContext('2d');
  const accent = ACCENT[item.kind] || '#ffd166';
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, item.kind === 'evolve' ? '#2c1240' : '#1d1528'); bg.addColorStop(1, '#0d0914');
  g.fillStyle = bg; roundRect(g, 0, 0, W, H, 22); g.fill();
  g.strokeStyle = accent; g.lineWidth = 6; roundRect(g, 4, 4, W - 8, H - 8, 19); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 2; roundRect(g, 13, 13, W - 26, H - 26, 13); g.stroke();
  g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  // kind ribbon
  if (item.sub) {
    g.fillStyle = accent; g.globalAlpha = 0.18; roundRect(g, 40, 24, W - 80, 32, 16); g.fill(); g.globalAlpha = 1;
    g.fillStyle = accent; g.font = `800 17px ${FONT}`;
    g.fillText(item.sub.toUpperCase().split('').join(String.fromCharCode(8202)), W / 2, 46);
  }
  const isStats = item.kind === 'stats';
  let y;
  if (!isStats) {
    // icon on a soft halo
    const cx = W / 2, cy = 122, halo = g.createRadialGradient(cx, cy, 4, cx, cy, 70);
    halo.addColorStop(0, `${accent}66`); halo.addColorStop(1, `${accent}00`);
    g.fillStyle = halo; g.fillRect(cx - 80, cy - 80, 160, 160);
    if (item.kind === 'evolve') drawIcon(g, 'star', cx, cy, 120);
    drawIcon(g, item.icon || KIND_ICON[item.kind] || 'star', cx, cy, item.kind === 'evolve' ? 72 : 92);
    g.fillStyle = '#fff'; g.font = `800 29px ${FONT}`;
    y = wrapText(g, item.title, W / 2, 214, W - 40, 32);
    if (item.max) { // level pips: owned (dim), the one this card grants (bright)
      const n = item.max, sz = 12, gap = 6, x0 = W / 2 - (n * (sz + gap) - gap) / 2;
      for (let i = 0; i < n; i++) {
        const px = x0 + i * (sz + gap) + sz / 2, py = y - 6;
        g.save(); g.translate(px, py); g.rotate(Math.PI / 4);
        g.fillStyle = i < item.level - 1 ? `${accent}aa` : i === item.level - 1 ? '#fff' : 'rgba(255,255,255,0.12)';
        g.fillRect(-sz / 2.8, -sz / 2.8, sz / 1.4, sz / 1.4); g.restore();
      }
      y += 18;
    }
    g.fillStyle = '#d2cbe0'; g.font = `19px ${FONT}`;
    y = wrapText(g, item.desc, W / 2, y + 6, W - 44, 25);
  } else {
    drawIcon(g, item.icon || 'skull', W / 2, 92, 54);
    g.fillStyle = '#fff'; g.font = `800 27px ${FONT}`;
    y = wrapText(g, item.title, W / 2, 152, W - 40, 30);
    g.fillStyle = '#d2cbe0'; g.font = `17px ${FONT}`;
    y = wrapText(g, item.desc, W / 2, y + 4, W - 36, 23);
  }
  if (item.hint) { g.fillStyle = accent; g.font = `italic 600 16px ${FONT}`; wrapText(g, item.hint, W / 2, H - 52, W - 40, 19); }
  if (hint) { g.fillStyle = 'rgba(255,255,255,0.4)'; g.font = `700 16px ${FONT}`; g.fillText(hint, W / 2, H - 20); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function headingTexture(title, sub) {
  const c = makeCanvas(1024, 200), g = c.getContext('2d');
  g.textAlign = 'center';
  g.shadowColor = '#ff4d6d'; g.shadowBlur = 30;
  g.fillStyle = '#ff5d7a'; g.font = `800 92px Cinzel, Georgia, serif`; g.fillText(title, 512, 100);
  g.shadowBlur = 0;
  g.fillStyle = '#e4dcef'; g.font = `600 34px ${FONT}`; g.fillText(sub, 512, 165);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// World-space card picker used for level-ups and the game-over screen.
// VR: point a controller and pull the trigger. Desktop: look at a card and click, or press 1/2/3.
export class Menu {
  constructor(scene, camera, input) {
    this.scene = scene; this.camera = camera; this.input = input;
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    this.heading = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.39), new THREE.MeshBasicMaterial({ transparent: true, depthTest: false }));
    this.heading.renderOrder = 901;
    this.group.add(this.heading);
    // main-menu dressing: the logo replaces the text heading, key art hangs behind the cards
    const tl = new THREE.TextureLoader();
    const artTex = tl.load('/img/keyart.jpg'); artTex.colorSpace = THREE.SRGBColorSpace;
    // the logo ships on solid black; turn brightness into alpha so it composites cleanly over the art
    this.logo = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2 * 1100 / 2752),
      new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, opacity: 0 }));
    const img = new Image();
    img.onload = () => {
      const c = makeCanvas(img.width, img.height), g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height), px = d.data;
      for (let i = 0; i < px.length; i += 4) px[i + 3] = Math.min(255, Math.max(px[i], px[i + 1], px[i + 2]) * 1.6);
      g.putImageData(d, 0, 0);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      this.logo.material.map = t; this.logo.material.opacity = 1; this.logo.material.needsUpdate = true;
    };
    img.src = '/img/logo.png';
    this.logo.renderOrder = 902; this.logo.visible = false;
    this.art = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 4.8 * 1536 / 2752),
      new THREE.MeshBasicMaterial({ map: artTex, transparent: true, opacity: 0.95, depthTest: false }));
    this.art.renderOrder = 899; this.art.visible = false;
    this.group.add(this.logo, this.art);
    this.cards = [];
    this.items = [];
    this.raycaster = new THREE.Raycaster();
    this.open = false;
    this.crosshair = document.getElementById('crosshair');
  }

  show(title, sub, items, onPick, xr, { logo = false, art = false } = {}) {
    for (const c of this.cards) {
      this.group.remove(c.mesh, c.frame);
      c.mesh.material.map.dispose(); c.mesh.material.dispose(); c.frame.material.dispose();
    }
    this.cards = []; this.items = items; this.onPick = onPick;
    this.heading.material.map?.dispose();
    this.heading.material.map = headingTexture(title, sub);
    this.heading.material.needsUpdate = true;

    let hy;
    if (this.attachToCamera && !xr) {
      // top-down: cards ride in front of the camera (world-space placement would sit far above the view)
      this.camera.add(this.group);
      this.group.position.set(0, 0, 0); this.group.rotation.set(0, 0, 0);
      hy = 0;
    } else {
      this.scene.add(this.group);
      this.camera.getWorldPosition(_pos);
      this.camera.getWorldQuaternion(_q);
      _fwd.set(0, 0, -1).applyQuaternion(_q);
      this.group.position.set(_pos.x, 0, _pos.z);
      this.group.rotation.set(0, Math.atan2(-_fwd.x, -_fwd.z), 0);
      hy = _pos.y;
    }
    this.heading.position.set(0, hy + 0.6, -1.8);
    this.logo.visible = logo; this.heading.visible = !logo;
    this.logo.position.set(0, hy + 0.85, -1.85);
    this.art.visible = art;
    this.art.position.set(0, hy + 0.1, -3.2);

    // one row for up to five cards; more go into two rows of smaller cards (VR shop / settings)
    const n = items.length, rows = n > 5 ? 2 : 1, cols = Math.ceil(n / rows), sc = rows > 1 ? 0.78 : 1;
    const gap = rows > 1 ? 0.5 : n > 3 ? 0.62 : 0.7;
    if (rows > 1) this.heading.position.y = hy + 0.86;
    items.forEach((item, i) => {
      const row = Math.floor(i / cols), col = i % cols, inRow = row === rows - 1 ? n - cols * (rows - 1) : cols;
      const x = (col - (inRow - 1) / 2) * gap, rowY = rows > 1 ? (row === 0 ? 0.33 : -0.33) : 0;
      const frame = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.82),
        new THREE.MeshBasicMaterial({ color: ACCENT[item.kind] || '#ffd166', transparent: true, opacity: 0.25, depthTest: false }));
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.756),
        new THREE.MeshBasicMaterial({ map: cardTexture(item, xr ? '' : `[ ${i + 1} ]`), transparent: true, depthTest: false }));
      frame.position.set(x, hy - 0.02 + rowY, -1.81); frame.renderOrder = 900;
      mesh.position.set(x, hy - 0.02 + rowY, -1.8); mesh.renderOrder = 901;
      mesh.userData.baseY = hy - 0.02 + rowY; mesh.userData.sc = sc;
      this.group.add(frame, mesh);
      this.cards.push({ mesh, frame });
    });

    this.group.visible = true;
    this.open = true;
    this.padIndex = -1;
    this.t0 = performance.now();
    this.input.setLasers(true);
    this.crosshair?.classList.toggle('hidden', xr || !!this.attachToCamera);
    this.input.consumeSelect(); this.input.consumeClick(); // drop stale presses
  }

  hide() {
    this.group.visible = false;
    this.open = false;
    this.input.setLasers(false);
    this.crosshair?.classList.add('hidden');
  }

  update(xr) {
    if (!this.open) return;
    this.scene.updateMatrixWorld();
    const meshes = this.cards.map((c) => c.mesh);
    let hovered = -1;
    if (xr) {
      for (const c of this.input.controllers) {
        if (!c.source) continue;
        _m.identity().extractRotation(c.obj.matrixWorld);
        this.raycaster.ray.origin.setFromMatrixPosition(c.obj.matrixWorld);
        this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(_m);
        const hit = this.raycaster.intersectObjects(meshes, false)[0];
        if (hit) { hovered = meshes.indexOf(hit.object); c.laser.scale.z = hit.distance; }
        else c.laser.scale.z = 6;
      }
    } else {
      this.raycaster.setFromCamera(this.attachToCamera && !document.pointerLockElement ? this.input.mouseNDC : _center, this.camera);
      const hit = this.raycaster.intersectObjects(meshes, false)[0];
      if (hit) { hovered = meshes.indexOf(hit.object); this.padIndex = -1; }
      // gamepad: d-pad / bumpers cycle cards when the gaze isn't on one
      const nav = this.input.consumePadNav();
      if (nav) this.padIndex = ((this.padIndex < 0 ? (hovered >= 0 ? hovered : -1) : this.padIndex) + nav + meshes.length) % meshes.length;
      if (hovered < 0 && this.padIndex >= 0) hovered = this.padIndex;
    }
    const age = (performance.now() - this.t0) / 1000;
    this.cards.forEach((c, i) => {
      const h = i === hovered, k = Math.min(1, Math.max(0, (age - i * 0.06) / 0.25)), e = 1 - Math.pow(1 - k, 3);
      c.frame.material.opacity = (h ? 1 : 0.25) * e;
      c.mesh.material.opacity = e;
      const lift = (1 - e) * -0.12 + (h ? 0.02 : 0);
      c.mesh.position.y = c.mesh.userData.baseY + lift; c.frame.position.y = c.mesh.userData.baseY + lift;
      const sc = c.mesh.userData.sc ?? 1;
      c.mesh.scale.setScalar(sc * (h ? 1.08 : 1));
      c.frame.scale.setScalar(sc * (h ? 1.08 : 1));
    });
    const sel = this.input.consumeSelect(), click = this.input.consumeClick(), pad = this.input.consumePadSelect();
    if ((sel || click || pad) && hovered >= 0) this.pick(hovered);
  }

  pick(i) {
    const item = this.items[i];
    if (!item || !this.open || item.disabled) return;
    this.hide();
    this.input.clearSelecting();
    this.onPick(item);
  }
}
