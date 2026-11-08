// Persistent user settings with validation (so a corrupted file can never break the game).
import { QUALITY_LEVELS, AI_DIFFICULTIES, CLOTH_COLORS } from '../utils/Constants.js';
import { clamp, createStorageBackend } from '../utils/Helpers.js';

export const RESOLUTIONS = ['auto', '1280x720', '1366x768', '1600x900', '1920x1080', '2560x1440'];

export const DEFAULT_SETTINGS = Object.freeze({
  graphicsQuality: 'high',
  brightness: 0.7,
  shotClock: 0,
  clothColor: 'green',
  commentary: true,
  commentatorVoice: '',
  showCrowd: true,
  showReferee: true,
  resolution: 'auto',
  fullscreen: false,
  audioVolume: 0.8,
  musicVolume: 0.3,
  cameraSensitivity: 1,
  mouseSensitivity: 1,
  assistanceLevel: 2,
  showTrajectory: true,
  showHints: true,
  cameraFollowShot: true,
  playerName: 'Player 1',
  player2Name: 'Player 2',
  aiDifficulty: 'medium',
});

const SCHEMA = {
  graphicsQuality: (v) => (QUALITY_LEVELS.includes(v) ? v : undefined),
  brightness: (v) => (Number.isFinite(v) ? clamp(v, 0.4, 1.4) : undefined),
  commentary: (v) => (typeof v === 'boolean' ? v : undefined),
  commentatorVoice: (v) => (typeof v === 'string' && v.length <= 120 ? v : undefined),
  clothColor: (v) => (CLOTH_COLORS.includes(v) ? v : undefined),
  showCrowd: (v) => (typeof v === 'boolean' ? v : undefined),
  showReferee: (v) => (typeof v === 'boolean' ? v : undefined),
  shotClock: (v) => ([0, 30, 45, 60].includes(v) ? v : undefined),
  resolution: (v) => (RESOLUTIONS.includes(v) ? v : undefined),
  fullscreen: (v) => (typeof v === 'boolean' ? v : undefined),
  audioVolume: (v) => (Number.isFinite(v) ? clamp(v, 0, 1) : undefined),
  musicVolume: (v) => (Number.isFinite(v) ? clamp(v, 0, 1) : undefined),
  cameraSensitivity: (v) => (Number.isFinite(v) ? clamp(v, 0.2, 3) : undefined),
  mouseSensitivity: (v) => (Number.isFinite(v) ? clamp(v, 0.2, 3) : undefined),
  assistanceLevel: (v) => (Number.isInteger(v) && v >= 1 && v <= 5 ? v : undefined),
  showTrajectory: (v) => (typeof v === 'boolean' ? v : undefined),
  showHints: (v) => (typeof v === 'boolean' ? v : undefined),
  cameraFollowShot: (v) => (typeof v === 'boolean' ? v : undefined),
  playerName: (v) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 16) : undefined),
  player2Name: (v) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 16) : undefined),
  aiDifficulty: (v) => (AI_DIFFICULTIES.includes(v) ? v : undefined),
};

export function sanitizeSettings(raw) {
  const out = { ...DEFAULT_SETTINGS };
  if (raw && typeof raw === 'object') {
    for (const key of Object.keys(SCHEMA)) {
      const v = SCHEMA[key](raw[key]);
      if (v !== undefined) out[key] = v;
    }
  }
  return out;
}

export class SettingsStore {
  constructor(backend = createStorageBackend()) {
    this.backend = backend;
    this.values = { ...DEFAULT_SETTINGS };
    this.fresh = true; // true when nothing was saved yet (first run)
    this.listeners = new Set();
    this._timer = null;
  }

  async load() {
    try {
      const text = await this.backend.read('settings');
      this.fresh = !text;
      this.values = sanitizeSettings(text ? JSON.parse(text) : null);
    } catch (err) {
      console.warn('[settings] could not read saved settings, using defaults', err);
      this.values = { ...DEFAULT_SETTINGS };
    }
    return this.values;
  }

  get(key) { return this.values[key]; }

  set(key, value) { this.patch({ [key]: value }); }

  patch(changes) {
    const next = sanitizeSettings({ ...this.values, ...changes });
    const changed = Object.keys(DEFAULT_SETTINGS).filter((k) => next[k] !== this.values[k]);
    if (!changed.length) return;
    this.values = next;
    for (const fn of this.listeners) fn(this.values, changed);
    this._scheduleSave();
  }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  _scheduleSave() {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.flush(), 250);
  }

  async flush() {
    clearTimeout(this._timer);
    try { await this.backend.write('settings', JSON.stringify(this.values)); }
    catch (err) { console.warn('[settings] save failed', err); }
  }

  resetDefaults() { this.patch({ ...DEFAULT_SETTINGS }); }
}
