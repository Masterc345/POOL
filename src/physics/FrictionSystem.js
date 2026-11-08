// Closed-form cloth friction for a ball on a table (sliding -> rolling transition, rolling
// resistance and side-spin decay). Because every phase is analytic, results do not depend on
// the time step, which keeps the aiming predictor identical to live gameplay.
import { BALL, PHYSICS } from '../utils/Constants.js';

const R = BALL.RADIUS;

export function slipVelocity(b) {
  // velocity of the contact point on the cloth
  return { x: b.vx - R * b.wy, y: b.vy + R * b.wx };
}

export function isBallMoving(b, P = PHYSICS) {
  if (!b.active) return false;
  if (Math.hypot(b.vx, b.vy) > 1e-7) return true;
  return Math.hypot(b.vx - R * b.wy, b.vy + R * b.wx) > P.SLIP_EPS;
}

export function isBallAtRest(b, P = PHYSICS) {
  return !b.active || (!isBallMoving(b, P) && Math.abs(b.wz) < P.REST_SPIN);
}

export function advanceBall(b, dt, P = PHYSICS) {
  if (!b.active) return;
  const g = P.GRAVITY;

  // side spin about the vertical axis decays linearly
  if (b.wz !== 0) {
    const d = P.SPIN_Z_DECEL * dt;
    b.wz = Math.abs(b.wz) <= d ? 0 : b.wz - Math.sign(b.wz) * d;
  }

  let t = dt;
  let guard = 0;
  while (t > 1e-12 && guard++ < 4) {
    const ux = b.vx - R * b.wy;
    const uy = b.vy + R * b.wx;
    const us = Math.hypot(ux, uy);

    if (us > P.SLIP_EPS) {
      // sliding: friction opposes contact-point slip; slip decays at 3.5 mu g
      const ax = ux / us, ay = uy / us;
      const a = P.MU_SLIDE * g;
      const tEnd = us / (3.5 * a);
      const h = Math.min(t, tEnd);
      b.x += b.vx * h - 0.5 * a * ax * h * h;
      b.y += b.vy * h - 0.5 * a * ay * h * h;
      b.vx -= a * ax * h;
      b.vy -= a * ay * h;
      const alpha = (2.5 * a) / R;
      b.wx -= alpha * ay * h;
      b.wy += alpha * ax * h;
      t -= h;
      if (h >= tEnd) {
        b.wy = b.vx / R; // exact rolling
        b.wx = -b.vy / R;
      }
    } else {
      // rolling with constant rolling-resistance deceleration
      const s = Math.hypot(b.vx, b.vy);
      if (s < P.REST_SPEED) {
        b.vx = b.vy = 0;
        b.wx = b.wy = 0;
        return;
      }
      const ar = P.ROLL_DECEL;
      const h = Math.min(t, s / ar);
      const dx = b.vx / s, dy = b.vy / s;
      const travel = s * h - 0.5 * ar * h * h;
      b.x += dx * travel;
      b.y += dy * travel;
      const ns = s - ar * h;
      if (ns < P.REST_SPEED) {
        b.vx = b.vy = 0;
        b.wx = b.wy = 0;
        return;
      }
      b.vx = dx * ns;
      b.vy = dy * ns;
      b.wy = b.vx / R;
      b.wx = -b.vy / R;
      t -= h;
    }
  }
}
