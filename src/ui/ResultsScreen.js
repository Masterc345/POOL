import { h, clear, show } from './dom.js';
import { BALL_COLORS } from '../utils/Constants.js';

const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export class ResultsScreen {
  constructor(root, { onRematch, onMenu }) {
    this.onRematch = onRematch; this.onMenu = onMenu;
    this.el = h('div', { class: 'screen overlay hidden' });
    this.card = h('div', { class: 'card results' });
    this.el.append(this.card);
    root.append(this.el);
  }

  show(on = true) { show(this.el, on); }

  render(r) {
    const [a, b] = r.summary.players;
    const [pa, pb] = r.players;
    const row = (label, x, y) => h('tr', {}, h('td', {}, x), h('th', {}, label), h('td', {}, y));
    const balls = (ids) => h('div', { class: 'mini-balls' }, ids.map((id) => h('span', { class: 'mini-ball', style: { background: BALL_COLORS[id] } }, id)));
    clear(this.card).append(
      h('div', { class: 'trophy' }, '\u{1F3C6}'),
      h('h1', { class: 'winner' }, `${r.winnerName} wins!`),
      h('p', { class: 'reason' }, r.reason),
      h('div', { class: 'final-score' }, h('span', { class: r.winner === 0 ? 'win' : '' }, a.pocketed.length), ' : ', h('span', { class: r.winner === 1 ? 'win' : '' }, b.pocketed.length)),
      h('table', { class: 'stats center' },
        h('tr', {}, h('th', {}, pa.name), h('th', {}, 'Match statistics'), h('th', {}, pb.name)),
        row('Balls pocketed', a.pocketed.length, b.pocketed.length),
        row('Shots', a.shots, b.shots),
        row('Fouls', a.fouls, b.fouls),
        row('Longest run', a.longestRun, b.longestRun),
        row('Duration', fmtTime(r.summary.duration), fmtTime(r.summary.duration))),
      h('div', { class: 'pots' }, balls(a.pocketed), balls(b.pocketed)),
      h('div', { class: 'actions' },
        h('button', { class: 'btn primary', onclick: () => this.onRematch() }, 'Rematch'),
        h('button', { class: 'btn', onclick: () => this.onMenu() }, 'Main menu'))
    );
  }
}
