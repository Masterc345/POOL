// Turns a geometric candidate (target + pocket) into an executable shot by running the real
// physics: it searches cue speed, small aim corrections (to compensate throw/friction) and a
// draw option, and returns the first plan that pockets the target without a scratch.
import { simulateShot } from '../aiming/TrajectorySystem.js';
import { cueSpeedToPower } from '../cue/ShotPower.js';
import { CUE_ID } from '../balls/Rack.js';
import { toRad } from '../utils/Helpers.js';

export const DEFAULT_SPEEDS = [1.4, 2.0, 2.8, 3.8];
export const DEFAULT_OFFSETS_DEG = [0, 0.4, -0.4, 0.8, -0.8, 1.3, -1.3, 2, -2, 3, -3];
const SPINS = [{ a: 0, b: 0 }, { a: 0, b: -0.55 }];

/** Run one shot and report what happened to the target and the cue ball. */
export function trialShot(world, angle, speed, spin, targetId, maxTime = 8) {
  const shot = { dirX: Math.cos(angle), dirY: Math.sin(angle), speed, a: spin.a, b: spin.b };
  const sim = simulateShot(world, shot, { maxTime });
  return {
    sim, shot,
    potted: sim.pocketed.includes(targetId),
    scratch: sim.pocketed.includes(CUE_ID),
    pocketedIds: sim.pocketed,
  };
}

/**
 * @param world PhysicsWorld at rest
 * @param cand  candidate from ShotEvaluator { targetId, pocketId, aimAngle }
 * @param opts  { speeds, offsetsDeg, maxTrials }
 * @returns { angle, speed, power, a, b, offsetDeg, trials } or null
 */
export function planShot(world, cand, opts = {}) {
  const speeds = opts.speeds ?? DEFAULT_SPEEDS;
  const offsets = opts.offsetsDeg ?? DEFAULT_OFFSETS_DEG;
  const maxTrials = opts.maxTrials ?? 60;
  let trials = 0;
  const ok = (r) => r.potted && !r.scratch;
  const make = (angle, speed, spin, off) => ({
    angle, speed, power: cueSpeedToPower(speed), a: spin.a, b: spin.b, offsetDeg: off, trials,
  });

  // pass 1: ideal geometric aim, every speed and spin
  for (const spin of SPINS) {
    for (const speed of speeds) {
      if (trials++ >= maxTrials) return null;
      if (ok(trialShot(world, cand.aimAngle, speed, spin, cand.targetId))) return make(cand.aimAngle, speed, spin, 0);
    }
  }
  // pass 2: small aim corrections at the middle speeds
  const mid = speeds.slice(1, 3);
  for (const off of offsets.slice(1)) {
    for (const speed of mid) {
      for (const spin of SPINS) {
        if (trials++ >= maxTrials) return null;
        const ang = cand.aimAngle + toRad(off);
        if (ok(trialShot(world, ang, speed, spin, cand.targetId))) return make(ang, speed, spin, off);
      }
    }
  }
  return null;
}
