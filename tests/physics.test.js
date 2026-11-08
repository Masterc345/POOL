import { describe, it, expect } from 'vitest';
import { PhysicsWorld } from '../src/physics/PhysicsWorld.js';
import { applyCueStrike } from '../src/physics/CueImpact.js';
import { BALL, PHYSICS, TABLE } from '../src/utils/Constants.js';
import { rackPositions, groupOf } from '../src/balls/Rack.js';
import { pocketIndexAt } from '../src/physics/PocketPhysics.js';

const R = BALL.RADIUS;

function worldWith(...balls) {
  const w = new PhysicsWorld();
  for (const [id, x, y] of balls) w.addBall(id, x, y);
  return w;
}
const speed = (b) => Math.hypot(b.vx, b.vy);

describe('friction model', () => {
  it('a rolling ball stops after v^2 / (2 a) with constant rolling deceleration', () => {
    const w = worldWith([0, -1.0, 0]);
    const b = w.getBall(0);
    b.vx = 0.6; b.wy = 0.6 / R; // rolling, slow enough to stop before the far cushion
    w.runUntilSettled(30);
    const expected = 0.6 * 0.6 / (2 * PHYSICS.ROLL_DECEL);
    expect(b.x - -1.0).toBeCloseTo(expected, 2);
  });

  it('a sliding ball transitions to rolling at 5/7 of its initial speed (no spin start)', () => {
    const w = worldWith([0, -1.2, 0]);
    const b = w.getBall(0);
    b.vx = 3.0; // stun shot: no spin
    // run until slip vanishes
    let steps = 0;
    while (Math.abs(b.vx - R * b.wy) > 1e-3 && steps++ < 2000) w.step();
    expect(b.vx).toBeCloseTo((5 / 7) * 3.0, 1);
    expect(b.vx).toBeCloseTo(R * b.wy, 2);
  });

  it('backspin draws the ball back (reverses direction)', () => {
    const w = worldWith([0, 0, 0]);
    const b = w.getBall(0);
    applyCueStrike(b, { dirX: 1, dirY: 0, speed: 2.0, a: 0, b: -1 });
    expect(b.vx).toBeGreaterThan(0);
    const w2 = worldWith([0, 0, 0]);
    const b2 = w2.getBall(0);
    applyCueStrike(b2, { dirX: 1, dirY: 0, speed: 2.0, a: 0, b: -1 });
    let minVx = Infinity;
    w2.runUntilSettled(10, (ww) => { minVx = Math.min(minVx, ww.getBall(0).vx); return true; });
    expect(minVx).toBeLessThan(0);
  });

  it('is independent of the time step (analytic integration)', () => {
    const run = (n) => {
      const w = worldWith([0, -1, 0.1]);
      const b = w.getBall(0);
      applyCueStrike(b, { dirX: 1, dirY: 0.05, speed: 3, a: 0.3, b: 0.4 });
      for (let i = 0; i < n; i++) w.step(0.4 / n);
      return { x: b.x, y: b.y };
    };
    const a = run(24), c = run(96);
    expect(a.x).toBeCloseTo(c.x, 2);
    expect(a.y).toBeCloseTo(c.y, 2);
  });
});

describe('collisions', () => {
  it('head-on equal-mass collision transfers nearly all momentum (e = 0.95)', () => {
    const w = worldWith([0, -0.5, 0], [1, 0, 0]);
    const a = w.getBall(0);
    a.vx = 2; a.wy = 2 / R;
    while (!w.events.some((e) => e.type === 'ballHit') && w.time < 1) w.step();
    const b = w.getBall(1);
    // equal masses: object ball gets v (1 + e) / 2, cue ball keeps v (1 - e) / 2 (small friction loss in the step remainder)
    expect(b.vx).toBeCloseTo(2 * (1 + PHYSICS.RESTITUTION_BALL) / 2, 1);
    expect(a.vx).toBeLessThan(0.2);
  });

  it('a cut shot sends the object ball along the line of centres (30 degree cut)', () => {
    const w = worldWith([0, -0.5, 0], [1, 0, 0]);
    // aim so the cue ball hits the object ball with a 30 degree cut
    const cut = Math.PI / 6;
    const off = 2 * R * Math.sin(cut);
    const a = w.getBall(0);
    a.y = off; // offset the cue ball so contact normal is rotated by the cut angle
    a.vx = 3; a.wy = 3 / R;
    w.runUntilSettled(0.4);
    const b = w.getBall(1);
    const ang = Math.atan2(b.vy, b.vx);
    expect(Math.abs(ang)).toBeCloseTo(cut, 1);
  });

  it('conserves momentum within friction tolerance in a ball-ball hit', () => {
    const w = worldWith([0, -0.3, 0.01], [1, 0, 0]);
    const a = w.getBall(0), b = w.getBall(1);
    a.vx = 2; a.wy = 2 / R;
    const p0 = 2;
    // step until after contact
    while (!w.events.some((e) => e.type === 'ballHit') && w.time < 1) w.step();
    // restitution removes some normal momentum? No: equal masses conserve total momentum exactly.
    expect(a.vx + b.vx).toBeCloseTo(p0, 1); // friction acts on the remainder of the step
    expect(a.vy + b.vy).toBeCloseTo(0, 1);
  });

  it('reflects off a cushion with restitution < 1 and never leaves the table', () => {
    const w = worldWith([0, 0, 0.0]);
    const b = w.getBall(0);
    b.vx = 0; b.vy = 3; b.wx = -3 / R; // rolling towards the top long rail, away from the pockets
    b.x = 0.4;
    w.runUntilSettled(15);
    expect(w.events.some((e) => e.type === 'cushion')).toBe(true);
    expect(Math.abs(b.y)).toBeLessThan(TABLE.HALF_W);
  });

  it('balls never overlap or tunnel at break speed', () => {
    const w = new PhysicsWorld();
    for (const p of rackPositions(7)) w.addBall(p.id, p.x, p.y);
    const cue = w.addBall(0, TABLE.HEAD_STRING_X, 0);
    applyCueStrike(cue, { dirX: 1, dirY: 0, speed: PHYSICS.MAX_CUE_SPEED, a: 0, b: 0 });
    let minD = Infinity;
    let outside = false;
    w.runUntilSettled(40, (ww) => {
      const act = ww.balls.filter((b) => b.active);
      for (let i = 0; i < act.length; i++) {
        if (Math.abs(act[i].x) > TABLE.HALF_L + 0.1 || Math.abs(act[i].y) > TABLE.HALF_W + 0.1) outside = true;
        for (let j = i + 1; j < act.length; j++) minD = Math.min(minD, Math.hypot(act[i].x - act[j].x, act[i].y - act[j].y));
      }
      return true;
    });
    expect(minD).toBeGreaterThan(2 * R - 1e-3);
    expect(outside).toBe(false);
    expect(w.isSettled()).toBe(true);
    expect(w.events.filter((e) => e.type === 'ballHit').length).toBeGreaterThan(5);
  });
});

describe('pockets', () => {
  it('captures a ball driven into the corner pocket', () => {
    const w = worldWith([0, 0.9, 0.3]);
    const b = w.getBall(0);
    const dx = TABLE.HALF_L - 0.9, dy = TABLE.HALF_W - 0.3;
    const d = Math.hypot(dx, dy);
    b.vx = (dx / d) * 2; b.vy = (dy / d) * 2; b.wy = b.vx / R; b.wx = -b.vy / R;
    w.runUntilSettled(5);
    expect(b.active).toBe(false);
    expect(b.pocket).toBe(2);
  });

  it('captures a ball rolling straight into the side pocket', () => {
    const w = worldWith([0, 0.0, 0.2]);
    const b = w.getBall(0);
    b.vy = 1.5; b.wx = -1.5 / R;
    w.runUntilSettled(5);
    expect(b.active).toBe(false);
    expect([1, 4]).toContain(b.pocket);
  });

  it('rattles off the jaws instead of dropping when it hits the cushion edge', () => {
    const w = worldWith([0, 0.5, 0.0]);
    const b = w.getBall(0);
    // aim at the knuckle of the top-right corner jaw, centre line offset by one radius outside the mouth
    b.vy = 2; b.wx = -2 / R; b.x = TABLE.HALF_L - TABLE.CORNER_GAP * 1.9;
    b.vx = 0;
    w.runUntilSettled(1.5);
    expect(pocketIndexAt(b.x, b.y)).toBe(-1);
  });

  it('is deterministic: same initial state gives identical results', () => {
    const run = () => {
      const w = new PhysicsWorld();
      for (const p of rackPositions(3)) w.addBall(p.id, p.x, p.y);
      const cue = w.addBall(0, TABLE.HEAD_STRING_X, 0.02);
      applyCueStrike(cue, { dirX: 1, dirY: 0.01, speed: 5, a: 0.2, b: 0.1 });
      w.runUntilSettled(40);
      return w.balls.map((b) => [b.id, b.x.toFixed(9), b.y.toFixed(9), b.active]);
    };
    expect(run()).toEqual(run());
  });
});

describe('rack', () => {
  it('has 15 unique balls, 8-ball in the middle and mixed back corners', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const r = rackPositions(seed);
      expect(r).toHaveLength(15);
      expect(new Set(r.map((p) => p.id)).size).toBe(15);
      const eight = r.find((p) => p.id === 8);
      expect(eight.x).toBeCloseTo(TABLE.FOOT_SPOT_X + 2 * (Math.sqrt(3) * R + 1e-4), 6);
      expect(eight.y).toBeCloseTo(0, 6);
      const back = r.filter((p) => p.x > TABLE.FOOT_SPOT_X + 3.9 * Math.sqrt(3) * R).sort((a, b) => a.y - b.y);
      expect(groupOf(back[0].id)).not.toBe(groupOf(back[back.length - 1].id));
      for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) {
        expect(Math.hypot(r[i].x - r[j].x, r[i].y - r[j].y)).toBeGreaterThanOrEqual(2 * R);
      }
    }
  });
});

describe('cue impact', () => {
  it('centre-ball strike gives V = 2 v / (1 + m/M) and no spin', () => {
    const b = new PhysicsWorld().addBall(0, 0, 0);
    const V = applyCueStrike(b, { dirX: 1, dirY: 0, speed: 3, a: 0, b: 0 });
    expect(V).toBeCloseTo((2 * 3) / (1 + BALL.MASS / PHYSICS.CUE_MASS), 6);
    expect(b.wx).toBeCloseTo(0, 9); expect(b.wy).toBeCloseTo(0, 9); expect(b.wz).toBeCloseTo(0, 9);
  });

  it('natural-roll strike height (0.4 R) gives rolling without slip', () => {
    const b = new PhysicsWorld().addBall(0, 0, 0);
    applyCueStrike(b, { dirX: 1, dirY: 0, speed: 3, a: 0, b: 0.4 / PHYSICS.MAX_OFFSET_RATIO });
    expect(Math.abs(b.vx - R * b.wy)).toBeLessThan(0.02 * speed(b));
  });
});
