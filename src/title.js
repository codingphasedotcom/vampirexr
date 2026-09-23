// Console-style front end for desktop: a "press any button" splash, then a vertical main menu driven by
// keyboard (arrows/WASD, Enter, Esc), mouse, or gamepad (D-pad/stick, A, B). Sub-screens swap in place.
// The in-headset menu is separate (menu.js); this one only exists in the 2D page.

const LEVEL_META = {
  graveyard: { icon: '🪦', tags: ['Night', 'Survival', '25 waves'], bg: 'linear-gradient(150deg, #3a2466 0%, #150c26 55%, #07040d 100%)' },
  village: { icon: '🌻', tags: ['Day', 'Survival', '25 waves'], bg: 'linear-gradient(150deg, #5fb0ff 0%, #6fa846 70%, #2f5a1f 100%)' },
  city: { icon: '🌃', tags: ['Night', 'Survival', '25 waves'], bg: 'linear-gradient(150deg, #1a2346 0%, #3b1f45 55%, #c9782f 130%)' },
  castle: { icon: '🏰', tags: ['Adventure', '4 chambers', 'Boss gates'], bg: 'linear-gradient(150deg, #5a4380 0%, #221a3a 60%, #0b0814 100%)' },
};

const HOWTO = `
  <div class="t-howto">
    <div class="t-card"><h3>Keyboard &amp; Mouse</h3>
      <p><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move · mouse look</p>
      <p><kbd>Click</kbd> hold to shoot · <kbd>Shift</kbd> dash</p>
      <p><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> pick upgrade · <kbd>Esc</kbd> pause</p></div>
    <div class="t-card"><h3>Top-Down View</h3>
      <p><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move · mouse aims the revolver</p>
      <p><kbd>Click</kbd> shoot · <kbd>Space</kbd>/<kbd>Shift</kbd> dash · <kbd>Esc</kbd> pause</p>
      <p>Gamepad: right stick aims, <kbd>RT</kbd> fires (auto-aims if the stick is idle)</p></div>
    <div class="t-card"><h3>Gamepad</h3>
      <p>Left stick move · right stick look</p>
      <p><kbd>RT</kbd> shoot · <kbd>B</kbd> dash</p>
      <p><kbd>A</kbd> pick · <kbd>Start</kbd> pause</p></div>
    <div class="t-card"><h3>VR Controllers</h3>
      <p>Left stick move · right stick turn</p>
      <p><kbd>Trigger</kbd> shoot / pick · <kbd>Grip</kbd> dash</p>
      <p><kbd>A</kbd><kbd>B</kbd><kbd>X</kbd><kbd>Y</kbd> pause</p></div>
    <div class="t-card"><h3>Hand Tracking</h3>
      <p>Swing your arms to run</p>
      <p><kbd>Pinch</kbd> to shoot</p>
      <p>Point + pinch to pick</p></div>
  </div>
  <ul class="t-tips">
    <li><i style="background:#5ffff0"></i><b>Precision</b> Aim through enemy centers for 1.5× damage.</li>
    <li><i style="background:#ffd166"></i><b>Chests</b> Golden beams mark treasure — walk in for a free upgrade.</li>
    <li><i style="background:#c77dff"></i><b>Evolutions</b> Max a weapon while owning its paired passive.</li>
    <li><i style="background:#ff4d6d"></i><b>Bosses</b> Waves 4, 8, 12, 17 and 25. Slay the Vampire Lord.</li>
  </ul>`;

export class TitleScreen {
  // opts: { levels, settings, sfx, onPlay, onEnterVR, onFullscreen, onLevel, onSetting, onFirstInput }
  constructor(opts) {
    Object.assign(this, opts);
    this.vr = { ok: false, reason: 'Checking for a headset…' };
    this.screen = 'splash';
    this.sel = 0;
    this.el = document.getElementById('title');
    this.el.innerHTML = `
      <div class="t-art"></div><div class="t-shade"></div><div class="t-embers"></div>
      <div class="t-splash">
        <img class="t-logo t-logo-big" alt="VampiresXR">
        <div class="t-press">Press any button</div>
      </div>
      <div class="t-main">
        <div class="t-left">
          <img class="t-logo" alt="VampiresXR">
          <div class="t-heading"></div>
          <nav class="t-menu"></nav>
          <div class="t-panel"></div>
        </div>
        <aside class="t-level"></aside>
      </div>
      <footer class="t-bar"><span class="t-hints"></span><span class="t-ver">v2.0 · WebXR</span></footer>`;
    this.menuEl = this.el.querySelector('.t-menu');
    this.panelEl = this.el.querySelector('.t-panel');
    this.levelEl = this.el.querySelector('.t-level');
    this.headingEl = this.el.querySelector('.t-heading');
    const embers = this.el.querySelector('.t-embers');
    for (let i = 0; i < 30; i++) {
      const e = document.createElement('i');
      e.style.left = `${Math.random() * 100}%`;
      e.style.animationDuration = `${7 + Math.random() * 10}s`;
      e.style.animationDelay = `${-Math.random() * 15}s`;
      e.style.setProperty('--s', 0.5 + Math.random());
      embers.appendChild(e);
    }
    this.keyLogo();
    this.el.addEventListener('pointerdown', (e) => { if (this.screen === 'splash') { e.preventDefault(); this.leaveSplash(); } });
    this.render();
  }

  get visible() { return !this.el.hidden; }

  show(splash = false) {
    this.el.hidden = false;
    this.screen = splash ? 'splash' : 'main';
    this.sel = 0;
    this.render();
  }

  hide() { this.el.hidden = true; }

  setVR(ok, reason = '') { this.vr = { ok, reason }; this.render(); }

  // The logo ships on near-black: key brightness to alpha so it floats over the art.
  keyLogo() {
    const src = new Image();
    src.onload = () => {
      const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
      const g = c.getContext('2d'); g.drawImage(src, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height), px = d.data;
      for (let i = 0; i < px.length; i += 4) {
        const m = Math.max(px[i], px[i + 1], px[i + 2]), a = Math.min(255, Math.max(0, (m - 18) * 1.7));
        if (a > 0) { const k = 255 / Math.max(m, 1); px[i] = Math.min(255, px[i] * k); px[i + 1] = Math.min(255, px[i + 1] * k); px[i + 2] = Math.min(255, px[i + 2] * k); }
        px[i + 3] = a;
      }
      g.putImageData(d, 0, 0);
      const url = c.toDataURL('image/png');
      this.el.querySelectorAll('.t-logo').forEach((img) => { img.src = url; });
    };
    src.src = '/img/logo.png';
  }

  // ---------- menu model ----------

  items() {
    const s = this.settings, L = this.levels.find((l) => l.id === s.level) || this.levels[0];
    const onOff = (v) => (v ? 'On' : 'Off');
    if (this.screen === 'settings') return [
      { label: 'Turning', value: s.turn === 'snap' ? 'Snap 45°' : 'Smooth', cycle: (d) => this.onSetting('turn', s.turn === 'snap' ? 'smooth' : 'snap') },
      { label: 'Comfort Vignette', value: onOff(s.vignette), cycle: () => this.onSetting('vignette', !s.vignette) },
      { label: 'Music', value: onOff(s.music), cycle: () => this.onSetting('music', !s.music) },
      { label: 'VR HUD', value: s.hud === 'wrist' ? 'Wrist' : 'Fixed', cycle: () => this.onSetting('hud', s.hud === 'wrist' ? 'camera' : 'wrist') },
      { label: 'Back', back: true, act: () => this.go('main', 5) },
    ];
    if (this.screen === 'howto') return [{ label: 'Back', back: true, act: () => this.go('main', 4) }];
    return [
      { label: 'Play', big: true, act: () => { this.confirmSound(); this.onPlay(); } },
      { label: 'Battlefield', value: L.name, cycle: (d) => this.cycleLevel(d) },
      { label: 'View', value: s.view === 'topdown' ? 'Top-Down' : 'First Person', cycle: () => this.onSetting('view', s.view === 'topdown' ? 'fps' : 'topdown') },
      { label: 'Enter VR', disabled: !this.vr.ok, note: this.vr.ok ? '' : this.vr.reason, act: () => { this.confirmSound(); this.onEnterVR(); } },
      { label: 'How to Play', act: () => this.go('howto') },
      { label: 'Settings', act: () => this.go('settings') },
      { label: 'Fullscreen', act: () => this.onFullscreen() },
    ];
  }

  go(screen, sel = 0) { this.screen = screen; this.sel = sel; this.confirmSound(); this.render(); }

  cycleLevel(d) {
    const i = this.levels.findIndex((l) => l.id === this.settings.level);
    this.onLevel(this.levels[(i + d + this.levels.length) % this.levels.length].id);
    this.moveSound();
    this.render();
  }

  // ---------- input ----------

  leaveSplash() {
    this.onFirstInput?.();
    this.screen = 'main'; this.sel = 0;
    this.confirmSound();
    this.render();
  }

  // Generic actions: up, down, left, right, accept, back. Returns true if handled.
  action(a) {
    if (!this.visible) return false;
    if (this.screen === 'splash') { this.leaveSplash(); return true; }
    const items = this.items(), item = items[this.sel];
    if ((a === 'up' || a === 'down') && this.screen === 'howto') { // the only item is Back: scroll the page instead
      this.panelEl.scrollBy({ top: a === 'up' ? -140 : 140, behavior: 'smooth' });
      return true;
    }
    if (a === 'up' || a === 'down') {
      const n = items.length, step = a === 'up' ? -1 : 1;
      let i = this.sel;
      for (let k = 0; k < n; k++) { i = (i + step + n) % n; if (!items[i].disabled) break; }
      if (i !== this.sel) { this.sel = i; this.moveSound(); this.render(); }
    } else if ((a === 'left' || a === 'right') && item?.cycle) {
      item.cycle(a === 'left' ? -1 : 1); this.moveSound(); this.render();
    } else if (a === 'accept' && item && !item.disabled) {
      if (item.cycle) { item.cycle(1); this.moveSound(); this.render(); } else item.act();
    } else if (a === 'back' && this.screen !== 'main') {
      this.backSound(); this.screen = 'main'; this.sel = 0; this.render();
    }
    return true;
  }

  key(code) {
    const map = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
      Enter: 'accept', Space: 'accept', NumpadEnter: 'accept', Escape: 'back', Backspace: 'back' };
    if (this.screen === 'splash') return this.action('accept');
    if (code === 'KeyF') { this.onFullscreen(); return true; }
    return map[code] ? this.action(map[code]) : false;
  }

  // ---------- sounds ----------

  moveSound() { this.sfx.tone({ f: 620, t: 0.05, type: 'triangle', vol: 0.03, slide: 80 }); }
  confirmSound() { this.sfx.tone({ f: 740, t: 0.12, type: 'triangle', vol: 0.05, slide: 500 }); }
  backSound() { this.sfx.tone({ f: 520, t: 0.1, type: 'triangle', vol: 0.04, slide: -220 }); }

  // ---------- view ----------

  render() {
    const el = this.el;
    el.dataset.screen = this.screen;
    if (this.screen === 'splash') {
      el.querySelector('.t-hints').innerHTML = '<kbd>Any key</kbd> / <kbd>A</kbd> / click to begin';
      return;
    }
    const items = this.items();
    this.headingEl.textContent = { main: '', settings: 'Settings', howto: 'How to Play' }[this.screen];
    this.menuEl.innerHTML = '';
    items.forEach((it, i) => {
      const b = document.createElement('button');
      b.className = `t-item${i === this.sel ? ' on' : ''}${it.disabled ? ' off' : ''}${it.big ? ' big' : ''}${it.back ? ' back' : ''}`;
      b.innerHTML = `<span class="t-label">${it.label}</span>` +
        (it.value !== undefined ? `<span class="t-value"><em class="t-arrow" data-d="-1">‹</em>${it.value}<em class="t-arrow" data-d="1">›</em></span>` : '') +
        (it.note ? `<span class="t-note">${it.note}</span>` : '');
      b.onmouseenter = () => { if (!it.disabled && this.sel !== i) { this.sel = i; this.moveSound(); this.render(); } };
      b.onclick = (e) => {
        if (it.disabled) return;
        this.sel = i;
        const d = e.target.closest('.t-arrow')?.dataset.d;
        if (d && it.cycle) { it.cycle(Number(d)); this.moveSound(); this.render(); } else this.action('accept');
      };
      this.menuEl.appendChild(b);
    });
    this.panelEl.innerHTML = this.screen === 'howto' ? HOWTO : '';
    const L = this.levels.find((l) => l.id === this.settings.level) || this.levels[0], meta = LEVEL_META[L.id] || LEVEL_META.graveyard;
    this.levelEl.innerHTML = this.screen === 'howto' ? '' : `
      <div class="t-lv-art" style="background:${meta.bg}"><span>${meta.icon}</span></div>
      <div class="t-lv-body">
        <div class="t-lv-kicker">Battlefield</div>
        <div class="t-lv-name">${L.name}</div>
        <div class="t-lv-desc">${L.desc}</div>
        <div class="t-lv-tags">${meta.tags.map((t) => `<span>${t}</span>`).join('')}<span class="t-lv-view">${this.settings.view === 'topdown' ? 'Top-Down · huge hordes' : 'First Person'}</span></div>
      </div>`;
    const it = items[this.sel];
    el.querySelector('.t-hints').innerHTML =
      `<span><kbd>↑</kbd><kbd>↓</kbd> Select</span>` +
      (it?.cycle ? `<span><kbd>←</kbd><kbd>→</kbd> Change</span>` : '') +
      `<span><kbd>Enter</kbd> / <kbd>A</kbd> Confirm</span>` +
      (this.screen !== 'main' ? `<span><kbd>Esc</kbd> / <kbd>B</kbd> Back</span>` : '');
  }
}
