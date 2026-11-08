import { PHYSICS, BALL } from '../utils/Constants.js';
import { clamp } from '../utils/Helpers.js';

/** Power slider (0..1) -> cue speed (m/s). Quadratic so low powers allow fine control. */
export function powerToCueSpeed(power) {
  const p = clamp(power, 0, 1);
  return PHYSICS.MAX_CUE_SPEED * (0.03 + 0.97 * p * p);
}

export function cueSpeedToPower(speed) {
  const x = clamp(speed / PHYSICS.MAX_CUE_SPEED, 0.03, 1);
  return Math.sqrt((x - 0.03) / 0.97);
}

/** Ball speed produced by a centre-ball strike at the given cue speed. */
export function ballSpeedForCueSpeed(v) {
  return (2 * v) / (1 + BALL.MASS / PHYSICS.CUE_MASS);
}

/** Cue speed needed to launch the cue ball at the given speed with a centre-ball strike. */
export function cueSpeedForBallSpeed(V) {
  return (V * (1 + BALL.MASS / PHYSICS.CUE_MASS)) / 2;
}

export const powerLabel = (p) => `${Math.round(clamp(p, 0, 1) * 100)}%`;
