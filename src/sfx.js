// Procedural sound effects via WebAudio: oscillators plus filtered noise bursts. No audio assets.
export class Sfx {
  constructor() { this.ctx = null; this.last = {}; this.out = null; this.noiseBuf = null; }

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      // everything goes through a limiter so dense fights can't clip
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.15;
      comp.connect(this.ctx.destination);
      this.master = comp;
      this.out = this.ctx.createGain(); this.out.gain.value = 1; this.out.connect(comp);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  gate(key, gap) {
    const now = this.ctx.currentTime;
    if (this.last[key] && now - this.last[key] < gap) return false;
    this.last[key] = now;
    return true;
  }

  tone({ f = 440, t = 0.1, type = 'square', vol = 0.05, slide = 0, key, gap = 0, at = 0 }) {
    if (!this.ctx || (key && !this.gate(key, gap))) return;
    const now = this.ctx.currentTime + at;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, now);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f + slide), now + t);
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.0008, now + t);
    o.connect(g).connect(this.out);
    o.start(now); o.stop(now + t + 0.02);
  }

  // Filtered white-noise burst: gunshots, impacts, whooshes.
  noise({ t = 0.1, vol = 0.1, type = 'bandpass', f = 1000, q = 1, fEnd = f, key, gap = 0, at = 0 }) {
    if (!this.ctx || (key && !this.gate(key, gap))) return;
    const now = this.ctx.currentTime + at;
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const flt = this.ctx.createBiquadFilter(); flt.type = type; flt.Q.value = q;
    flt.frequency.setValueAtTime(f, now); flt.frequency.exponentialRampToValueAtTime(Math.max(30, fEnd), now + t);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, now); g.gain.exponentialRampToValueAtTime(0.0008, now + t);
    src.connect(flt).connect(g).connect(this.out);
    src.start(now, Math.random() * 0.5); src.stop(now + t + 0.02);
  }

  hit()     { this.noise({ t: 0.05, vol: 0.06, f: 1800, q: 2, key: 'hit', gap: 0.035 }); }
  kill()    { this.noise({ t: 0.14, vol: 0.09, f: 700, fEnd: 180, q: 1.5, key: 'kill', gap: 0.05 }); this.tone({ f: 220, t: 0.1, type: 'triangle', vol: 0.04, slide: -150 }); }
  pickup()  { this.tone({ f: 1200, t: 0.07, type: 'sine', vol: 0.035, slide: 600, key: 'pick', gap: 0.03 }); }
  shoot()   { this.tone({ f: 900, t: 0.08, type: 'sine', vol: 0.035, slide: -500, key: 'shoot', gap: 0.05 }); }
  zap()     { this.noise({ t: 0.22, vol: 0.12, type: 'highpass', f: 2500, fEnd: 800, key: 'zap', gap: 0.05 }); this.tone({ f: 1400, t: 0.18, type: 'sawtooth', vol: 0.03, slide: -1100 }); }
  hurt()    { this.tone({ f: 120, t: 0.28, type: 'sawtooth', vol: 0.09, slide: -70, key: 'hurt', gap: 0.3 }); this.noise({ t: 0.12, vol: 0.08, type: 'lowpass', f: 500 }); }
  dash()    { this.noise({ t: 0.25, vol: 0.12, f: 600, fEnd: 2600, q: 0.8, key: 'dash', gap: 0.2 }); }
  gunshot() {
    if (!this.ctx || !this.gate('gun', 0.03)) return;
    this.noise({ t: 0.12, vol: 0.2, f: 2400, fEnd: 400, q: 0.7 });
    this.noise({ t: 0.2, vol: 0.14, type: 'lowpass', f: 400, fEnd: 90 });
    this.tone({ f: 150, t: 0.12, type: 'sine', vol: 0.16, slide: -100 });
  }
  roar()    { [70, 55, 45].forEach((f, i) => this.tone({ f, t: 0.55, type: 'sawtooth', vol: 0.1, slide: -20, at: i * 0.16 })); this.noise({ t: 0.9, vol: 0.12, type: 'lowpass', f: 300, fEnd: 80 }); }
  levelup() { [523, 659, 784, 1046].forEach((f, i) => this.tone({ f, t: 0.22, type: 'triangle', vol: 0.06, at: i * 0.08 })); }
  evolve()  { [392, 523, 659, 784, 1046, 1318].forEach((f, i) => this.tone({ f, t: 0.35, type: 'triangle', vol: 0.06, at: i * 0.07 })); this.noise({ t: 0.8, vol: 0.06, type: 'highpass', f: 4000, fEnd: 9000 }); }
  thunder() { this.noise({ t: 2.2, vol: 0.16, type: 'lowpass', f: 420, fEnd: 45, at: 0.25 + Math.random() * 0.8 }); this.noise({ t: 0.3, vol: 0.08, type: 'highpass', f: 2000, fEnd: 400 }); }
  die()     { [300, 250, 200, 120].forEach((f, i) => this.tone({ f, t: 0.4, type: 'sawtooth', vol: 0.07, slide: -40, at: i * 0.2 })); }
}
