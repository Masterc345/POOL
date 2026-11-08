// Pure ball-set logic: ball groups and the standard 8-ball rack (no rendering).
import { BALL, TABLE, GROUPS } from '../utils/Constants.js';
import { createRng } from '../utils/Helpers.js';

export const CUE_ID = 0;
export const EIGHT_ID = 8;

export function groupOf(id) {
  if (id >= 1 && id <= 7) return GROUPS.SOLIDS;
  if (id >= 9 && id <= 15) return GROUPS.STRIPES;
  return null;
}

export const idsOfGroup = (group) =>
  group === GROUPS.SOLIDS ? [1, 2, 3, 4, 5, 6, 7] : group === GROUPS.STRIPES ? [9, 10, 11, 12, 13, 14, 15] : [];

export const cueBreakPosition = () => ({ x: TABLE.HEAD_STRING_X, y: 0 });

/** Standard triangle: apex ball on the foot spot, 8-ball in the centre, one solid and one stripe in the back corners. */
export function rackPositions(seed) {
  const rng = createRng(seed);
  const solids = rng.shuffle([1, 2, 3, 4, 5, 6, 7]);
  const stripes = rng.shuffle([9, 10, 11, 12, 13, 14, 15]);
  const cornerA = solids.pop();
  const cornerB = stripes.pop();
  const rest = rng.shuffle([...solids, ...stripes]);
  const layout = [];
  const rows = [[], [], [], [], []];
  rows[4][0] = rng() < 0.5 ? cornerA : cornerB;
  rows[4][4] = rows[4][0] === cornerA ? cornerB : cornerA;
  rows[2][1] = EIGHT_ID;
  let k = 0;
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c <= r; c++) {
      if (rows[r][c] === undefined) rows[r][c] = rest[k++];
    }
  }
  const gap = 1e-4;
  const dx = Math.sqrt(3) * BALL.RADIUS + gap;
  const dy = BALL.DIAMETER + gap;
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c <= r; c++) {
      layout.push({ id: rows[r][c], x: TABLE.FOOT_SPOT_X + r * dx, y: (c - r / 2) * dy });
    }
  }
  return layout;
}
