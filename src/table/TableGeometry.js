// Pure table geometry shared by physics, aiming, AI and rendering (no three.js import).
import { TABLE, BALL } from '../utils/Constants.js';

const HL = TABLE.HALF_L, HW = TABLE.HALF_W, CG = TABLE.CORNER_GAP, SG = TABLE.SIDE_GAP;

/**
 * Cushion faces. axis 'x' => wall is the line x = value, otherwise y = value.
 * inward is the sign of the direction pointing into the table. lo..hi is the extent along the other axis.
 */
export const WALL_SEGMENTS = [
  { axis: 'x', value: HL, inward: -1, lo: -HW + CG, hi: HW - CG },
  { axis: 'x', value: -HL, inward: 1, lo: -HW + CG, hi: HW - CG },
  { axis: 'y', value: HW, inward: -1, lo: -HL + CG, hi: -SG },
  { axis: 'y', value: HW, inward: -1, lo: SG, hi: HL - CG },
  { axis: 'y', value: -HW, inward: 1, lo: -HL + CG, hi: -SG },
  { axis: 'y', value: -HW, inward: 1, lo: SG, hi: HL - CG },
];

/** Pocket jaw tips: the ends of every cushion segment behave like a point of zero radius. */
export const KNUCKLES = WALL_SEGMENTS.flatMap((s) =>
  s.axis === 'x'
    ? [{ x: s.value, y: s.lo }, { x: s.value, y: s.hi }]
    : [{ x: s.lo, y: s.value }, { x: s.hi, y: s.value }]
);

const diag = Math.SQRT1_2;
/** axis = unit vector pointing from the pocket into the table. */
export const POCKETS = [
  { id: 0, name: 'Top left', type: 'corner', x: -(HL + 0.025), y: HW + 0.025, radius: 0.072, mouth: 2 * CG * diag, ax: diag, ay: -diag },
  { id: 1, name: 'Top middle', type: 'side', x: 0, y: HW + 0.04, radius: 0.068, mouth: 2 * SG, ax: 0, ay: -1 },
  { id: 2, name: 'Top right', type: 'corner', x: HL + 0.025, y: HW + 0.025, radius: 0.072, mouth: 2 * CG * diag, ax: -diag, ay: -diag },
  { id: 3, name: 'Bottom left', type: 'corner', x: -(HL + 0.025), y: -(HW + 0.025), radius: 0.072, mouth: 2 * CG * diag, ax: diag, ay: diag },
  { id: 4, name: 'Bottom middle', type: 'side', x: 0, y: -(HW + 0.04), radius: 0.068, mouth: 2 * SG, ax: 0, ay: 1 },
  { id: 5, name: 'Bottom right', type: 'corner', x: HL + 0.025, y: -(HW + 0.025), radius: 0.072, mouth: 2 * CG * diag, ax: -diag, ay: diag },
];

/** Limits for a ball centre resting against the cushions. */
export const CENTER_LIMITS = {
  minX: -HL + BALL.RADIUS,
  maxX: HL - BALL.RADIUS,
  minY: -HW + BALL.RADIUS,
  maxY: HW - BALL.RADIUS,
};

export function insidePlayArea(x, y, margin = 0) {
  return (
    x >= CENTER_LIMITS.minX + margin && x <= CENTER_LIMITS.maxX - margin &&
    y >= CENTER_LIMITS.minY + margin && y <= CENTER_LIMITS.maxY - margin
  );
}
