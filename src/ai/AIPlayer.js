// Computer opponent. It uses the same geometry (ShotEvaluator), the same physics (ShotPlanner ->
// PhysicsWorld) and the same rules information (legal targets) as a human player.
import { getProfile } from './DifficultyManager.js';
import { rankShots, evaluateAll } from './ShotEvaluator.js';
import { planShot } from './ShotPlanner.js';
import { findFirstContact } from '../aiming/GhostBall.js';
import { powerToCueSpeed, cueSpeedToPower } from '../cue/ShotPower.js';
import { validCuePlacement, defaultCuePlacement } from '../gameplay/TableState.js';
import { CUE_ID } from '../balls/Rack.js';
import { TABLE, BALL } from '../utils/Constants.js';
import { CENTER_LIMITS } from '../table/TableGeometry.js';
import { createRng, toRad, clamp } from '../utils/Helpers.js';

export class AIPlayer {
  constructor(difficulty = 'medium', seed) {
    this.difficulty = difficulty;
    this.profile = getProfile(difficulty);
    this.rng = createRng(seed);
  }

  /** Cue ball position for ball in hand. */
  choosePlacement(world, legalIds, kitchen) {
    const prof = this.profile;
    const cue = world.getBall(CUE_ID);
    const samples = [];
    const xMax = kitchen ? TABLE.HEAD_STRING_X : CENTER_LIMITS.maxX;
    const tries = Math.max(prof.placementSamples, 1) * 6;
    for (let i = 0; i < tries && samples.length < Math.max(prof.placementSamples, 1); i++) {
      const x = this.rng.range(CENTER_LIMITS.minX + 0.03, xMax - (kitchen ? 0.01 : 0.03));
      const y = this.rng.range(CENTER_LIMITS.minY + 0.03, CENTER_LIMITS.maxY - 0.03);
      if (validCuePlacement(world, x, y, kitchen)) samples.push({ x, y });
    }
    if (!samples.length) return defaultCuePlacement(world, kitchen);
    if (prof.placementSamples === 0) return samples[0];

    let best = samples[0], bestScore = Infinity;
    const others = world.balls.filter((b) => b.id !== CUE_ID);
    for (const s of samples) {
      const balls = [{ id: CUE_ID, x: s.x, y: s.y, active: true }, ...others];
      const c = evaluateAll(balls, legalIds).filter((e) => e.feasible);
      const score = c.length ? Math.min(...c.map((e) => e.difficulty)) : 200;
      if (score < bestScore) { bestScore = score; best = s; }
    }
    void cue;
    return best;
  }

  /**
   * @param ctx { world, legalIds, isBreak }
   * @returns { angle, speed, a, b, kind } shot to execute on the real physics
   */
  chooseShot(ctx) {
    const { world, legalIds, isBreak } = ctx;
    const prof = this.profile;
    const cue = world.getBall(CUE_ID);

    if (isBreak) {
      const target = { x: TABLE.FOOT_SPOT_X, y: 0 };
      const angle = Math.atan2(target.y - cue.y, target.x - cue.x);
      const speed = powerToCueSpeed(prof.breakPower);
      return this._execute({ angle, speed, a: 0, b: 0, kind: 'break' });
    }

    const rank = rankShots(world.balls, legalIds);
    let pool = rank.ranked;
    if (!prof.avoidObstructed) {
      // easy players also try blocked shots from time to time
      const blocked = rank.all.filter((c) => !c.feasible && c.reason === 'obstructed');
      if (blocked.length && this.rng() < 0.2) pool = [...pool, ...blocked];
    }

    if (pool.length) {
      const top = pool.slice(0, prof.pool);
      const choices = prof.verify ? top : [top[Math.floor(this.rng() * top.length)]];
      let best = null;
      for (const cand of choices) {
        if (!prof.verify) {
          best = { cand, plan: null };
          break;
        }
        const plan = planShot(world, cand, { maxTrials: prof.maxTrials });
        if (plan && (!best || cand.difficulty < best.cand.difficulty)) best = { cand, plan };
        if (best && this.difficulty === 'medium') break; // medium settles for the first workable choice
      }
      if (best) {
        const { cand, plan } = best;
        const angle = plan ? plan.angle : cand.aimAngle;
        const speed = plan ? plan.speed : powerToCueSpeed(this.rng.range(0.35, 0.65));
        return this._execute({ angle, speed, a: plan ? plan.a : 0, b: plan ? plan.b : 0, kind: 'pot', targetId: cand.targetId, pocketId: cand.pocketId });
      }
      if (prof.verify) { // nothing verified: take the geometrically easiest at moderate power
        const c = top[0];
        return this._execute({ angle: c.aimAngle, speed: powerToCueSpeed(0.5), a: 0, b: 0, kind: 'attempt', targetId: c.targetId, pocketId: c.pocketId });
      }
    }
    return this._execute(this._safetyShot(world, legalIds));
  }

  /** No pottable ball: make a legal contact (and reach a rail) so we do not foul. */
  _safetyShot(world, legalIds) {
    const cue = world.getBall(CUE_ID);
    let best = null;
    for (let deg = 0; deg < 360; deg += 1) {
      const ang = toRad(deg);
      const c = findFirstContact(cue, Math.cos(ang), Math.sin(ang), world.balls);
      if (c.type === 'ball' && legalIds.includes(c.ball.id)) {
        // prefer thick hits (small cut) on the nearest legal ball
        const cut = Math.abs(Math.cos(ang) * c.normal.x + Math.sin(ang) * c.normal.y);
        const score = c.distance - cut * 0.5;
        if (!best || score < best.score) best = { score, angle: ang };
      }
    }
    if (!best) return { angle: 0, speed: powerToCueSpeed(0.4), a: 0, b: 0, kind: 'random' };
    return { angle: best.angle, speed: powerToCueSpeed(0.55), a: 0, b: 0, kind: 'safety' };
  }

  /** Apply the difficulty's execution noise. */
  _execute(s) {
    const prof = this.profile;
    const angle = s.angle + toRad(this.rng.gauss() * prof.aimSigmaDeg);
    const power = clamp(cueSpeedToPower(s.speed) * (1 + this.rng.gauss() * prof.powerSigma), 0.08, 1);
    return { ...s, angle, speed: powerToCueSpeed(power), power };
  }
}

export { BALL };
