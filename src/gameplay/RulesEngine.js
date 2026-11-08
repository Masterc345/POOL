// Eight-ball rules. Pure logic: no rendering or physics imports.
// It consumes the event list produced by the physics world for one shot.
import { GROUPS } from '../utils/Constants.js';
import { CUE_ID, EIGHT_ID, groupOf, idsOfGroup } from '../balls/Rack.js';

export class RulesEngine {
  constructor() { this.reset(); }

  reset() {
    this.current = 0;
    this.groups = [null, null]; // GROUPS.SOLIDS / GROUPS.STRIPES per player
    this.onTable = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    this.breakDone = false;
    this.ballInHand = true; // the opening break is taken from behind the head string
    this.ballInHandKitchen = true;
    this.winner = null;
    this.gameOverReason = '';
  }

  /** Object balls the given player may legally contact first. */
  legalTargets(player = this.current) {
    const g = this.groups[player];
    if (!g) return [...this.onTable].filter((id) => id !== EIGHT_ID); // open table
    const own = idsOfGroup(g).filter((id) => this.onTable.has(id));
    return own.length ? own : this.onTable.has(EIGHT_ID) ? [EIGHT_ID] : [];
  }

  remainingOwn(player) {
    const g = this.groups[player];
    return g ? idsOfGroup(g).filter((id) => this.onTable.has(id)) : [];
  }

  /** The shooter ran out of time: foul, opponent gets ball in hand. */
  processTimeout() {
    const p = this.current;
    const next = 1 - p;
    this.current = next;
    this.ballInHand = true; // ballInHandKitchen stays true if the opening break has not been taken
    return {
      player: p, nextPlayer: next, foul: true, fouls: ['Shot clock expired'], ballInHand: true, winner: null,
      reason: '', assigned: null, respot: [], pocketed: [], legalPots: [], continues: false, firstContact: null, isBreak: !this.breakDone,
    };
  }

  /**
   * @param events physics events of the shot (ballHit / cushion / pocket)
   * @returns outcome describing fouls, turn change, win/loss etc. and updates internal state
   */
  processShot(events) {
    const p = this.current;
    const opp = 1 - p;
    const isBreak = !this.breakDone;

    const pocketed = events.filter((e) => e.type === 'pocket').map((e) => e.id);
    const cuePocketed = pocketed.includes(CUE_ID);
    const objPocketed = pocketed.filter((id) => id !== CUE_ID);
    const firstHit = events.find((e) => e.type === 'ballHit' && (e.a === CUE_ID || e.b === CUE_ID));
    const firstContact = firstHit ? (firstHit.a === CUE_ID ? firstHit.b : firstHit.a) : null;
    const firstHitIndex = firstHit ? events.indexOf(firstHit) : -1;

    const fouls = [];
    const targetsBefore = this.legalTargets(p);
    const ownBefore = this.remainingOwn(p);

    if (firstContact === null) {
      fouls.push('No ball was hit');
    } else if (!targetsBefore.includes(firstContact)) {
      if (isBreak) { /* any rack ball is legal on the break */ }
      else if (!this.groups[p]) fouls.push('Hit the 8-ball first on an open table');
      else if (ownBefore.length === 0) fouls.push('Must hit the 8-ball first');
      else fouls.push('Hit the wrong ball first');
    }
    if (cuePocketed) fouls.push('Scratch (cue ball pocketed)');

    if (isBreak) {
      const toRail = new Set();
      for (const e of events) if (e.type === 'cushion' && e.id !== CUE_ID) toRail.add(e.id);
      if (!objPocketed.length && toRail.size < 4) fouls.push('Illegal break (fewer than 4 balls reached a rail)');
    } else if (firstContact !== null && !objPocketed.length) {
      const railAfter = events.slice(firstHitIndex + 1).some((e) => e.type === 'cushion');
      if (!railAfter) fouls.push('No ball reached a rail after contact');
    }

    const foul = fouls.length > 0;
    const respot = [];
    let winner = null;
    let reason = '';

    // ---- eight ball ----
    if (objPocketed.includes(EIGHT_ID)) {
      if (isBreak) {
        respot.push(EIGHT_ID); // 8 on the break is re-spotted
      } else {
        const cleared = this.groups[p] !== null && ownBefore.length === 0;
        if (cleared && !foul) { winner = p; reason = 'Pocketed the 8-ball legally'; }
        else {
          winner = opp;
          reason = !cleared ? 'Pocketed the 8-ball too early' : `Fouled while pocketing the 8-ball (${fouls[0]})`;
        }
      }
    }

    // ---- group assignment (open table, legal pot, not on the break) ----
    let assigned = null;
    if (!isBreak && !this.groups[p] && !foul && winner === null) {
      const first = objPocketed.find((id) => id !== EIGHT_ID);
      if (first) {
        this.groups[p] = groupOf(first);
        this.groups[opp] = this.groups[p] === GROUPS.SOLIDS ? GROUPS.STRIPES : GROUPS.SOLIDS;
        assigned = { player: p, group: this.groups[p] };
      }
    }

    // ---- legal pocket? ----
    const legalPots = objPocketed.filter((id) => {
      if (id === EIGHT_ID) return false;
      return !this.groups[p] || groupOf(id) === this.groups[p];
    });

    // update table state
    for (const id of objPocketed) if (!respot.includes(id)) this.onTable.delete(id);
    this.breakDone = true;

    let next = p;
    let ballInHand = false;
    if (winner !== null) {
      this.winner = winner;
      this.gameOverReason = reason;
    } else if (foul) {
      next = opp;
      ballInHand = true;
    } else if (legalPots.length === 0) {
      next = opp;
    }
    this.current = next;
    this.ballInHand = ballInHand;
    this.ballInHandKitchen = false;

    return {
      player: p, nextPlayer: next, foul, fouls, ballInHand, winner, reason,
      assigned, respot, pocketed, legalPots,
      continues: winner === null && next === p,
      firstContact, isBreak,
    };
  }
}
