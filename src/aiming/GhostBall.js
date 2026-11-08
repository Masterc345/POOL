// Geometric first-contact search along the cue-ball line (ghost ball method).
import { BALL } from '../utils/Constants.js';
import { CENTER_LIMITS } from '../table/TableGeometry.js';

const D = BALL.DIAMETER;

/**
 * Cast the cue ball centre from (x, y) along the unit direction (dx, dy).
 * Returns { type: 'ball', ball, distance, ghost:{x,y}, normal:{x,y} } for the first object ball hit,
 * { type: 'cushion', distance, point } when a cushion comes first, or null.
 */
export function findFirstContact(cue, dx, dy, balls, ignoreId = 0) {
  const len = Math.hypot(dx, dy) || 1;
  dx /= len; dy /= len;
  let best = null;
  for (const b of balls) {
    if (!b.active || b.id === ignoreId) continue;
    const px = b.x - cue.x, py = b.y - cue.y;
    const proj = px * dx + py * dy;
    if (proj <= 0) continue;
    const perp2 = px * px + py * py - proj * proj;
    if (perp2 >= D * D) continue;
    const t = proj - Math.sqrt(D * D - perp2);
    if (t >= 0 && (!best || t < best.distance)) {
      const gx = cue.x + dx * t, gy = cue.y + dy * t;
      best = {
        type: 'ball', ball: b, distance: t,
        ghost: { x: gx, y: gy },
        normal: { x: (b.x - gx) / D, y: (b.y - gy) / D },
      };
    }
  }
  const wall = distanceToWall(cue, dx, dy);
  if (!best || wall.distance < best.distance) {
    return { type: 'cushion', distance: wall.distance, point: wall.point };
  }
  return best;
}

export function distanceToWall(p, dx, dy) {
  const L = CENTER_LIMITS;
  let t = Infinity;
  if (dx > 1e-12) t = Math.min(t, (L.maxX - p.x) / dx);
  else if (dx < -1e-12) t = Math.min(t, (L.minX - p.x) / dx);
  if (dy > 1e-12) t = Math.min(t, (L.maxY - p.y) / dy);
  else if (dy < -1e-12) t = Math.min(t, (L.minY - p.y) / dy);
  if (!isFinite(t) || t < 0) t = 0;
  return { distance: t, point: { x: p.x + dx * t, y: p.y + dy * t } };
}
