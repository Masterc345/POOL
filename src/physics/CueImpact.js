// Cue-tip impact on the cue ball (Alciatore, horizontal cue): converts cue speed and tip offset
// into ball linear velocity, top/back spin and side spin.
import { BALL, PHYSICS } from '../utils/Constants.js';

const R = BALL.RADIUS;

/**
 * @param ball      cue ball state (mutated)
 * @param shot      { dirX, dirY, speed (cue speed m/s), a: side offset -1..1 (right +), b: vertical offset -1..1 (top +) }
 * @returns ball speed after the strike
 */
export function applyCueStrike(ball, shot, P = PHYSICS) {
  const len = Math.hypot(shot.dirX, shot.dirY) || 1;
  const dx = shot.dirX / len, dy = shot.dirY / len;

  // clamp the tip offset to a disc of radius MAX_OFFSET_RATIO * R (otherwise the cue miscues)
  let oa = shot.a || 0, ob = shot.b || 0;
  const om = Math.hypot(oa, ob);
  if (om > 1) { oa /= om; ob /= om; }
  const a = oa * P.MAX_OFFSET_RATIO * R;
  const b = ob * P.MAX_OFFSET_RATIO * R;

  const m = BALL.MASS, M = P.CUE_MASS;
  const F = (2 * m * shot.speed) / (1 + m / M + (2.5 / (R * R)) * (a * a + b * b));
  const V = F / m;
  const I = BALL.INERTIA;

  ball.vx = dx * V;
  ball.vy = dy * V;
  const top = (F * b) / I; // top/back spin about the axis perpendicular to the shot
  ball.wx = -dy * top + 0; // + 0 normalises -0
  ball.wy = dx * top + 0;
  ball.wz = (F * a) / I; // right-of-centre strike spins the ball counter-clockwise seen from above
  return V;
}
