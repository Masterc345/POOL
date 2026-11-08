import { h, clear, show } from './dom.js';
import { ASSIST_LEVELS, AI_DIFFICULTIES } from '../utils/Constants.js';

const fmtTime = (s) => { const m = Math.floor(s / 60); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m ${s % 60}s`; };

export class MainMenu {
  /** cb: { onStart(config), onSettings(), onExit() } */
  constructor(root, { settings, stats, cb, sound }) {
    this.settings = settings; this.stats = stats; this.cb = cb; this.sound = sound;
    this.el = h('div', { class: 'screen menu' });
    this.panel = h('div', { class: 'menu-panel' });
    this.el.append(
      h('div', { class: 'logo' },
        h('div', { class: 'logo-ball' }, '8'),
        h('div', {}, h('div', { class: 'logo-title' }, 'PoolMaster', h('span', {}, '3D')), h('div', { class: 'logo-sub' }, 'Eight-Ball Pool Simulator'))),
      this.panel,
      h('div', { class: 'menu-footer' }, 'F11 fullscreen')
    );
    root.append(this.el);
    this.showMain();
  }

  _btn(label, onclick, cls = '') {
    return h('button', { class: `btn ${cls}`, onclick: (e) => { this.sound?.unlock(); this.sound?.playUi('click'); onclick(e); } }, label);
  }

  show(on = true) { show(this.el, on); if (on) this.showMain(); }

  showMain() {
    this.atRoot = true;
    clear(this.panel).append(
      this._btn('Play', () => this.showPlay(), 'primary'),
      this._btn('Multiplayer', () => this.showLocal()),
      this._btn('Practice', () => this.showPractice()),
      this._btn('Statistics', () => this.showStats()),
      this._btn('Settings', () => this.cb.onSettings()),
      window.poolAPI ? this._btn('Exit', () => this.cb.onExit(), 'danger') : null
    );
  }

  _title(text) { this.atRoot = false; return h('h2', { class: 'panel-title' }, text); }
  _back() { return this._btn('Back', () => this.showMain(), 'ghost'); }

  _segmented(options, value, onChange) {
    const wrap = h('div', { class: 'segmented' });
    const render = (v) => {
      clear(wrap);
      for (const o of options) {
        wrap.append(h('button', { class: `seg ${o.value === v ? 'on' : ''}`, onclick: () => { onChange(o.value); render(o.value); } }, o.label));
      }
    };
    render(value);
    return wrap;
  }

  showPlay() {
    let difficulty = this.settings.get('aiDifficulty');
    let level = this.settings.get('assistanceLevel');
    const name = h('input', { class: 'input', type: 'text', maxlength: 16, value: this.settings.get('playerName') });
    clear(this.panel).append(
      this._title('Single Player'),
      h('label', { class: 'field' }, 'Your name', name),
      h('div', { class: 'field' }, 'Computer opponent',
        this._segmented(AI_DIFFICULTIES.map((d) => ({ value: d, label: d[0].toUpperCase() + d.slice(1) })), difficulty, (v) => { difficulty = v; })),
      h('div', { class: 'field' }, 'Aiming assistance',
        this._segmented(ASSIST_LEVELS.map((l, i) => ({ value: i + 1, label: l })), level, (v) => { level = v; })),
      this._btn('Start match', () => {
        this.settings.patch({ playerName: name.value, aiDifficulty: difficulty, assistanceLevel: level });
        this.cb.onStart({ mode: 'single', difficulty });
      }, 'primary'),
      this._back()
    );
  }

  showLocal() {
    let level = this.settings.get('assistanceLevel');
    const n1 = h('input', { class: 'input', type: 'text', maxlength: 16, value: this.settings.get('playerName') });
    const n2 = h('input', { class: 'input', type: 'text', maxlength: 16, value: this.settings.get('player2Name') });
    clear(this.panel).append(
      this._title('Local Multiplayer'),
      h('p', { class: 'note' }, 'Two players share this computer. Turns switch automatically.'),
      h('label', { class: 'field' }, 'Player 1', n1),
      h('label', { class: 'field' }, 'Player 2', n2),
      h('div', { class: 'field' }, 'Aiming assistance',
        this._segmented(ASSIST_LEVELS.map((l, i) => ({ value: i + 1, label: l })), level, (v) => { level = v; })),
      this._btn('Start match', () => {
        this.settings.patch({ playerName: n1.value, player2Name: n2.value, assistanceLevel: level });
        this.cb.onStart({ mode: 'local' });
      }, 'primary'),
      this._back()
    );
  }

  showPractice() {
    const go = (kind) => this.cb.onStart({ mode: 'practice', practice: kind });
    clear(this.panel).append(
      this._title('Practice'),
      this._btn('Free play - full rack, no rules', () => go('free'), 'primary'),
      this._btn('Aiming practice - scattered balls', () => go('aim')),
      this._btn('Shot practice - pocket the marked ball', () => go('shot')),
      this._back()
    );
  }

  showStats() {
    const d = this.stats.data;
    const row = (k, v) => h('tr', {}, h('td', {}, k), h('td', {}, String(v)));
    const ai = (n) => `${d.vsAI[n].w} W / ${d.vsAI[n].l} L`;
    clear(this.panel).append(
      this._title('Statistics'),
      h('table', { class: 'stats' },
        row('Games vs computer', d.gamesPlayed), row('Wins', d.wins), row('Losses', d.losses),
        row('vs Easy', ai('easy')), row('vs Medium', ai('medium')), row('vs Hard', ai('hard')),
        row('Local matches', d.localMatches), row('Shots taken (vs computer)', d.shots),
        row('Balls pocketed (vs computer)', d.ballsPocketed), row('Fouls', d.fouls), row('Longest run', d.longestRun),
        row('Practice shots', d.practiceShots), row('Time played (vs computer)', fmtTime(d.secondsPlayed))),
      this._btn('Reset statistics', async () => { if (confirm('Reset all statistics?')) { await this.stats.reset(); this.showStats(); } }, 'danger'),
      this._back()
    );
  }
}
