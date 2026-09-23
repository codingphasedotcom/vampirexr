// Procedural soundtrack: a dark harmonic-minor loop (Am – F – Dm – E) built from oscillators and noise, scheduled
// ahead on the WebAudio clock. Layers fade in with `intensity` (0 = menu pad, 1 = boss fight).
const STEPS = 16;
const CHORDS = [ // root (Hz) + chord tones, one bar each
  { root: 110.0, tones: [220.0, 261.63, 329.63] },  // Am
  { root: 87.31, tones: [174.61, 220.0, 261.63] },  // F
  { root: 73.42, tones: [146.83, 174.61, 220.0] },  // Dm
  { root: 82.41, tones: [164.81, 207.65, 246.94] }, // E (G# gives the vampiric harmonic-minor pull)
];
const BASS = [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 1, 1, 0, 0, 1, 0];

export class Music {
  constructor(sfx) { this.sfx = sfx; this.intensity = 0.15; this.enabled = true; this.timer = null; }

  start() {
    const ctx = this.sfx.ctx;
    if (!ctx || this.timer) return;
    this.gain = ctx.createGain(); this.gain.gain.value = this.enabled ? 0.55 : 0;
    this.gain.connect(this.sfx.master);
    this.step = 0; this.next = ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 25);
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.gain) this.gain.gain.setTargetAtTime(on ? 0.55 : 0, this.sfx.ctx.currentTime, 0.2);
  }

  schedule() {
    const ctx = this.sfx.ctx;
    if (this.next < ctx.currentTime - 0.5) this.next = ctx.currentTime + 0.05; // recover after tab throttling
    while (this.next < ctx.currentTime + 0.15) {
      this.play(this.step, this.next);
      const bpm = 100 + this.intensity * 36;
      this.next += 60 / bpm / 4;
      this.step = (this.step + 1) % (STEPS * CHORDS.length);
    }
  }

  voice(type, f, at, dur, vol, { cutoff = 0, detune = 0, attack = 0.005 } = {}) {
    const ctx = this.sfx.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = f; o.detune.value = detune;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    let node = o;
    if (cutoff) { const flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = cutoff; node = o.connect(flt); }
    node.connect(g).connect(this.gain);
    o.start(at); o.stop(at + dur + 0.05);
  }

  hit(at, { t, vol, type, f, fEnd = f, q = 1 }) {
    const ctx = this.sfx.ctx, src = ctx.createBufferSource(), flt = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = this.sfx.noiseBuf; flt.type = type; flt.Q.value = q;
    flt.frequency.setValueAtTime(f, at); flt.frequency.exponentialRampToValueAtTime(fEnd, at + t);
    g.gain.setValueAtTime(vol, at); g.gain.exponentialRampToValueAtTime(0.0001, at + t);
    src.connect(flt).connect(g).connect(this.gain);
    src.start(at, Math.random() * 0.5); src.stop(at + t + 0.02);
  }

  play(step, at) {
    const I = this.intensity, s = step % STEPS, chord = CHORDS[Math.floor(step / STEPS)];
    const stepDur = 60 / (100 + I * 36) / 4;
    if (s === 0) for (const [i, f] of chord.tones.entries()) // pad: detuned saws through a dark filter
      for (const dt of [-9, 9]) this.voice('sawtooth', f / 2, at, stepDur * STEPS * 1.05, 0.018, { cutoff: 700 + I * 900, detune: dt + i, attack: 0.4 });
    if (I > 0.25 && BASS[s]) this.voice('sawtooth', chord.root, at, stepDur * 1.6, 0.09, { cutoff: 260 + I * 500 });
    if (I > 0.35 && s % 4 === 0) { // kick
      const ctx = this.sfx.ctx, o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(150, at); o.frequency.exponentialRampToValueAtTime(42, at + 0.13);
      g.gain.setValueAtTime(0.32, at); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.28);
      o.connect(g).connect(this.gain); o.start(at); o.stop(at + 0.3);
    }
    if (I > 0.55 && (s === 4 || s === 12)) this.hit(at, { t: 0.16, vol: 0.12, type: 'bandpass', f: 1800, fEnd: 900, q: 0.8 });
    if (I > 0.5 && s % 2 === 1) this.hit(at, { t: 0.04, vol: 0.035, type: 'highpass', f: 7000 });
    if (I > 0.7) { // arpeggio over the chord, an octave up
      const f = chord.tones[s % 3] * (s % 6 < 3 ? 2 : 4) * 0.5;
      this.voice('square', f, at, stepDur * 0.9, 0.022, { cutoff: 2400 });
    }
    if (I > 0.9 && s % 8 === 0) this.voice('sawtooth', chord.root * 4, at, stepDur * 6, 0.02, { cutoff: 1600, detune: 12, attack: 0.05 });
  }
}
