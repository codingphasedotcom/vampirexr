// Tiny procedural sound effects via WebAudio oscillators. No assets needed.
export class Sfx {
  constructor() { this.ctx = null; this.last = {}; }

  init() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  tone({ f = 440, t = 0.1, type = 'square', vol = 0.05, slide = 0, key, gap = 0 }) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (key) {
      if (this.last[key] && now - this.last[key] < gap) return;
      this.last[key] = now;
    }
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, now);
    o.frequency.linearRampToValueAtTime(Math.max(20, f + slide), now + t);
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + t);
    o.connect(g).connect(this.ctx.destination);
    o.start(now); o.stop(now + t + 0.02);
  }

  hit()     { this.tone({ f: 200, t: 0.05, type: 'square', vol: 0.03, slide: -100, key: 'hit', gap: 0.04 }); }
  kill()    { this.tone({ f: 340, t: 0.12, type: 'sawtooth', vol: 0.04, slide: -250, key: 'kill', gap: 0.05 }); }
  pickup()  { this.tone({ f: 900, t: 0.06, type: 'sine', vol: 0.04, slide: 500, key: 'pick', gap: 0.03 }); }
  shoot()   { this.tone({ f: 700, t: 0.05, type: 'triangle', vol: 0.03, slide: -350, key: 'shoot', gap: 0.05 }); }
  zap()     { this.tone({ f: 1200, t: 0.15, type: 'sawtooth', vol: 0.05, slide: -1000, key: 'zap', gap: 0.05 }); }
  hurt()    { this.tone({ f: 110, t: 0.25, type: 'sawtooth', vol: 0.08, slide: -60, key: 'hurt', gap: 0.3 }); }
  gunshot() {
    this.tone({ f: 170, t: 0.1, type: 'sawtooth', vol: 0.09, slide: -140, key: 'gun', gap: 0.03 });
    this.tone({ f: 2400, t: 0.02, type: 'square', vol: 0.03, slide: -1500 });
  }
  roar()    { [70, 55, 45].forEach((f, i) => setTimeout(() => this.tone({ f, t: 0.5, type: 'sawtooth', vol: 0.1, slide: -20 }), i * 160)); }
  levelup() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone({ f, t: 0.18, vol: 0.05 }), i * 90)); }
  die()     { [300, 250, 200, 120].forEach((f, i) => setTimeout(() => this.tone({ f, t: 0.35, type: 'sawtooth', vol: 0.07, slide: -40 }), i * 200)); }
}
