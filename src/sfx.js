// Procedural sound effects via WebAudio: oscillators plus filtered noise bursts. No audio assets.
// Everything runs through a limiter; a small generated-impulse reverb adds space, and sounds with a world position
// are panned / attenuated relative to the listener (head position + facing, updated every frame by the game).
export class Sfx {
  constructor() {
    this.ctx = null; this.last = {}; this.out = null; this.noiseBuf = null;
    this.listener = { x: 0, z: 0, yaw: 0 };
    this.ladder = 0; this.ladderAt = 0; // gem pickups climb in pitch while they keep coming
  }

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = this.ctx;
      // everything goes through a limiter so dense fights can't clip
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.15;
      comp.connect(ctx.destination);
      this.master = comp;
      this.out = ctx.createGain(); this.out.gain.value = 1; this.out.connect(comp);
      const len = ctx.sampleRate;
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      // reverb send: 1.4 s of decaying stereo noise as the impulse response
      try {
        const irLen = Math.floor(ctx.sampleRate * 1.4), ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
        for (let ch = 0; ch < 2; ch++) {
          const data = ir.getChannelData(ch);
          for (let i = 0; i < irLen; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 3.2);
        }
        this.verb = ctx.createConvolver(); this.verb.buffer = ir;
        this.verbSend = ctx.createGain(); this.verbSend.gain.value = 0.22;
        this.out.connect(this.verbSend).connect(this.verb).connect(comp);
      } catch { /* convolver unsupported: dry only */ }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setListener(x, z, yaw) { this.listener.x = x; this.listener.z = z; this.listener.yaw = yaw; }

  // Stereo pan (-1..1) and distance gain for a world position.
  spatial(x, z) {
    const L = this.listener, dx = x - L.x, dz = z - L.z, d = Math.hypot(dx, dz);
    if (d < 0.5) return { pan: 0, gain: 1 };
    // listener right vector for heading `yaw` (forward = (-sin yaw, -cos yaw))
    const rx = Math.cos(L.yaw), rz = -Math.sin(L.yaw);
    return { pan: Math.max(-1, Math.min(1, (dx * rx + dz * rz) / d)) * 0.8, gain: 1 / (1 + d * 0.05) };
  }

  gate(key, gap) {
    const now = this.ctx.currentTime;
    if (this.last[key] && now - this.last[key] < gap) return false;
    this.last[key] = now;
    return true;
  }

  // Routes a node to the output, through a stereo panner when `pan` is non-zero.
  route(node, pan) {
    if (pan && this.ctx.createStereoPanner) { const p = this.ctx.createStereoPanner(); p.pan.value = pan; node.connect(p).connect(this.out); }
    else node.connect(this.out);
  }

  tone({ f = 440, t = 0.1, type = 'square', vol = 0.05, slide = 0, key, gap = 0, at = 0, pan = 0, attack = 0 }) {
    if (!this.ctx || (key && !this.gate(key, gap))) return;
    const now = this.ctx.currentTime + at;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, now);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f + slide), now + t);
    if (attack) { g.gain.setValueAtTime(0.0008, now); g.gain.exponentialRampToValueAtTime(vol, now + attack); }
    else g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.0008, now + t);
    o.connect(g); this.route(g, pan);
    o.start(now); o.stop(now + t + 0.02);
  }

  // Filtered white-noise burst: gunshots, impacts, whooshes.
  noise({ t = 0.1, vol = 0.1, type = 'bandpass', f = 1000, q = 1, fEnd = f, key, gap = 0, at = 0, pan = 0 }) {
    if (!this.ctx || (key && !this.gate(key, gap))) return;
    const now = this.ctx.currentTime + at;
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const flt = this.ctx.createBiquadFilter(); flt.type = type; flt.Q.value = q;
    flt.frequency.setValueAtTime(f, now); flt.frequency.exponentialRampToValueAtTime(Math.max(30, fEnd), now + t);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, now); g.gain.exponentialRampToValueAtTime(0.0008, now + t);
    src.connect(flt).connect(g); this.route(g, pan);
    src.start(now, Math.random() * 0.5); src.stop(now + t + 0.02);
  }

  hit()     { this.noise({ t: 0.05, vol: 0.06, f: 1800, q: 2, key: 'hit', gap: 0.035 }); }
  kill()    { this.noise({ t: 0.14, vol: 0.09, f: 700, fEnd: 180, q: 1.5, key: 'kill', gap: 0.05 }); this.tone({ f: 220, t: 0.1, type: 'triangle', vol: 0.04, slide: -150 }); }
  // XP pickups climb a major scale while they keep coming, then reset after a short gap.
  pickup() {
    if (!this.ctx || !this.gate('pick', 0.028)) return;
    const now = this.ctx.currentTime;
    this.ladder = now - this.ladderAt < 0.35 ? Math.min(this.ladder + 1, 21) : 0;
    this.ladderAt = now;
    const SCALE = [0, 2, 4, 5, 7, 9, 11], step = this.ladder;
    const semis = SCALE[step % 7] + 12 * Math.floor(step / 7);
    this.tone({ f: 880 * Math.pow(2, semis / 12), t: 0.07, type: 'sine', vol: 0.032, slide: 300 });
  }
  heal()    { [660, 880, 1320].forEach((f, i) => this.tone({ f, t: 0.18, type: 'sine', vol: 0.04, at: i * 0.05 })); }
  coin()    { this.tone({ f: 1568, t: 0.09, type: 'square', vol: 0.025, key: 'coin', gap: 0.04 }); this.tone({ f: 2093, t: 0.22, type: 'square', vol: 0.022, at: 0.06 }); }
  shoot()   { this.tone({ f: 900, t: 0.08, type: 'sine', vol: 0.035, slide: -500, key: 'shoot', gap: 0.05 }); }
  zap(x, z) {
    const s = x === undefined ? { pan: 0, gain: 1 } : this.spatial(x, z);
    this.noise({ t: 0.22, vol: 0.12 * s.gain, type: 'highpass', f: 2500, fEnd: 800, key: 'zap', gap: 0.05, pan: s.pan });
    this.tone({ f: 1400, t: 0.18, type: 'sawtooth', vol: 0.03 * s.gain, slide: -1100, pan: s.pan });
    this.noise({ t: 0.5, vol: 0.08 * s.gain, type: 'lowpass', f: 300, fEnd: 60, at: 0.03, pan: s.pan });
  }
  hurt()    { this.tone({ f: 120, t: 0.28, type: 'sawtooth', vol: 0.09, slide: -70, key: 'hurt', gap: 0.3 }); this.noise({ t: 0.12, vol: 0.08, type: 'lowpass', f: 500 }); }
  dash()    { this.noise({ t: 0.25, vol: 0.12, f: 600, fEnd: 2600, q: 0.8, key: 'dash', gap: 0.2 }); }
  gunshot() {
    if (!this.ctx || !this.gate('gun', 0.03)) return;
    const k = 0.92 + Math.random() * 0.16; // a little pitch spread so rapid fire doesn't drone
    this.noise({ t: 0.12, vol: 0.2, f: 2400 * k, fEnd: 400, q: 0.7 });
    this.noise({ t: 0.2, vol: 0.14, type: 'lowpass', f: 400 * k, fEnd: 90 });
    this.tone({ f: 150 * k, t: 0.12, type: 'sine', vol: 0.16, slide: -100 });
  }
  roar(x, z) {
    const s = x === undefined ? { pan: 0, gain: 1 } : this.spatial(x, z);
    [70, 55, 45].forEach((f, i) => this.tone({ f, t: 0.55, type: 'sawtooth', vol: 0.1 * s.gain, slide: -20, at: i * 0.16, pan: s.pan }));
    this.noise({ t: 0.9, vol: 0.12 * s.gain, type: 'lowpass', f: 300, fEnd: 80, pan: s.pan });
  }
  boom(x, z, big = 1) {
    const s = x === undefined ? { pan: 0, gain: 1 } : this.spatial(x, z);
    this.noise({ t: 0.5 * big, vol: 0.22 * s.gain, type: 'lowpass', f: 900, fEnd: 60, key: 'boom', gap: 0.06, pan: s.pan });
    this.tone({ f: 70, t: 0.4 * big, type: 'sine', vol: 0.18 * s.gain, slide: -40, pan: s.pan });
  }
  enemyShot(x, z) {
    const s = this.spatial(x, z);
    this.tone({ f: 520, t: 0.16, type: 'triangle', vol: 0.05 * s.gain, slide: -260, key: 'eshot', gap: 0.08, pan: s.pan });
  }
  levelup() { [523, 659, 784, 1046].forEach((f, i) => this.tone({ f, t: 0.22, type: 'triangle', vol: 0.06, at: i * 0.08 })); this.noise({ t: 0.6, vol: 0.04, type: 'highpass', f: 5000, fEnd: 9000, at: 0.2 }); }
  evolve()  { [392, 523, 659, 784, 1046, 1318].forEach((f, i) => this.tone({ f, t: 0.35, type: 'triangle', vol: 0.06, at: i * 0.07 })); this.noise({ t: 0.8, vol: 0.06, type: 'highpass', f: 4000, fEnd: 9000 }); }
  chest()   { [784, 988, 1175, 1568, 1976].forEach((f, i) => this.tone({ f, t: 0.3, type: 'triangle', vol: 0.05, at: i * 0.06 })); this.noise({ t: 0.9, vol: 0.05, type: 'highpass', f: 6000, fEnd: 10000, at: 0.1 }); }
  thunder() { this.noise({ t: 2.2, vol: 0.16, type: 'lowpass', f: 420, fEnd: 45, at: 0.25 + Math.random() * 0.8 }); this.noise({ t: 0.3, vol: 0.08, type: 'highpass', f: 2000, fEnd: 400 }); }
  die()     { [300, 250, 200, 120].forEach((f, i) => this.tone({ f, t: 0.4, type: 'sawtooth', vol: 0.07, slide: -40, at: i * 0.2 })); }
  heartbeat() { this.tone({ f: 62, t: 0.13, type: 'sine', vol: 0.22, slide: -22, key: 'heart', gap: 0.5 }); this.tone({ f: 55, t: 0.15, type: 'sine', vol: 0.17, slide: -20, at: 0.19 }); }
  // low brass-like swell when a boss arrives
  bossHorn() { [55, 82.4, 110, 164.8].forEach((f, i) => this.tone({ f, t: 1.6, type: 'sawtooth', vol: 0.045 - i * 0.006, attack: 0.35, at: 0.1, slide: -3 })); }
  victory() { [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => this.tone({ f, t: i === 6 ? 1.2 : 0.25, type: 'triangle', vol: 0.06, at: i * 0.13 })); }
  revive()  {
    [220, 277, 330, 440, 554, 659].forEach((f, i) => this.tone({ f, t: 1.6, type: 'sawtooth', vol: 0.03, attack: 0.4, at: i * 0.05 }));
    this.noise({ t: 1.5, vol: 0.08, type: 'highpass', f: 3000, fEnd: 9000, at: 0.2 });
  }
  // relics
  vacuum()  { this.noise({ t: 0.9, vol: 0.12, f: 300, fEnd: 3500, q: 1.2 }); [880, 1175, 1568].forEach((f, i) => this.tone({ f, t: 0.3, type: 'sine', vol: 0.04, at: 0.3 + i * 0.07 })); }
  holyBomb() { this.noise({ t: 1.4, vol: 0.3, type: 'lowpass', f: 1200, fEnd: 40 }); this.tone({ f: 90, t: 1.1, type: 'sine', vol: 0.25, slide: -60 }); this.noise({ t: 0.5, vol: 0.1, type: 'highpass', f: 3000, fEnd: 8000 }); }
  freeze()  { [2093, 2637, 3136, 4186].forEach((f, i) => this.tone({ f, t: 0.9, type: 'sine', vol: 0.025, at: i * 0.04 })); this.noise({ t: 0.25, vol: 0.1, type: 'highpass', f: 4000, fEnd: 1500 }); }
  // new weapons
  splash(x, z) { const s = this.spatial(x, z); this.noise({ t: 0.12, vol: 0.09 * s.gain, type: 'highpass', f: 3500, key: 'glass', gap: 0.05, pan: s.pan }); this.noise({ t: 0.5, vol: 0.06 * s.gain, f: 900, fEnd: 2500, q: 0.6, pan: s.pan }); }
  whoosh()  { this.noise({ t: 0.3, vol: 0.06, f: 500, fEnd: 1600, q: 1.5, key: 'whoosh', gap: 0.08 }); }
  frost()   { this.noise({ t: 0.35, vol: 0.12, type: 'highpass', f: 2500, fEnd: 6000, key: 'frost', gap: 0.1 }); [1760, 2349, 2794].forEach((f, i) => this.tone({ f, t: 0.6, type: 'sine', vol: 0.03, at: i * 0.03 })); }
  buy()     { [988, 1319, 1976].forEach((f, i) => this.tone({ f, t: 0.16, type: 'square', vol: 0.03, at: i * 0.05 })); }
  deny()    { this.tone({ f: 180, t: 0.18, type: 'square', vol: 0.04, slide: -60 }); }
}
