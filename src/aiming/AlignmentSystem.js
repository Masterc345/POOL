// Alignment feedback: is the cue line aimed at a legal, reachable object ball, is the contact
// point suitable, and will the object ball head towards a pocket?
import { POCKETS } from '../table/TableGeometry.js';
import { toDeg, wrapAngle } from '../utils/Helpers.js';
import { findFirstContact } from './GhostBall.js';
import { evaluatePair, difficultyLabel } from '../ai/ShotEvaluator.js';
import { BALL } from '../utils/Constants.js';

const D = BALL.DIAMETER;

/**
 * @returns {
 *   state: 'good'|'fair'|'poor'|'blocked'|'wrong'|'none',
 *   checks: [{key,label,ok}], message, contact, targetId, pocketId, aimErrorDeg, toleranceDeg, difficulty
 * }
 */
export function evaluateAlignment(balls, cue, angle, legalIds) {
  const dx = Math.cos(angle), dy = Math.sin(angle);
  const contact = findFirstContact(cue, dx, dy, balls);
  const out = {
    state: 'none', checks: [], message: '', contact, targetId: null, pocketId: null,
    aimErrorDeg: 0, toleranceDeg: 0, difficulty: null, difficultyLabel: '', cutDeg: 0,
  };

  const hitsBall = contact && contact.type === 'ball';
  const target = hitsBall ? contact.ball : null;
  const legal = !!target && legalIds.includes(target.id);

  out.checks.push({ key: 'reachable', label: 'Target reachable', ok: hitsBall });
  out.checks.push({ key: 'legal', label: 'Legal target ball', ok: hitsBall ? legal : null });

  if (!hitsBall) {
    out.state = 'blocked';
    out.message = 'The cue ball will not hit an object ball - it travels to a cushion.';
    out.checks.push({ key: 'contact', label: 'Contact point suitable', ok: null });
    out.checks.push({ key: 'pocket', label: 'Heading toward a pocket', ok: null });
    return out;
  }
  out.targetId = target.id;

  // object-ball direction produced by this contact
  const nx = contact.normal.x, ny = contact.normal.y;
  const objAngle = Math.atan2(ny, nx);
  const cutDeg = toDeg(Math.acos(Math.max(-1, Math.min(1, dx * nx + dy * ny))));
  out.cutDeg = cutDeg;

  // best pocket = smallest angular deviation between the object-ball direction and the pocket direction
  let bestP = null, bestErr = Infinity;
  for (const p of POCKETS) {
    const a = Math.atan2(p.y - target.y, p.x - target.x);
    const err = Math.abs(wrapAngle(objAngle - a));
    if (err < bestErr) { bestErr = err; bestP = p; }
  }
  const cand = evaluatePair(cue, target, bestP, balls);
  out.pocketId = bestP.id;

  const contactOk = cutDeg < 80;
  out.checks.push({ key: 'contact', label: 'Contact point suitable', ok: contactOk });

  if (!cand.feasible) {
    out.checks.push({ key: 'pocket', label: 'Heading toward a pocket', ok: false });
    out.state = legal ? 'poor' : 'wrong';
    out.message = legal ? `No clean line to a pocket (${cand.reason}).` : 'That ball is not a legal target.';
    return out;
  }

  const err = wrapAngle(cand.aimAngle - angle); // + = rotate counter-clockwise
  out.aimErrorDeg = toDeg(err);
  out.toleranceDeg = cand.tolDeg;
  out.difficulty = cand.difficulty;
  out.difficultyLabel = difficultyLabel(cand.difficulty);
  const absErr = Math.abs(out.aimErrorDeg);
  const good = absErr <= Math.max(cand.tolDeg, 0.15);
  const fair = absErr <= Math.max(cand.tolDeg * 2.5, 0.6);
  out.checks.push({ key: 'pocket', label: 'Heading toward a pocket', ok: good || fair });

  if (!legal) { out.state = 'wrong'; out.message = 'That ball is not a legal target.'; }
  else if (good) { out.state = 'good'; out.message = `Aligned for the ${bestP.name.toLowerCase()} pocket.`; }
  else if (fair) { out.state = 'fair'; out.message = `Close: adjust ${absErr.toFixed(2)}\u00b0 ${out.aimErrorDeg > 0 ? 'left' : 'right'}.`; }
  else { out.state = 'poor'; out.message = `Off line by ${absErr.toFixed(1)}\u00b0 for the nearest pocket.`; }
  return out;
}

export { D };
