// Helpers that keep a PhysicsWorld consistent with the rules engine (rack, re-spots, ball in hand).
import { BALL, TABLE } from '../utils/Constants.js';
import { insidePlayArea } from '../table/TableGeometry.js';
import { rackPositions, cueBreakPosition, CUE_ID, EIGHT_ID } from '../balls/Rack.js';

const D = BALL.DIAMETER;

export function setupRack(world, seed) {
  world.balls = [];
  world.time = 0;
  world.events = [];
  const cue = cueBreakPosition();
  world.addBall(CUE_ID, cue.x, cue.y);
  for (const p of rackPositions(seed)) world.addBall(p.id, p.x, p.y);
  return world;
}

export function isFree(world, x, y, ignoreId = -1, clearance = D + 0.0005) {
  return world.balls.every((b) => !b.active || b.id === ignoreId || Math.hypot(b.x - x, b.y - y) >= clearance);
}

/** Is (x, y) a legal place for the cue ball? kitchen = behind the head string (opening break). */
export function validCuePlacement(world, x, y, kitchen = false) {
  if (!insidePlayArea(x, y, 0.002)) return false;
  if (kitchen && x > TABLE.HEAD_STRING_X) return false;
  return isFree(world, x, y, CUE_ID);
}

export function placeCueBall(world, x, y) {
  let cue = world.getBall(CUE_ID);
  if (!cue) cue = world.addBall(CUE_ID, x, y);
  cue.active = true; cue.pocket = -1;
  cue.x = x; cue.y = y; cue.vx = cue.vy = cue.wx = cue.wy = cue.wz = 0;
  return cue;
}

/** Re-spot the 8-ball on the foot spot, or the nearest free spot towards the foot rail. */
export function respotBall(world, id) {
  const b = world.getBall(id);
  if (!b) return;
  let x = TABLE.FOOT_SPOT_X;
  while (!isFree(world, x, 0, id) && x < TABLE.HALF_L - BALL.RADIUS) x += 0.01;
  if (!isFree(world, x, 0, id)) { x = TABLE.FOOT_SPOT_X; while (!isFree(world, x, 0, id) && x > -TABLE.HALF_L + BALL.RADIUS) x -= 0.01; }
  b.active = true; b.pocket = -1;
  b.x = x; b.y = 0; b.vx = b.vy = b.wx = b.wy = b.wz = 0;
}

/** Default cue placement after a scratch: head string centre, or the nearest free point. */
export function defaultCuePlacement(world, kitchen = true) {
  const x0 = TABLE.HEAD_STRING_X;
  for (let r = 0; r < 0.6; r += 0.02) {
    for (const sign of [1, -1]) {
      const y = sign * r;
      if (validCuePlacement(world, x0, y, kitchen)) return { x: x0, y };
    }
  }
  return { x: x0, y: 0 };
}

export function applyOutcome(world, outcome) {
  for (const id of outcome.respot || []) respotBall(world, id);
  void EIGHT_ID;
}
