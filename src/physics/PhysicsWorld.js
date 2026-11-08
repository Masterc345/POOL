// Deterministic 2D pool physics (planar translation + full 3D spin).
// Used unchanged by live gameplay, the AI and the aiming predictor.
import { BALL, PHYSICS } from '../utils/Constants.js';
import { WALL_SEGMENTS, KNUCKLES } from '../table/TableGeometry.js';
import { advanceBall, isBallMoving, isBallAtRest } from './FrictionSystem.js';
import {
  timeToBallContact, timeToWall, timeToKnuckle,
  resolveBallBall, resolveWall, resolveKnuckle, separateOverlaps,
} from './CollisionSystem.js';
import { pocketIndexAt } from './PocketPhysics.js';

export function makeBall(id, x = 0, y = 0) {
  return { id, x, y, vx: 0, vy: 0, wx: 0, wy: 0, wz: 0, active: true, pocket: -1 };
}

export class PhysicsWorld {
  constructor(params = PHYSICS) {
    this.params = params;
    this.balls = [];
    this.time = 0;
    this.events = [];
  }

  addBall(id, x, y) {
    const b = makeBall(id, x, y);
    this.balls.push(b);
    return b;
  }

  getBall(id) { return this.balls.find((b) => b.id === id); }

  clearEvents() { this.events.length = 0; }

  isSettled() { return this.balls.every((b) => isBallAtRest(b, this.params)); }

  anyMoving() { return this.balls.some((b) => isBallMoving(b, this.params)); }

  /** Advance the simulation by dt seconds. */
  step(dt = this.params.TIMESTEP) {
    const P = this.params;
    let remaining = dt;
    let guard = 0;
    while (remaining > 1e-10 && guard++ < P.MAX_EVENTS_PER_STEP) {
      const ev = this._nextEvent(remaining);
      const h = ev ? Math.min(ev.t, remaining) : remaining;
      if (h > 0) {
        for (const b of this.balls) advanceBall(b, h, P);
        this.time += h;
        remaining -= h;
      }
      if (ev) this._resolve(ev);
      this._checkPockets();
      if (!ev) break;
    }
    if (remaining > 1e-10) { // event storm: finish the step without collisions
      for (const b of this.balls) advanceBall(b, remaining, P);
      this.time += remaining;
    }
    separateOverlaps(this.balls);
    this._checkPockets();
  }

  /** Step until everything stops (or maxTime). onStep(world) may return false to abort. */
  runUntilSettled(maxTime = 30, onStep) {
    const end = this.time + maxTime;
    while (this.time < end && !this.isSettled()) {
      this.step();
      if (onStep && onStep(this) === false) break;
    }
  }

  _nextEvent(maxT) {
    const balls = this.balls;
    const P = this.params;
    let best = null;
    for (let i = 0; i < balls.length; i++) {
      const a = balls[i];
      if (!a.active) continue;
      const aMoving = isBallMoving(a, P);
      if (aMoving) {
        for (const seg of WALL_SEGMENTS) {
          const t = timeToWall(a, seg, best ? best.t : maxT);
          if (t < (best ? best.t : maxT + 1e-12)) best = { t, type: 'wall', a, seg };
        }
        for (const k of KNUCKLES) {
          const t = timeToKnuckle(a, k, best ? best.t : maxT);
          if (t < (best ? best.t : maxT + 1e-12)) best = { t, type: 'knuckle', a, k };
        }
      }
      for (let j = i + 1; j < balls.length; j++) {
        const b = balls[j];
        if (!b.active) continue;
        if (!aMoving && !isBallMoving(b, P)) continue;
        const t = timeToBallContact(a, b, best ? best.t : maxT);
        if (t < (best ? best.t : maxT + 1e-12)) best = { t, type: 'ball', a, b };
      }
    }
    return best && best.t <= maxT ? best : null;
  }

  _resolve(ev) {
    const P = this.params;
    if (ev.type === 'ball') {
      const { a, b } = ev;
      const ax = a.x, ay = a.y, bx = b.x, by = b.y;
      const speed = resolveBallBall(a, b, P);
      if (speed > 0) {
        this.events.push({ type: 'ballHit', t: this.time, a: a.id, b: b.id, speed, ax, ay, bx, by });
      }
    } else if (ev.type === 'wall') {
      const speed = resolveWall(ev.a, ev.seg, P);
      if (speed > 0) this.events.push({ type: 'cushion', t: this.time, id: ev.a.id, speed, x: ev.a.x, y: ev.a.y });
    } else {
      const speed = resolveKnuckle(ev.a, ev.k, P);
      if (speed > 0) this.events.push({ type: 'cushion', t: this.time, id: ev.a.id, speed, x: ev.a.x, y: ev.a.y, jaw: true });
    }
  }

  _checkPockets() {
    for (const b of this.balls) {
      if (!b.active) continue;
      const p = pocketIndexAt(b.x, b.y, this.params);
      if (p >= 0) {
        b.active = false;
        b.pocket = p;
        const speed = Math.hypot(b.vx, b.vy);
        b.vx = b.vy = b.wx = b.wy = b.wz = 0;
        this.events.push({ type: 'pocket', t: this.time, id: b.id, pocket: p, speed });
      }
    }
  }

  clone() {
    const w = new PhysicsWorld(this.params);
    w.time = this.time;
    w.balls = this.balls.map((b) => ({ ...b }));
    return w;
  }

  /** Plain-data snapshot for save/restore. */
  snapshot() { return { time: this.time, balls: this.balls.map((b) => ({ ...b })) }; }

  restore(s) {
    this.time = s.time;
    this.balls = s.balls.map((b) => ({ ...b }));
    this.events = [];
  }
}

export { BALL };
