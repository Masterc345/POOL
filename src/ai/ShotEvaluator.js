// Geometric shot evaluation: for every (target ball, pocket) pair compute the ghost-ball aim,
// cut angle, distances, obstructions and a difficulty estimate based on the angular tolerance the
// shooter needs. Used by the aiming assistant (ranked list / recommendation) and by the AI.
import { BALL, TABLE } from '../utils/Constants.js';
import { POCKETS, insidePlayArea } from '../table/TableGeometry.js';
import { clamp, toDeg, distPointSegment } from '../utils/Helpers.js';
import { CUE_ID } from '../balls/Rack.js';

const R = BALL.RADIUS;
const D = BALL.DIAMETER;

/** Difficulty 0..100 from the required aiming precision (degrees of cue-ball aim error allowed). */
export function difficultyFromTolerance(tolDeg) {
  if (!(tolDeg > 0)) return 100;
  return clamp(Math.log10(1.5 / tolDeg) / 1.6, 0, 1) * 100;
}

export function difficultyLabel(d) {
  return d < 25 ? 'Easy' : d < 50 ? 'Medium' : d < 75 ? 'Hard' : 'Very hard';
}

/**
 * Evaluate one target/pocket combination.
 * @param cue {x,y}  target {id,x,y}  pocket POCKETS[i]  balls all ball states
 */
export function evaluatePair(cue, target, pocket, balls) {
  const res = {
    targetId: target.id, pocketId: pocket.id, feasible: false, reason: '', blockedBy: [],
    ghost: null, aimAngle: 0, cutDeg: 0, d1: 0, d2: 0, entryDeg: 0, tolDeg: 0, difficulty: 100,
  };
  const tx = target.x, ty = target.y;
  const d2 = Math.hypot(pocket.x - tx, pocket.y - ty);
  const ux = (pocket.x - tx) / d2, uy = (pocket.y - ty) / d2;
  const g = { x: tx - ux * D, y: ty - uy * D };
  const vx = g.x - cue.x, vy = g.y - cue.y;
  const d1 = Math.hypot(vx, vy);
  res.ghost = g; res.d1 = d1; res.d2 = d2;
  res.aimAngle = Math.atan2(vy, vx);

  const cosCut = d1 > 1e-9 ? (vx / d1) * ux + (vy / d1) * uy : 1;
  res.cutDeg = toDeg(Math.acos(clamp(cosCut, -1, 1)));
  const cosEntry = -(ux * pocket.ax + uy * pocket.ay);
  res.entryDeg = toDeg(Math.acos(clamp(cosEntry, -1, 1)));

  if (d1 < D * 0.6) { res.reason = 'cue ball too close'; return res; }
  if (cosCut < 0.08) { res.reason = 'cut too thin'; return res; }
  if (!insidePlayArea(g.x, g.y, -0.002)) { res.reason = 'cushion interference'; return res; }

  const wEff = pocket.mouth * Math.max(cosEntry, 0);
  const h = (wEff - D) / 2;
  if (cosEntry <= 0.2 || h <= 0.002) { res.reason = 'pocket angle too tight'; return res; }

  // obstructions: cue ball path to the ghost position and object ball path to the pocket
  const pathA = [cue, g];
  const pathB = [{ x: tx, y: ty }, { x: pocket.x, y: pocket.y }];
  for (const b of balls) {
    if (!b.active || b.id === CUE_ID || b.id === target.id) continue;
    if (distPointSegment(b, pathA[0], pathA[1]) < D - 1e-4 || distPointSegment(b, pathB[0], pathB[1]) < D - 1e-4) {
      res.blockedBy.push(b.id);
    }
  }
  if (res.blockedBy.length) { res.reason = 'obstructed'; return res; }

  // required precision: lateral tolerance h at the pocket -> object-ball angle tolerance -> cue aim tolerance
  const tau = Math.atan(h / d2);
  const tolRad = (tau * D * Math.max(cosCut, 0.05)) / d1;
  res.tolDeg = toDeg(tolRad);
  res.difficulty = difficultyFromTolerance(res.tolDeg);
  res.feasible = true;
  return res;
}

/** All candidate shots (every target x pocket), unsorted. */
export function evaluateAll(balls, legalIds) {
  const cue = balls.find((b) => b.id === CUE_ID && b.active);
  if (!cue) return [];
  const out = [];
  for (const id of legalIds) {
    const t = balls.find((b) => b.id === id && b.active);
    if (!t) continue;
    for (const p of POCKETS) out.push(evaluatePair(cue, t, p, balls));
  }
  return out;
}

/**
 * Ranked list: the best pocket per target ball, easiest first.
 * Each entry gets rank (1 = recommended) and a label.
 */
export function rankShots(balls, legalIds) {
  const all = evaluateAll(balls, legalIds);
  const bestPer = new Map();
  for (const c of all) {
    if (!c.feasible) continue;
    const cur = bestPer.get(c.targetId);
    if (!cur || c.difficulty < cur.difficulty) bestPer.set(c.targetId, c);
  }
  const ranked = [...bestPer.values()].sort((a, b) => a.difficulty - b.difficulty);
  ranked.forEach((c, i) => { c.rank = i + 1; c.label = difficultyLabel(c.difficulty); });
  const unavailable = legalIds
    .filter((id) => !bestPer.has(id) && balls.some((b) => b.id === id && b.active))
    .map((id) => {
      const reasons = all.filter((c) => c.targetId === id).map((c) => c.reason);
      const counts = {};
      for (const r of reasons) counts[r] = (counts[r] || 0) + 1;
      const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      return { targetId: id, reason: top ? top[0] : 'no shot' };
    });
  return { ranked, unavailable, all };
}

export { TABLE };
