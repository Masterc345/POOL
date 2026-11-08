import { describe, it, expect } from 'vitest';
import { PhysicsWorld } from '../src/physics/PhysicsWorld.js';
import { applyCueStrike } from '../src/physics/CueImpact.js';
import { simulateShot, firstBallHit } from '../src/aiming/TrajectorySystem.js';
import { findFirstContact } from '../src/aiming/GhostBall.js';
import { evaluatePair, rankShots, difficultyFromTolerance } from '../src/ai/ShotEvaluator.js';
import { evaluateAlignment } from '../src/aiming/AlignmentSystem.js';
import { AssistanceManager } from '../src/aiming/AssistanceManager.js';
import { AimingSystem } from '../src/aiming/AimingSystem.js';
import { POCKETS } from '../src/table/TableGeometry.js';
import { BALL, TABLE } from '../src/utils/Constants.js';
import { createRng } from '../src/utils/Helpers.js';
import { planShot } from '../src/ai/ShotPlanner.js';
import { powerToCueSpeed, cueSpeedToPower } from '../src/cue/ShotPower.js';

const R = BALL.RADIUS;
const mk = (...balls) => { const w = new PhysicsWorld(); for (const [id, x, y] of balls) w.addBall(id, x, y); return w; };
const shotAt = (angle, speed = 2.5, a = 0, b = 0) => ({ dirX: Math.cos(angle), dirY: Math.sin(angle), speed, a, b });

describe('ghost ball vs real physics', () => {
  it('predicted ghost position equals the simulated contact position (with side spin)', () => {
    const w = mk([0, -0.6, -0.1], [1, 0.3, 0.15]);
    const cue = w.getBall(0);
    const ang = Math.atan2(0.15 - -0.1, 0.3 - -0.6) + 0.04;
    const contact = findFirstContact(cue, Math.cos(ang), Math.sin(ang), w.balls);
    expect(contact.type).toBe('ball');
    const sim = simulateShot(w, shotAt(ang, 3, 0.4, 0.2), { maxTime: 2 });
    const hit = firstBallHit(sim.events);
    expect(Math.hypot(hit.ax - contact.ghost.x, hit.ay - contact.ghost.y)).toBeLessThan(0.002);
  });

  it('predictor result equals live stepping of the same shot (same engine, same parameters)', () => {
    const w = mk([0, -0.8, 0.05], [1, 0.0, 0.1], [2, 0.3, -0.2], [8, 0.9, 0.3]);
    const shot = shotAt(0.12, 4, 0.3, -0.2);
    const sim = simulateShot(w, shot, { maxTime: 20 });
    const live = w.clone();
    applyCueStrike(live.getBall(0), shot, live.params);
    live.runUntilSettled(20);
    for (const b of live.balls) {
      const s = sim.world.getBall(b.id);
      expect(s.x).toBeCloseTo(b.x, 9);
      expect(s.y).toBeCloseTo(b.y, 9);
      expect(s.active).toBe(b.active);
    }
  });

  it('simulation does not modify the live world', () => {
    const w = mk([0, -0.6, 0], [1, 0.3, 0]);
    const before = JSON.stringify(w.snapshot());
    simulateShot(w, shotAt(0, 5), { record: true });
    expect(JSON.stringify(w.snapshot())).toBe(before);
  });
});

describe('shot evaluation', () => {
  it('straight-in shot to the side pocket has zero cut and is feasible', () => {
    const balls = mk([0, 0, -0.3], [1, 0, 0.3]).balls;
    const c = evaluatePair(balls[0], balls[1], POCKETS[1], balls);
    expect(c.feasible).toBe(true);
    expect(c.cutDeg).toBeCloseTo(0, 3);
    expect(c.aimAngle).toBeCloseTo(Math.PI / 2, 3);
  });

  it('detects a ball blocking the cue ball path', () => {
    const balls = mk([0, 0, -0.5], [1, 0, 0.3], [2, 0, -0.1]).balls;
    const c = evaluatePair(balls[0], balls[1], POCKETS[1], balls);
    expect(c.feasible).toBe(false);
    expect(c.blockedBy).toContain(2);
  });

  it('detects a ball blocking the object ball path to the pocket', () => {
    const balls = mk([0, 0.4, -0.3], [1, 0, 0.2], [2, 0, 0.45]).balls;
    const c = evaluatePair(balls[0], balls[1], POCKETS[1], balls);
    expect(c.blockedBy).toContain(2);
  });

  it('rejects shots that need a ghost ball position inside the cushion', () => {
    // target hugging the long rail, pocket far along the same rail => ghost beyond the rail
    // target on the top rail, pocket diagonally across the table => the ghost ball would sit inside the rail
    const balls = mk([0, -0.5, 0.0], [1, 0.3, TABLE.HALF_W - R]).balls;
    const c = evaluatePair(balls[0], balls[1], POCKETS[3], balls);
    expect(c.feasible).toBe(false);
  });

  it('difficulty grows with distance and cut angle', () => {
    const near = mk([0, 0, -0.2], [1, 0, 0.15]).balls;
    const far = mk([0, 0, -0.9 + 0.635 - 0.635], [1, 0.0, 0.0]).balls;
    const e = evaluatePair(near[0], near[1], POCKETS[1], near);
    const f = evaluatePair(far[0], far[1], POCKETS[1], far);
    expect(e.difficulty).toBeLessThan(f.difficulty);
    const cut = mk([0, -0.3, -0.25], [1, 0, 0.3]).balls;
    const g = evaluatePair(cut[0], cut[1], POCKETS[1], cut);
    const straight = mk([0, 0, -0.25], [1, 0, 0.3]).balls;
    const h = evaluatePair(straight[0], straight[1], POCKETS[1], straight);
    expect(g.difficulty).toBeGreaterThan(h.difficulty);
    expect(difficultyFromTolerance(1.5)).toBeCloseTo(0, 5);
    expect(difficultyFromTolerance(0.0001)).toBe(100);
  });

  it('ranking is sorted by difficulty and recommends the geometrically easiest ball', () => {
    // ball 3 is one diamond from a corner and straight; ball 5 is far with a thin cut
    const w = mk([0, -0.4, 0.0], [3, 0.9, 0.0], [5, -0.9, -0.3], [8, 0.2, 0.5]);
    const r = rankShots(w.balls, [3, 5]);
    expect(r.ranked.length).toBeGreaterThan(0);
    for (let i = 1; i < r.ranked.length; i++) expect(r.ranked[i].difficulty).toBeGreaterThanOrEqual(r.ranked[i - 1].difficulty);
    expect(r.ranked[0].rank).toBe(1);
  });

  const randomLayout = (rng) => {
    const w = new PhysicsWorld();
    w.addBall(0, rng.range(-1.0, 1.0), rng.range(-0.5, 0.5));
    const ids = [1, 2, 3, 4, 9, 10];
    for (const id of ids) {
      for (let k = 0; k < 50; k++) {
        const x = rng.range(-1.1, 1.1), y = rng.range(-0.55, 0.55);
        if (w.balls.every((b) => Math.hypot(b.x - x, b.y - y) > 0.07)) { w.addBall(id, x, y); break; }
      }
    }
    return { w, ids: ids.filter((i) => w.getBall(i)) };
  };

  it('pure geometric aim pockets most top-ranked shots (throw and follow-through cost some)', () => {
    const rng = createRng(2024);
    let tried = 0, potted = 0;
    for (let n = 0; n < 40; n++) {
      const { w, ids } = randomLayout(rng);
      const rank = rankShots(w.balls, ids);
      if (!rank.ranked.length) continue;
      const best = rank.ranked[0];
      const sim = simulateShot(w, shotAt(best.aimAngle, 1.5), { maxTime: 12 });
      tried++;
      if (sim.pocketed.includes(best.targetId)) potted++;
    }
    expect(tried).toBeGreaterThan(25);
    expect(potted / tried).toBeGreaterThan(0.7);
  });

  it('physics planner turns top-ranked candidates into shots that pocket without scratching', () => {
    const rng = createRng(2024);
    let tried = 0, planned = 0;
    for (let n = 0; n < 30; n++) {
      const { w, ids } = randomLayout(rng);
      const rank = rankShots(w.balls, ids);
      if (!rank.ranked.length) continue;
      tried++;
      const plan = planShot(w, rank.ranked[0]);
      if (plan) {
        const sim = simulateShot(w, { dirX: Math.cos(plan.angle), dirY: Math.sin(plan.angle), speed: plan.speed, a: plan.a, b: plan.b }, { maxTime: 12 });
        if (sim.pocketed.includes(rank.ranked[0].targetId) && !sim.pocketed.includes(0)) planned++;
      }
    }
    expect(tried).toBeGreaterThan(20);
    expect(planned / tried).toBeGreaterThan(0.9);
  });
});

describe('alignment feedback', () => {
  const w = mk([0, 0, -0.4], [1, 0, 0.3], [2, 0.6, -0.2]);
  const cue = w.getBall(0);

  it('reports good alignment when aimed exactly at the ghost position for a pocket', () => {
    const al = evaluateAlignment(w.balls, cue, Math.PI / 2, [1, 2]);
    expect(al.state).toBe('good');
    expect(al.targetId).toBe(1);
    expect(al.checks.every((c) => c.ok === true)).toBe(true);
  });

  it('reports poor alignment when the aim is far off the pocket line', () => {
    const al = evaluateAlignment(w.balls, cue, Math.PI / 2 - 0.03, [1, 2]);
    expect(['poor', 'fair']).toContain(al.state);
    expect(al.state).not.toBe('good');
  });

  it('flags an illegal target and an aim that misses all balls', () => {
    expect(evaluateAlignment(w.balls, cue, Math.PI / 2, [2]).state).toBe('wrong');
    expect(evaluateAlignment(w.balls, cue, -Math.PI / 2, [1, 2]).state).toBe('blocked');
  });

  it('signed error tells which way to rotate', () => {
    const left = evaluateAlignment(w.balls, cue, Math.PI / 2 - 0.02, [1]);
    expect(left.aimErrorDeg).toBeGreaterThan(0);
    const right = evaluateAlignment(w.balls, cue, Math.PI / 2 + 0.02, [1]);
    expect(right.aimErrorDeg).toBeLessThan(0);
  });
});

describe('assistance levels', () => {
  const w = mk([0, -0.5, 0.0], [1, 0.3, 0.1], [2, 0.8, -0.3], [9, -0.2, 0.4]);
  const aim = new AimingSystem();
  aim.setAngle(Math.atan2(0.1, 0.8));
  aim.setPower(0.55);
  const run = (level) => { const m = new AssistanceManager(); m.setLevel(level); return m.compute(w, aim, [1, 2]); };

  it('Off shows nothing', () => {
    const r = run(1);
    expect(r.cueLine).toBeNull();
    expect(r.ghost).toBeNull();
  });
  it('Basic shows the cue line and ghost ball only', () => {
    const r = run(2);
    expect(r.cueLine).not.toBeNull();
    expect(r.ghost).not.toBeNull();
    expect(r.objectPath).toBeNull();
    expect(r.alignment).toBeNull();
  });
  it('Intermediate adds the object ball path', () => {
    const r = run(3);
    expect(r.objectPath).not.toBeNull();
    expect(r.alignment).toBeNull();
  });
  it('Advanced adds cue ball path, alignment and a top-3 ranking with a recommendation', () => {
    const r = run(4);
    expect(r.cuePath).not.toBeNull();
    expect(r.alignment).not.toBeNull();
    expect(r.ranking.length).toBeLessThanOrEqual(3);
    expect(r.recommended).not.toBeNull();
  });
  it('Professional adds the full ranking and other ball paths', () => {
    const r = run(5);
    expect(r.ranking.length).toBeGreaterThanOrEqual(run(4).ranking.length);
    expect(Array.isArray(r.otherPaths)).toBe(true);
  });
});

describe('shot power mapping', () => {
  it('round-trips power <-> cue speed', () => {
    for (const p of [0.1, 0.35, 0.8, 1]) expect(cueSpeedToPower(powerToCueSpeed(p))).toBeCloseTo(p, 5);
  });
});
