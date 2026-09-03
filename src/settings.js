// Player preferences, persisted per browser. Comfort options matter most in VR.
const KEY = 'survivorxr.settings';
export const DEFAULTS = { turn: 'smooth', turnSpeed: 120, vignette: true, hud: 'wrist' };
export const settings = { ...DEFAULTS };
try { Object.assign(settings, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { /* private mode etc. */ }
export function saveSettings() {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* ignore */ }
}
