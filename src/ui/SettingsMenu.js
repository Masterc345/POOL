import { h, clear, show } from './dom.js';
import { ASSIST_LEVELS, QUALITY_LEVELS, CLOTH_COLORS } from '../utils/Constants.js';
import { RESOLUTIONS, DEFAULT_SETTINGS } from '../core/Settings.js';

export class SettingsMenu {
  constructor(root, { settings, commentator, onClose }) {
    this.settings = settings; this.commentator = commentator; this.onClose = onClose;
    this.el = h('div', { class: 'screen overlay hidden' });
    this.card = h('div', { class: 'card settings' });
    this.el.append(this.card);
    root.append(this.el);
  }

  open() { this._render(); show(this.el, true); }
  close() { show(this.el, false); this.settings.flush(); this.onClose?.(); }
  get isOpen() { return !this.el.classList.contains('hidden'); }

  _slider(key, label, min, max, step, fmt = (v) => `${Math.round(v * 100)}%`) {
    const out = h('span', { class: 'val' }, fmt(this.settings.get(key)));
    const input = h('input', { type: 'range', min, max, step, value: this.settings.get(key) });
    input.addEventListener('input', () => { const v = parseFloat(input.value); this.settings.set(key, v); out.textContent = fmt(v); });
    return h('label', { class: 'row' }, h('span', {}, label), input, out);
  }

  _select(key, label, options, parse = (v) => v) {
    const sel = h('select', { class: 'input' }, options.map((o) => h('option', { value: o.value, selected: String(o.value) === String(this.settings.get(key)) }, o.label)));
    sel.addEventListener('change', () => this.settings.set(key, parse(sel.value)));
    return h('label', { class: 'row' }, h('span', {}, label), sel);
  }

  _check(key, label) {
    const cb = h('input', { type: 'checkbox', checked: this.settings.get(key) });
    cb.addEventListener('change', () => this.settings.set(key, cb.checked));
    return h('label', { class: 'row' }, h('span', {}, label), cb);
  }

  _voiceRow() {
    const c = this.commentator;
    if (!c) return h('span');
    const voices = c.voices();
    const sel = h('select', { class: 'input' },
      h('option', { value: '', selected: !this.settings.get('commentatorVoice') }, 'Automatic'),
      voices.map((v) => h('option', { value: v.name, selected: v.name === this.settings.get('commentatorVoice') }, v.name)));
    sel.addEventListener('change', () => { this.settings.set('commentatorVoice', sel.value); c.voice = null; });
    const test = h('button', { class: 'btn small', onclick: () => c.test() }, 'Test voice');
    return h('div', {},
      h('label', { class: 'row' }, h('span', {}, 'Voice'), sel),
      h('div', { class: 'row' }, h('span', {}, ''), test),
      voices.length === 0 || !c.available ? h('p', { class: 'note' }, 'No speech voices found on this computer - commentary is shown as on-screen captions.') : null);
  }

  _render() {
    clear(this.card).append(
      h('h2', { class: 'panel-title' }, 'Settings'),
      h('div', { class: 'cols' },
        h('div', {},
          h('h3', {}, 'Graphics'),
          this._select('graphicsQuality', 'Graphics quality', QUALITY_LEVELS.map((q) => ({ value: q, label: q[0].toUpperCase() + q.slice(1) }))),
          this._slider('brightness', 'Table brightness', 0.4, 1.4, 0.05, (v) => `${Math.round(v * 100)}%`),
          window.poolAPI ? this._select('resolution', 'Resolution', RESOLUTIONS.map((r) => ({ value: r, label: r === 'auto' ? 'Auto (window size)' : r }))) : null,
          this._check('fullscreen', 'Fullscreen (F11)'),
          this._select('clothColor', 'Table cloth', CLOTH_COLORS.map((c) => ({ value: c, label: c[0].toUpperCase() + c.slice(1) }))),
          this._check('showCrowd', 'Show audience'),
          this._check('showReferee', 'Show referee'),
          h('h3', {}, 'Audio'),
          this._check('commentary', 'Commentator voice'),
          this._voiceRow(),
          this._slider('audioVolume', 'Audio volume', 0, 1, 0.05),
          this._slider('musicVolume', 'Music volume', 0, 1, 0.05)),
        h('div', {},
          h('h3', {}, 'Controls'),
          this._slider('cameraSensitivity', 'Camera sensitivity', 0.2, 3, 0.1, (v) => v.toFixed(1) + 'x'),
          this._slider('mouseSensitivity', 'Mouse sensitivity', 0.2, 3, 0.1, (v) => v.toFixed(1) + 'x'),
          h('h3', {}, 'Aiming'),
          this._select('assistanceLevel', 'Aiming assistance', ASSIST_LEVELS.map((l, i) => ({ value: i + 1, label: l })), (v) => parseInt(v, 10)),
          this._check('showTrajectory', 'Show trajectory lines'),
          h('h3', {}, 'Gameplay'),
          this._check('showHints', 'Show control hints'),
          this._select('shotClock', 'Shot clock (turn timer)', [{ value: 0, label: 'Off' }, { value: 30, label: '30 seconds' }, { value: 45, label: '45 seconds' }, { value: 60, label: '60 seconds' }], (v) => parseInt(v, 10)),
          this._check('cameraFollowShot', 'Pull back camera while balls roll'))
      ),
      h('div', { class: 'actions' },
        h('button', { class: 'btn ghost', onclick: () => { this.settings.patch({ ...DEFAULT_SETTINGS, playerName: this.settings.get('playerName'), player2Name: this.settings.get('player2Name') }); this._render(); } }, 'Restore defaults'),
        h('button', { class: 'btn primary', onclick: () => this.close() }, 'Done'))
    );
  }
}
