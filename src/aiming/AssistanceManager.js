// Combines geometric analysis (ghost ball, ranking, alignment) with physics simulation
// (cue/object/cushion paths) according to the selected assistance level.
//   1 Off | 2 Basic | 3 Intermediate | 4 Advanced | 5 Professional
import { findFirstContact } from './GhostBall.js';
import { simulateShot, firstBallHit } from './TrajectorySystem.js';
import { evaluateAlignment } from './AlignmentSystem.js';
import { rankShots } from '../ai/ShotEvaluator.js';
import { planShot } from '../ai/ShotPlanner.js';
import { CUE_ID } from '../balls/Rack.js';

export const LEVEL = { OFF: 1, BASIC: 2, INTERMEDIATE: 3, ADVANCED: 4, PROFESSIONAL: 5 };

function tableKey(world) {
  return world.balls.map((b) => `${b.id}:${b.active ? 1 : 0}:${b.x.toFixed(4)}:${b.y.toFixed(4)}`).join('|');
}

export class AssistanceManager {
  constructor() {
    this.level = LEVEL.BASIC;
    this.showTrajectory = true;
    this._rankKey = '';
    this._rank = { ranked: [], unavailable: [], all: [] };
  }

  setLevel(level) { this.level = Math.max(1, Math.min(5, Math.round(level))); }

  /** Ranking only depends on the table layout and legal targets, so it is cached. */
  getRanking(world, legalIds) {
    const key = tableKey(world) + '#' + legalIds.join(',');
    if (key !== this._rankKey) {
      this._rankKey = key;
      this._rank = rankShots(world.balls, legalIds);
      // verify the best candidates with the real physics: suggested power / throw-corrected angle
      this._rank.ranked.slice(0, 3).forEach((c) => {
        const plan = planShot(world, c, { maxTrials: 24 });
        c.plan = plan;
        c.verified = !!plan;
      });
    }
    return this._rank;
  }

  /**
   * @param world     PhysicsWorld (live state, balls at rest)
   * @param aim       AimingSystem
   * @param legalIds  ids of legal target balls for the shooter
   */
  compute(world, aim, legalIds) {
    const level = this.level;
    const result = {
      level, active: level > LEVEL.OFF, ghost: null, cueLine: null, targetId: null, pocketId: null,
      objectPath: null, cuePath: null, otherPaths: [], ranking: [], unavailable: [], recommended: null,
      alignment: null, predictedPocketed: [], predictedScratch: false, firstContact: null,
    };
    const cue = world.getBall(CUE_ID);
    if (!cue || !cue.active || level === LEVEL.OFF) return result;

    const dir = aim.direction;
    const contact = findFirstContact(cue, dir.x, dir.y, world.balls);
    result.firstContact = contact;
    if (contact) {
      const end = contact.type === 'ball' ? contact.ghost : contact.point;
      result.cueLine = [{ x: cue.x, y: cue.y }, end];
      if (contact.type === 'ball') { result.ghost = contact.ghost; result.targetId = contact.ball.id; }
    }

    // ---- physics prediction (levels 3+) ----
    if (level >= LEVEL.INTERMEDIATE) {
      const maxTime = level >= LEVEL.PROFESSIONAL ? 7 : 5;
      const track = level >= LEVEL.PROFESSIONAL ? null : [CUE_ID, ...(contact && contact.type === 'ball' ? [contact.ball.id] : [])];
      const sim = simulateShot(world, aim.getShot(), { maxTime, record: true, trackIds: track });
      const hit = firstBallHit(sim.events);
      const tId = hit ? (hit.a === CUE_ID ? hit.b : hit.a) : null;
      result.predictedPocketed = sim.pocketed;
      result.predictedScratch = sim.pocketed.includes(CUE_ID);
      const strip = (arr) => (arr && arr.length > 1 ? arr : null);
      if (tId !== null) result.objectPath = strip(sim.paths.get(tId));
      if (level >= LEVEL.ADVANCED) result.cuePath = strip(sim.paths.get(CUE_ID));
      else if (!hit) result.cuePath = strip(this._truncateAtFirstCushion(sim.paths.get(CUE_ID), sim.events));
      if (level >= LEVEL.PROFESSIONAL) {
        for (const [id, path] of sim.paths) if (id !== CUE_ID && id !== tId && path.length > 1) result.otherPaths.push({ id, path });
      }
      result.simPocketOfTarget = tId !== null ? (sim.events.find((e) => e.type === 'pocket' && e.id === tId)?.pocket ?? null) : null;
    }

    // ---- alignment + ranking (levels 4+) ----
    if (level >= LEVEL.ADVANCED) {
      const al = evaluateAlignment(world.balls, cue, aim.angle, legalIds);
      result.alignment = al;
      if (al.pocketId !== null) result.pocketId = al.pocketId;
      const rank = this.getRanking(world, legalIds);
      result.ranking = level >= LEVEL.PROFESSIONAL ? rank.ranked : rank.ranked.slice(0, 3);
      result.unavailable = level >= LEVEL.PROFESSIONAL ? rank.unavailable : [];
      result.recommended = rank.ranked[0] || null;
    } else if (level >= LEVEL.INTERMEDIATE && contact && contact.type === 'ball') {
      // intermediate: highlight the pocket the object ball is heading to (from the simulation)
      result.pocketId = result.simPocketOfTarget ?? null;
    }
    return result;
  }

  _truncateAtFirstCushion(path, events) {
    if (!path) return null;
    const c = events.find((e) => e.type === 'cushion' && e.id === CUE_ID);
    if (!c) return path;
    return path.filter((p) => p.t <= c.t + 1e-6);
  }
}
