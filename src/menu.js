import * as THREE from 'three';
import { makeCanvas, wrapText, roundRect } from './utils.js';

const _center = new THREE.Vector2(0, 0);
const _m = new THREE.Matrix4();
const _pos = new THREE.Vector3(), _q = new THREE.Quaternion(), _fwd = new THREE.Vector3();
const FONT = 'system-ui, sans-serif';

function cardTexture(item, hint) {
  const c = makeCanvas(256, 352), g = c.getContext('2d');
  const accent = item.kind === 'weapon' ? '#ff4d6d' : item.kind === 'passive' ? '#4dd0ff' : '#ffd166';
  g.fillStyle = '#17121f'; roundRect(g, 0, 0, 256, 352, 18); g.fill();
  g.strokeStyle = accent; g.lineWidth = 6; roundRect(g, 4, 4, 248, 344, 16); g.stroke();
  g.textAlign = 'center';
  g.fillStyle = accent; g.font = `bold 22px ${FONT}`; g.fillText(item.sub || '', 128, 48);
  g.fillStyle = '#fff'; g.font = `bold 28px ${FONT}`;
  const y = wrapText(g, item.title, 128, 96, 220, 32);
  g.fillStyle = '#c9c4d6'; g.font = `20px ${FONT}`;
  wrapText(g, item.desc, 128, y + 18, 218, 26);
  if (hint) { g.fillStyle = '#777'; g.font = `18px ${FONT}`; g.fillText(hint, 128, 330); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function headingTexture(title, sub) {
  const c = makeCanvas(1024, 200), g = c.getContext('2d');
  g.textAlign = 'center';
  g.shadowColor = '#ff4d6d'; g.shadowBlur = 30;
  g.fillStyle = '#ff4d6d'; g.font = `bold 96px ${FONT}`; g.fillText(title, 512, 100);
  g.shadowBlur = 0;
  g.fillStyle = '#ddd'; g.font = `36px ${FONT}`; g.fillText(sub, 512, 165);
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

    this.camera.getWorldPosition(_pos);
    this.camera.getWorldQuaternion(_q);
    _fwd.set(0, 0, -1).applyQuaternion(_q);
    this.group.position.set(_pos.x, 0, _pos.z);
    this.group.rotation.set(0, Math.atan2(-_fwd.x, -_fwd.z), 0);
    const hy = _pos.y;
    this.heading.position.set(0, hy + 0.55, -1.8);
    this.logo.visible = logo; this.heading.visible = !logo;
    this.logo.position.set(0, hy + 0.85, -1.85);
    this.art.visible = art;
    this.art.position.set(0, hy + 0.1, -3.2);

    const n = items.length, gap = n > 3 ? 0.62 : 0.7;
    items.forEach((item, i) => {
      const x = (i - (n - 1) / 2) * gap;
      const frame = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.82),
        new THREE.MeshBasicMaterial({ color: 0xff4d6d, transparent: true, opacity: 0.25, depthTest: false }));
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.756),
        new THREE.MeshBasicMaterial({ map: cardTexture(item, xr ? '' : `[ ${i + 1} ]`), transparent: true, depthTest: false }));
      frame.position.set(x, hy - 0.15, -1.81); frame.renderOrder = 900;
      mesh.position.set(x, hy - 0.15, -1.8); mesh.renderOrder = 901;
      this.group.add(frame, mesh);
      this.cards.push({ mesh, frame });
    });

    this.group.visible = true;
    this.open = true;
    this.input.setLasers(true);
    this.crosshair?.classList.toggle('hidden', xr);
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
      this.raycaster.setFromCamera(_center, this.camera);
      const hit = this.raycaster.intersectObjects(meshes, false)[0];
      if (hit) hovered = meshes.indexOf(hit.object);
    }
    this.cards.forEach((c, i) => {
      const h = i === hovered;
      c.frame.material.opacity = h ? 1 : 0.25;
      c.mesh.scale.setScalar(h ? 1.08 : 1);
      c.frame.scale.setScalar(h ? 1.08 : 1);
    });
    const sel = this.input.consumeSelect(), click = this.input.consumeClick();
    if ((sel || click) && hovered >= 0) this.pick(hovered);
  }

  pick(i) {
    const item = this.items[i];
    if (!item || !this.open) return;
    this.hide();
    this.input.clearSelecting();
    this.onPick(item);
  }
}
