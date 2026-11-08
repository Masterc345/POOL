// Per-player match statistics.
export class ScoreManager {
  constructor(playerCount = 2) {
    this.players = Array.from({ length: playerCount }, () => ({
      pocketed: [], shots: 0, fouls: 0, run: 0, longestRun: 0,
    }));
    this.startedAt = Date.now();
  }

  recordShot(player, outcome) {
    const s = this.players[player];
    s.shots++;
    for (const id of outcome.legalPots) s.pocketed.push(id);
    if (outcome.foul) s.fouls++;
    if (outcome.continues && outcome.legalPots.length) {
      s.run += outcome.legalPots.length;
    } else {
      s.run = outcome.legalPots.length;
    }
    s.longestRun = Math.max(s.longestRun, s.run);
    if (!outcome.continues) s.run = 0;
  }

  score(player) { return this.players[player].pocketed.length; }

  durationSeconds() { return Math.round((Date.now() - this.startedAt) / 1000); }

  summary() {
    return { players: this.players.map((p) => ({ ...p, pocketed: [...p.pocketed] })), duration: this.durationSeconds() };
  }
}
