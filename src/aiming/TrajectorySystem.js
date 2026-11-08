// Shot simulation used by the aiming predictor and the AI. It runs the SAME PhysicsWorld and
// cue-impact model as live gameplay, so what you see predicted is what the physics will do.
import { applyCueStrike } from '../physics/CueImpact.js';
import { CUE_ID } from '../balls/Rack.js';

/**
 * Simulate one shot on a copy of `world`.
 * @param shot  { dirX, dirY, speed, a, b }
 * @param opts  { maxTime=8, record=false, sampleEvery=3, stopWhen?: (world)=>boolean, trackIds?: number[] }
 */
export function simulateShot(world, shot, opts = {}) {
  const { maxTime = 8, record = false, sampleEvery = 3, stopWhen, trackIds } = opts;
  const w = world.clone();
  w.clearEvents();
  const cue = w.getBall(CUE_ID);
  if (!cue || !cue.active) return { events: [], paths: new Map(), world: w, time: 0, pocketed: [] };
  applyCueStrike(cue, shot, w.params);

  const paths = new Map();
  if (record) {
    for (const b of w.balls) {
      if (!b.active || (trackIds && !trackIds.includes(b.id))) continue;
      paths.set(b.id, [{ x: b.x, y: b.y, t: 0 }]);
    }
  }
  const t0 = w.time;
  let step = 0;
  let seen = 0;
  const pushPoint = (b, force) => {
    const arr = paths.get(b.id);
    if (!arr) return;
    const last = arr[arr.length - 1];
    if (force || Math.hypot(b.x - last.x, b.y - last.y) > 1e-4) arr.push({ x: b.x, y: b.y, t: w.time - t0 });
  };

  while (w.time - t0 < maxTime && !w.isSettled()) {
    w.step();
    step++;
    if (record) {
      const newEvents = w.events.length > seen;
      if (newEvents || step % sampleEvery === 0) {
        for (const b of w.balls) {
          if (paths.has(b.id) && (b.active || newEvents)) pushPoint(b, newEvents);
        }
      }
      seen = w.events.length;
    }
    if (stopWhen && stopWhen(w)) break;
  }
  if (record) for (const b of w.balls) if (paths.has(b.id)) pushPoint(b, true);

  return {
    events: w.events,
    paths,
    world: w,
    time: w.time - t0,
    pocketed: w.events.filter((e) => e.type === 'pocket').map((e) => e.id),
  };
}

export const firstBallHit = (events) =>
  events.find((e) => e.type === 'ballHit' && (e.a === CUE_ID || e.b === CUE_ID));
