// Player preferences, persisted per browser. Comfort options matter most in VR.
const KEY = 'survivorxr.settings';
export const DEFAULTS = { turn: 'smooth', turnSpeed: 120, vignette: true, hud: 'wrist', level: 'graveyard', music: true, view: 'fps', numbers: true, shake: true, height: 'real' };
export const settings = { ...DEFAULTS };
try { Object.assign(settings, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { /* private mode etc. */ }
export function saveSettings() {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* ignore */ }
}

// The desktop camera height, and the eye height a seated VR player is lifted to (`height: 'seated'`).
export const EYE_HEIGHT = 1.6;

// Seated VR: how far to raise the rig so eyes measured `eye` metres above the headset's floor see from `target`.
// Never lowers anyone (a standing player keeps their real height). Returns null when there is no usable reading
// (headset on the floor, tracking lost) and caps the lift so a bad reading can't launch the view into the air.
export function seatedLift(eye, target = EYE_HEIGHT) {
  if (!Number.isFinite(eye) || eye < 0.3) return null;
  return Math.min(1.2, Math.max(0, target - eye));
}
