import { createStorageBackend } from '../utils/Helpers.js';

export const EMPTY_STATS = Object.freeze({
  gamesPlayed: 0, localMatches: 0, practiceShots: 0, wins: 0, losses: 0, shots: 0, ballsPocketed: 0, fouls: 0, longestRun: 0, secondsPlayed: 0,
  vsAI: { easy: { w: 0, l: 0 }, medium: { w: 0, l: 0 }, hard: { w: 0, l: 0 } },
});

function sanitize(raw) {
  const s = JSON.parse(JSON.stringify(EMPTY_STATS));
  if (!raw || typeof raw !== 'object') return s;
  for (const k of ['gamesPlayed', 'localMatches', 'practiceShots', 'wins', 'losses', 'shots', 'ballsPocketed', 'fouls', 'longestRun', 'secondsPlayed']) {
    if (Number.isFinite(raw[k]) && raw[k] >= 0) s[k] = Math.floor(raw[k]);
  }
  for (const d of ['easy', 'medium', 'hard']) {
    const e = raw.vsAI && raw.vsAI[d];
    if (e && Number.isFinite(e.w) && Number.isFinite(e.l)) s.vsAI[d] = { w: Math.max(0, e.w | 0), l: Math.max(0, e.l | 0) };
  }
  return s;
}

export class StatsStore {
  constructor(backend = createStorageBackend()) {
    this.backend = backend;
    this.data = sanitize(null);
  }

  async load() {
    try {
      const text = await this.backend.read('stats');
      this.data = sanitize(text ? JSON.parse(text) : null);
    } catch { this.data = sanitize(null); }
    return this.data;
  }

  /** Record a finished match from the human's point of view (player index 0). */
  record(summary, { humanIndex = 0, vsAI = null, humanWon }) {
    const p = summary.players[humanIndex];
    const d = this.data;
    d.gamesPlayed++;
    if (humanWon) d.wins++; else d.losses++;
    d.shots += p.shots;
    d.ballsPocketed += p.pocketed.length;
    d.fouls += p.fouls;
    d.longestRun = Math.max(d.longestRun, p.longestRun);
    d.secondsPlayed += summary.duration;
    if (vsAI && d.vsAI[vsAI]) d.vsAI[vsAI][humanWon ? 'w' : 'l']++;
    return this.flush();
  }

  recordLocal() { this.data.localMatches++; return this.flush(); }

  recordPractice(shots) { this.data.practiceShots += shots; return this.flush(); }

  async flush() {
    try { await this.backend.write('stats', JSON.stringify(this.data)); } catch (err) { console.warn('[stats] save failed', err); }
  }

  async reset() { this.data = sanitize(null); await this.flush(); }
}
