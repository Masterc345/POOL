import { POCKETS, KNUCKLES } from '../table/TableGeometry.js';
import { TABLE, PHYSICS } from '../utils/Constants.js';

/** Index of the pocket that captures a ball centre at (x, y), or -1. */
export function pocketIndexAt(x, y, P = PHYSICS) {
  for (const p of POCKETS) {
    if (Math.hypot(x - p.x, y - p.y) < p.radius) return p.id;
  }
  // centre well beyond the cushion line inside a mouth: the ball has dropped
  if (Math.abs(x) > TABLE.HALF_L + P.OUT_MARGIN || Math.abs(y) > TABLE.HALF_W + P.OUT_MARGIN) {
    let best = 0, bd = Infinity;
    for (const p of POCKETS) {
      const d = Math.hypot(x - p.x, y - p.y);
      if (d < bd) { bd = d; best = p.id; }
    }
    return best;
  }
  return -1;
}

export { KNUCKLES };
