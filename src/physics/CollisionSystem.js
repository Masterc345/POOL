// Event-driven collision detection (exact time of impact within a step) and impulse resolution
// for ball-ball and ball-cushion contacts, including spin transfer / throw.
import { BALL, PHYSICS } from '../utils/Constants.js';

const R = BALL.RADIUS;
const D = BALL.DIAMETER;

/** Time until two balls touch assuming constant velocity, or Infinity. */
export function timeToBallContact(a, b, maxT) {
  const dpx = b.x - a.x, dpy = b.y - a.y;
  const dvx = b.vx - a.vx, dvy = b.vy - a.vy;
  const c = dpx * dpx + dpy * dpy - D * D;
  const bq = dpx * dvx + dpy * dvy; // half of the usual 'b'
  if (bq >= 0) return Infinity; // separating
  if (c <= 0) return 0; // already touching/overlapping and approaching
  const aq = dvx * dvx + dvy * dvy;
  if (aq < 1e-14) return Infinity;
  const disc = bq * bq - aq * c;
  if (disc < 0) return Infinity;
  const t = (-bq - Math.sqrt(disc)) / aq;
  return t >= 0 && t <= maxT ? t : t < 0 ? 0 : Infinity;
}

export function timeToWall(b, seg, maxT) {
  const pos = seg.axis === 'x' ? b.x : b.y;
  const vel = seg.axis === 'x' ? b.vx : b.vy;
  if (vel * seg.inward >= -1e-9) return Infinity;
  const limit = seg.value + seg.inward * R;
  let t = (limit - pos) / vel;
  if (t < 0) t = 0;
  if (t > maxT) return Infinity;
  const along = seg.axis === 'x' ? b.y + b.vy * t : b.x + b.vx * t;
  if (along < seg.lo || along > seg.hi) return Infinity;
  return t;
}

export function timeToKnuckle(b, k, maxT) {
  const dx = b.x - k.x, dy = b.y - k.y;
  const c = dx * dx + dy * dy - R * R;
  const bq = dx * b.vx + dy * b.vy;
  if (bq >= 0) return Infinity;
  if (c <= 0) return 0;
  const aq = b.vx * b.vx + b.vy * b.vy;
  if (aq < 1e-14) return Infinity;
  const disc = bq * bq - aq * c;
  if (disc < 0) return Infinity;
  const t = (-bq - Math.sqrt(disc)) / aq;
  return t >= 0 && t <= maxT ? t : t < 0 ? 0 : Infinity;
}

/** Cushion restitution as a function of impact speed (Han 2005 fit, clamped). */
export function cushionRestitution(speed) {
  return Math.min(0.85, Math.max(0.45, 0.39 + 0.257 * speed - 0.044 * speed * speed));
}

/**
 * Apply a cushion impulse. (nx, ny) points from the cushion into the table.
 * Normal restitution + Coulomb friction coupling side spin (wz) to the tangential velocity.
 * Returns the impact speed (0 if the ball was not approaching).
 */
export function resolveCushionImpulse(b, nx, ny, P = PHYSICS) {
  const vn = b.vx * nx + b.vy * ny;
  if (vn >= 0) return 0;
  const speed = -vn;
  const e = speed < P.CUSHION_MIN_BOUNCE ? 0 : cushionRestitution(speed);
  const dvn = (1 + e) * speed;
  const tx = ny, ty = -nx; // tangent (outward-normal rotated 90 degrees)
  const s = b.vx * tx + b.vy * ty + R * b.wz; // slip of the contact point
  let jt = 0;
  if (Math.abs(s) > 1e-9) jt = Math.sign(s) * Math.min(P.MU_CUSHION * dvn, Math.abs(s) / 3.5);
  b.vx += dvn * nx - jt * tx;
  b.vy += dvn * ny - jt * ty;
  b.wz -= (2.5 * jt) / R;
  return speed;
}

export function resolveWall(b, seg, P = PHYSICS) {
  const nx = seg.axis === 'x' ? seg.inward : 0;
  const ny = seg.axis === 'y' ? seg.inward : 0;
  const limit = seg.value + seg.inward * R;
  if (seg.axis === 'x') { if ((b.x - limit) * seg.inward < 0) b.x = limit; }
  else if ((b.y - limit) * seg.inward < 0) b.y = limit;
  return resolveCushionImpulse(b, nx, ny, P);
}

export function resolveKnuckle(b, k, P = PHYSICS) {
  let dx = b.x - k.x, dy = b.y - k.y;
  let d = Math.hypot(dx, dy);
  if (d < 1e-9) { dx = 1; dy = 0; d = 1; }
  const nx = dx / d, ny = dy / d;
  if (d < R) { b.x = k.x + nx * R; b.y = k.y + ny * R; }
  return resolveCushionImpulse(b, nx, ny, P);
}

/**
 * Ball-ball impulse for equal masses with restitution and friction (throw, side-spin transfer).
 * Returns the closing speed along the line of centres (0 if separating).
 */
export function resolveBallBall(a, b, P = PHYSICS) {
  let nx = b.x - a.x, ny = b.y - a.y;
  let d = Math.hypot(nx, ny);
  if (d < 1e-9) { nx = 1; ny = 0; d = 1; }
  nx /= d; ny /= d;
  const rvn = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
  if (rvn <= 0) return 0;
  const tx = -ny, ty = nx;
  const s = (a.vx - b.vx) * tx + (a.vy - b.vy) * ty + R * (a.wz + b.wz);
  const jn = ((1 + P.RESTITUTION_BALL) * rvn) / 2;
  let jt = 0;
  if (Math.abs(s) > 1e-9) jt = Math.sign(s) * Math.min(P.MU_BALL * jn, Math.abs(s) / 7);
  a.vx += -jn * nx - jt * tx;
  a.vy += -jn * ny - jt * ty;
  b.vx += jn * nx + jt * tx;
  b.vy += jn * ny + jt * ty;
  const dw = (2.5 * jt) / R;
  a.wz -= dw;
  b.wz -= dw;
  return rvn;
}

/** Positional correction for overlapping balls. */
export function separateOverlaps(balls) {
  for (let i = 0; i < balls.length; i++) {
    const a = balls[i];
    if (!a.active) continue;
    for (let j = i + 1; j < balls.length; j++) {
      const b = balls[j];
      if (!b.active) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < D * D - 1e-10 && d2 > 1e-14) {
        const d = Math.sqrt(d2);
        const push = (D - d) / 2;
        const nx = dx / d, ny = dy / d;
        a.x -= nx * push; a.y -= ny * push;
        b.x += nx * push; b.y += ny * push;
      }
    }
  }
}
