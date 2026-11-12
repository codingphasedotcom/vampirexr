import { makeCanvas } from './utils.js';

// Procedural icon set (canvas 2D): weapons, passives, relics and Crypt upgrades share one look: flat cel colours,
// a dark ink outline and a soft coloured glow. drawIcon() paints into any context; iconCanvas()/iconURL() cache.
const INK = '#0b0612';

function setInk(g, s) { g.lineWidth = Math.max(1.5, s * 0.055); g.strokeStyle = INK; g.lineJoin = 'round'; g.lineCap = 'round'; }
function glow(g, color, s) { g.shadowColor = color; g.shadowBlur = s * 0.22; }
function noGlow(g) { g.shadowBlur = 0; }
function fillStroke(g) { g.fill(); noGlow(g); g.stroke(); }
function circle(g, x, y, r) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); }
function poly(g, pts) { g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.closePath(); }
function heart(g, x, y, r) {
  g.beginPath(); g.moveTo(x, y + r * 0.9);
  g.bezierCurveTo(x - r * 1.5, y - r * 0.1, x - r * 0.75, y - r * 1.25, x, y - r * 0.45);
  g.bezierCurveTo(x + r * 0.75, y - r * 1.25, x + r * 1.5, y - r * 0.1, x, y + r * 0.9); g.closePath();
}

// Each painter draws in a unit box [-1, 1] scaled by `s` (half-size) around (0, 0).
const P = {
  gun(g, s) {
    glow(g, '#ffd27a', s); g.fillStyle = '#c9d2e6';
    poly(g, [-0.15 * s, -0.42 * s, 0.95 * s, -0.42 * s, 0.95 * s, -0.2 * s, -0.15 * s, -0.2 * s]); fillStroke(g);
    g.fillStyle = '#8a93a8'; circle(g, -0.18 * s, -0.24 * s, 0.26 * s); fillStroke(g);
    g.fillStyle = '#9a5a2e'; poly(g, [-0.45 * s, -0.28 * s, -0.05 * s, -0.12 * s, -0.25 * s, 0.85 * s, -0.75 * s, 0.75 * s]); fillStroke(g);
    g.fillStyle = '#f0b848'; circle(g, -0.18 * s, -0.24 * s, 0.09 * s); fillStroke(g);
  },
  wand(g, s) {
    glow(g, '#66d4ff', s);
    const grd = g.createLinearGradient(-s, s, 0.3 * s, -0.3 * s); grd.addColorStop(0, 'rgba(102,212,255,0)'); grd.addColorStop(1, '#9fe9ff');
    g.fillStyle = grd; poly(g, [-0.95 * s, 0.75 * s, 0.05 * s, -0.45 * s, 0.45 * s, -0.05 * s]); g.fill();
    g.fillStyle = '#e6f9ff'; circle(g, 0.3 * s, -0.3 * s, 0.38 * s); fillStroke(g);
    g.fillStyle = '#66d4ff'; circle(g, 0.3 * s, -0.3 * s, 0.18 * s); g.fill();
  },
  orbs(g, s) {
    g.strokeStyle = 'rgba(255,209,102,0.55)'; g.lineWidth = s * 0.07; g.beginPath(); g.ellipse(0, 0, 0.82 * s, 0.4 * s, -0.3, 0, Math.PI * 2); g.stroke();
    setInk(g, s);
    for (const [x, y, r] of [[-0.62, 0.28, 0.24], [0.6, -0.3, 0.28], [0.05, 0.38, 0.2]]) { glow(g, '#ffd166', s); g.fillStyle = '#fff1c0'; circle(g, x * s, y * s, r * s); fillStroke(g); }
  },
  aura(g, s) {
    glow(g, '#ff6b6b', s);
    g.strokeStyle = '#ff8a8a'; g.lineWidth = s * 0.13; circle(g, 0, 0, 0.75 * s); g.stroke();
    g.lineWidth = s * 0.07; circle(g, 0, 0, 0.45 * s); g.stroke();
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; g.beginPath(); g.moveTo(Math.cos(a) * 0.86 * s, Math.sin(a) * 0.86 * s); g.lineTo(Math.cos(a) * s, Math.sin(a) * s); g.stroke(); }
    noGlow(g); g.fillStyle = '#ffd0d0'; circle(g, 0, 0, 0.16 * s); g.fill();
  },
  lightning(g, s) {
    glow(g, '#9fd8ff', s); g.fillStyle = '#fff3a0';
    poly(g, [0.25 * s, -0.95 * s, -0.5 * s, 0.1 * s, -0.02 * s, 0.1 * s, -0.3 * s, 0.95 * s, 0.55 * s, -0.2 * s, 0.05 * s, -0.2 * s]); fillStroke(g);
  },
  water(g, s) {
    glow(g, '#6fd2ff', s);
    g.fillStyle = '#d8f4ff'; poly(g, [-0.16 * s, -0.75 * s, 0.16 * s, -0.75 * s, 0.16 * s, -0.25 * s, -0.16 * s, -0.25 * s]); fillStroke(g);
    g.fillStyle = '#6fd2ff'; circle(g, 0, 0.25 * s, 0.6 * s); fillStroke(g);
    g.fillStyle = 'rgba(255,255,255,0.8)'; circle(g, -0.2 * s, 0.08 * s, 0.14 * s); g.fill();
    g.fillStyle = '#8a5a2e'; poly(g, [-0.2 * s, -0.95 * s, 0.2 * s, -0.95 * s, 0.2 * s, -0.75 * s, -0.2 * s, -0.75 * s]); fillStroke(g);
  },
  cross(g, s) {
    glow(g, '#e8f0ff', s); g.fillStyle = '#dfe6f7';
    poly(g, [-0.13 * s, -0.95 * s, 0.13 * s, -0.95 * s, 0.13 * s, -0.42 * s, 0.6 * s, -0.42 * s, 0.6 * s, -0.16 * s, 0.13 * s, -0.16 * s,
      0.13 * s, 0.95 * s, -0.13 * s, 0.95 * s, -0.13 * s, -0.16 * s, -0.6 * s, -0.16 * s, -0.6 * s, -0.42 * s, -0.13 * s, -0.42 * s]); fillStroke(g);
    g.fillStyle = '#f0b848'; circle(g, 0, -0.29 * s, 0.12 * s); fillStroke(g);
  },
  frost(g, s) {
    glow(g, '#9fe8ff', s); g.strokeStyle = '#dff8ff'; g.lineWidth = s * 0.12;
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3, c = Math.cos(a), sn = Math.sin(a);
      g.beginPath(); g.moveTo(0, 0); g.lineTo(c * 0.9 * s, sn * 0.9 * s); g.stroke();
      for (const k of [-1, 1]) { const b = a + k * 0.6; g.beginPath(); g.moveTo(c * 0.5 * s, sn * 0.5 * s); g.lineTo(c * 0.5 * s + Math.cos(b) * 0.28 * s, sn * 0.5 * s + Math.sin(b) * 0.28 * s); g.stroke(); }
    }
    noGlow(g);
  },
  might(g, s) {
    glow(g, '#ff5a3a', s); g.fillStyle = '#e8edf6';
    poly(g, [0.85 * s, -0.85 * s, 0.6 * s, -0.4 * s, -0.25 * s, 0.45 * s, -0.4 * s, 0.3 * s, 0.45 * s, -0.55 * s]); fillStroke(g);
    g.fillStyle = '#f0b848'; poly(g, [-0.55 * s, 0.15 * s, -0.15 * s, 0.55 * s, -0.25 * s, 0.65 * s, -0.65 * s, 0.25 * s]); fillStroke(g);
    g.fillStyle = '#8a3a2a'; poly(g, [-0.42 * s, 0.5 * s, -0.3 * s, 0.62 * s, -0.7 * s, 0.98 * s, -0.82 * s, 0.86 * s]); fillStroke(g);
  },
  haste(g, s) {
    glow(g, '#7ff3ff', s); g.fillStyle = '#e8fbff'; circle(g, 0.15 * s, 0.05 * s, 0.68 * s); fillStroke(g);
    g.strokeStyle = INK; g.lineWidth = s * 0.09; g.beginPath(); g.moveTo(0.15 * s, 0.05 * s); g.lineTo(0.15 * s, -0.4 * s); g.moveTo(0.15 * s, 0.05 * s); g.lineTo(0.48 * s, 0.22 * s); g.stroke();
    g.strokeStyle = '#7ff3ff'; g.lineWidth = s * 0.09;
    for (const y of [-0.35, 0, 0.35]) { g.beginPath(); g.moveTo(-0.95 * s, y * s); g.lineTo(-0.62 * s, y * s); g.stroke(); }
  },
  vigor(g, s) { glow(g, '#ff3b5c', s); g.fillStyle = '#ff4d6d'; heart(g, 0, 0.05 * s, 0.85 * s); fillStroke(g); g.fillStyle = 'rgba(255,255,255,0.6)'; circle(g, -0.32 * s, -0.25 * s, 0.13 * s); g.fill(); },
  regen(g, s) {
    glow(g, '#5aff8a', s); g.fillStyle = '#ff6b85'; heart(g, -0.1 * s, 0.05 * s, 0.75 * s); fillStroke(g);
    g.fillStyle = '#6dff9a'; poly(g, [0.42 * s, 0.1 * s, 0.6 * s, 0.1 * s, 0.6 * s, 0.32 * s, 0.82 * s, 0.32 * s, 0.82 * s, 0.5 * s, 0.6 * s, 0.5 * s, 0.6 * s, 0.72 * s, 0.42 * s, 0.72 * s, 0.42 * s, 0.5 * s, 0.2 * s, 0.5 * s, 0.2 * s, 0.32 * s, 0.42 * s, 0.32 * s]); fillStroke(g);
  },
  swift(g, s) {
    glow(g, '#bfe8ff', s); g.fillStyle = '#f2f8ff';
    for (let i = 0; i < 4; i++) { g.beginPath(); g.ellipse((-0.45 + i * 0.12) * s, (0.35 - i * 0.28) * s, 0.55 * s, 0.16 * s, -0.45 - i * 0.12, 0, Math.PI * 2); fillStroke(g); glow(g, '#bfe8ff', s); }
    noGlow(g);
  },
  magnet(g, s) {
    glow(g, '#ff4d6d', s);
    g.strokeStyle = INK; g.lineWidth = s * 0.5; g.beginPath(); g.arc(0, -0.05 * s, 0.5 * s, Math.PI, 0); g.lineTo(0.5 * s, 0.55 * s); g.moveTo(-0.5 * s, -0.05 * s); g.lineTo(-0.5 * s, 0.55 * s); g.stroke();
    noGlow(g); g.strokeStyle = '#ff4060'; g.lineWidth = s * 0.36; g.beginPath(); g.arc(0, -0.05 * s, 0.5 * s, Math.PI, 0); g.lineTo(0.5 * s, 0.35 * s); g.moveTo(-0.5 * s, -0.05 * s); g.lineTo(-0.5 * s, 0.35 * s); g.stroke();
    g.strokeStyle = '#eef3fa'; g.beginPath(); g.moveTo(0.5 * s, 0.4 * s); g.lineTo(0.5 * s, 0.62 * s); g.moveTo(-0.5 * s, 0.4 * s); g.lineTo(-0.5 * s, 0.62 * s); g.stroke();
  },
  reach(g, s) {
    glow(g, '#7dff9a', s); g.strokeStyle = '#9dffb5'; g.lineWidth = s * 0.1; circle(g, 0, 0, 0.32 * s); g.stroke();
    g.fillStyle = '#9dffb5';
    for (let i = 0; i < 4; i++) { g.save(); g.rotate(i * Math.PI / 2 + Math.PI / 4); poly(g, [0.5 * s, -0.16 * s, 0.95 * s, 0, 0.5 * s, 0.16 * s]); g.fill(); g.fillRect(0.4 * s, -0.05 * s, 0.2 * s, 0.1 * s); g.restore(); }
    noGlow(g);
  },
  armor(g, s) {
    glow(g, '#9fb4ff', s); g.fillStyle = '#c9d2e6';
    g.beginPath(); g.moveTo(0, -0.9 * s); g.lineTo(0.75 * s, -0.6 * s); g.quadraticCurveTo(0.75 * s, 0.45 * s, 0, 0.95 * s); g.quadraticCurveTo(-0.75 * s, 0.45 * s, -0.75 * s, -0.6 * s); g.closePath(); fillStroke(g);
    g.fillStyle = '#f0b848'; poly(g, [-0.1 * s, -0.55 * s, 0.1 * s, -0.55 * s, 0.1 * s, -0.12 * s, 0.38 * s, -0.12 * s, 0.38 * s, 0.08 * s, 0.1 * s, 0.08 * s, 0.1 * s, 0.6 * s, -0.1 * s, 0.6 * s, -0.1 * s, 0.08 * s, -0.38 * s, 0.08 * s, -0.38 * s, -0.12 * s, -0.1 * s, -0.12 * s]); fillStroke(g);
  },
  chicken(g, s) {
    glow(g, '#ffa060', s); g.fillStyle = '#c8742a'; g.beginPath(); g.ellipse(-0.18 * s, -0.12 * s, 0.6 * s, 0.48 * s, -0.6, 0, Math.PI * 2); fillStroke(g);
    g.fillStyle = '#f6efe0'; g.save(); g.translate(0.35 * s, 0.4 * s); g.rotate(-0.75); g.fillRect(-0.1 * s, -0.2 * s, 0.2 * s, 0.55 * s); g.strokeRect(-0.1 * s, -0.2 * s, 0.2 * s, 0.55 * s); g.restore();
    circle(g, 0.62 * s, 0.6 * s, 0.13 * s); fillStroke(g); circle(g, 0.48 * s, 0.75 * s, 0.13 * s); fillStroke(g);
  },
  gold(g, s) {
    glow(g, '#ffd34d', s);
    for (const [x, y] of [[-0.25, 0.3], [0.25, 0.1], [-0.05, -0.2]]) { g.fillStyle = '#f0b830'; g.beginPath(); g.ellipse(x * s, y * s, 0.5 * s, 0.3 * s, 0, 0, Math.PI * 2); fillStroke(g); g.fillStyle = '#ffe27a'; g.beginPath(); g.ellipse(x * s, (y - 0.04) * s, 0.32 * s, 0.17 * s, 0, 0, Math.PI * 2); g.fill(); glow(g, '#ffd34d', s); }
    noGlow(g);
  },
  growth(g, s) {
    glow(g, '#7dff9a', s); g.fillStyle = '#9dffb5';
    poly(g, [0, -0.95 * s, 0.7 * s, -0.15 * s, 0.25 * s, -0.15 * s, 0.25 * s, 0.85 * s, -0.25 * s, 0.85 * s, -0.25 * s, -0.15 * s, -0.7 * s, -0.15 * s]); fillStroke(g);
    g.fillStyle = '#4de1ff'; poly(g, [0.68 * s, 0.25 * s, 0.86 * s, 0.5 * s, 0.68 * s, 0.75 * s, 0.5 * s, 0.5 * s]); fillStroke(g);
  },
  revival(g, s) {
    glow(g, '#ffd166', s); g.strokeStyle = INK; g.lineWidth = s * 0.34;
    const ankh = () => { g.beginPath(); g.ellipse(0, -0.5 * s, 0.26 * s, 0.36 * s, 0, 0, Math.PI * 2); g.moveTo(0, -0.14 * s); g.lineTo(0, 0.92 * s); g.moveTo(-0.55 * s, 0.05 * s); g.lineTo(0.55 * s, 0.05 * s); g.stroke(); };
    ankh(); noGlow(g); g.strokeStyle = '#ffd166'; g.lineWidth = s * 0.2; ankh();
  },
  bomb(g, s) {
    glow(g, '#fff0a0', s); g.fillStyle = '#fff3c4'; circle(g, 0, 0.2 * s, 0.6 * s); fillStroke(g);
    g.fillStyle = '#ffc94d'; poly(g, [-0.08 * s, -0.95 * s, 0.08 * s, -0.95 * s, 0.08 * s, -0.75 * s, 0.25 * s, -0.75 * s, 0.25 * s, -0.6 * s, 0.08 * s, -0.6 * s, 0.08 * s, -0.38 * s, -0.08 * s, -0.38 * s, -0.08 * s, -0.6 * s, -0.25 * s, -0.6 * s, -0.25 * s, -0.75 * s, -0.08 * s, -0.75 * s]); fillStroke(g);
  },
  freeze(g, s) {
    glow(g, '#9fe8ff', s); g.fillStyle = '#7a4a2a'; g.fillRect(-0.55 * s, -0.95 * s, 1.1 * s, 0.18 * s); g.strokeRect(-0.55 * s, -0.95 * s, 1.1 * s, 0.18 * s);
    g.fillRect(-0.55 * s, 0.77 * s, 1.1 * s, 0.18 * s); g.strokeRect(-0.55 * s, 0.77 * s, 1.1 * s, 0.18 * s);
    g.fillStyle = '#bff2ff'; poly(g, [-0.42 * s, -0.77 * s, 0.42 * s, -0.77 * s, 0.06 * s, 0, 0.42 * s, 0.77 * s, -0.42 * s, 0.77 * s, -0.06 * s, 0]); fillStroke(g);
    g.fillStyle = '#4dc8ff'; poly(g, [-0.25 * s, 0.77 * s, 0.25 * s, 0.77 * s, 0, 0.4 * s]); g.fill();
  },
  vacuum(g, s) { P.magnet(g, s); },
  skull(g, s) {
    glow(g, '#c9b8ff', s); g.fillStyle = '#efe8ff'; g.beginPath(); g.arc(0, -0.15 * s, 0.68 * s, Math.PI * 0.85, Math.PI * 2.15); g.lineTo(0.38 * s, 0.75 * s); g.lineTo(-0.38 * s, 0.75 * s); g.closePath(); fillStroke(g);
    g.fillStyle = INK; circle(g, -0.25 * s, -0.08 * s, 0.17 * s); g.fill(); circle(g, 0.25 * s, -0.08 * s, 0.17 * s); g.fill();
    poly(g, [0, 0.15 * s, 0.1 * s, 0.35 * s, -0.1 * s, 0.35 * s]); g.fill();
  },
  retry(g, s) {
    glow(g, '#ffd166', s); g.strokeStyle = INK; g.lineWidth = s * 0.34;
    const arc = () => { g.beginPath(); g.arc(0, 0.05 * s, 0.6 * s, -Math.PI * 0.15, Math.PI * 1.45); g.stroke(); };
    arc(); noGlow(g); g.strokeStyle = '#ffd166'; g.lineWidth = s * 0.2; arc();
    g.fillStyle = '#ffd166'; poly(g, [0.28 * s, -0.75 * s, 0.95 * s, -0.42 * s, 0.38 * s, -0.02 * s]); g.fill(); setInk(g, s); g.stroke();
  },
  home(g, s) {
    glow(g, '#4dd0ff', s); g.fillStyle = '#d8f2ff';
    poly(g, [0, -0.9 * s, 0.85 * s, -0.1 * s, 0.6 * s, -0.1 * s, 0.6 * s, 0.8 * s, -0.6 * s, 0.8 * s, -0.6 * s, -0.1 * s, -0.85 * s, -0.1 * s]); fillStroke(g);
    g.fillStyle = '#7a4a2a'; poly(g, [-0.18 * s, 0.8 * s, -0.18 * s, 0.25 * s, 0.18 * s, 0.25 * s, 0.18 * s, 0.8 * s]); fillStroke(g);
  },
  star(g, s) {
    glow(g, '#c77dff', s); g.fillStyle = '#f0d8ff'; g.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = (i % 2 ? 0.4 : 0.95) * s; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    g.closePath(); fillStroke(g);
  },
};

export const hasIcon = (id) => !!P[id];

// Paint icon `id` centred at (x, y) inside a box of `size` px.
export function drawIcon(g, id, x, y, size) {
  const painter = P[id] || P.star;
  g.save();
  g.translate(x, y);
  setInk(g, size / 2);
  painter(g, size / 2 * 0.86);
  g.restore();
}

const _cache = new Map();
export function iconCanvas(id, size = 64) {
  const key = `${id}:${size}`;
  let c = _cache.get(key);
  if (!c) { c = makeCanvas(size, size); drawIcon(c.getContext('2d'), id, size / 2, size / 2, size * 0.92); _cache.set(key, c); }
  return c;
}
export function iconURL(id, size = 64) { return iconCanvas(id, size).toDataURL(); }
